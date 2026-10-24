"""
SafetyBroadcastService: Scalable Safety Check-Ins, Participant Registry,
Automated Expiration Handling, Manual Escalation, and Nearby Node Relay.
"""

import uuid
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import or_

from backend.app.database.models import (
    ParticipantRecord,
    SafetyBroadcastRecord,
    BroadcastRecipientRecord,
    SosIncidentRecord
)
from backend.app.schemas.sos import (
    ParticipantRegisterRequest,
    ParticipantOut,
    SafetyBroadcastCreateRequest,
    SafetyBroadcastOut,
    RecipientStateOut,
    SafetyResponseRequest,
    ManualEscalationRequest,
    SosRelayRequest,
    SosIncidentOut
)
from backend.app.services.sos_service import SosService
from backend.app.geography_kerala import KERALA_DISTRICTS


class SafetyBroadcastService:

    @staticmethod
    def register_participant(req: ParticipantRegisterRequest, db: Session) -> ParticipantOut:
        """
        Register or update a participant handset.
        Idempotent on device_id or explicit participant ID.
        """
        # Lookup existing by ID or device_id
        record = None
        if req.id:
            record = db.query(ParticipantRecord).filter(ParticipantRecord.id == req.id).first()
        if not record and req.device_id:
            record = db.query(ParticipantRecord).filter(ParticipantRecord.device_id == req.device_id).first()

        now = datetime.utcnow()
        district_id = req.district_id if req.district_id in KERALA_DISTRICTS else "ernakulam"

        if record:
            record.name = req.name
            if req.phone_number:
                record.phone_number = req.phone_number
            record.district_id = district_id
            record.device_id = req.device_id
            record.last_active_at = now
            if req.latitude is not None and req.longitude is not None:
                record.last_latitude = req.latitude
                record.last_longitude = req.longitude
                record.last_location_accuracy_m = req.accuracy_m
                record.last_location_timestamp = now
        else:
            p_id = req.id or f"part_{uuid.uuid4().hex[:8]}"
            record = ParticipantRecord(
                id=p_id,
                name=req.name,
                phone_number=req.phone_number,
                district_id=district_id,
                device_id=req.device_id,
                registered_at=now,
                last_active_at=now,
                last_latitude=req.latitude,
                last_longitude=req.longitude,
                last_location_accuracy_m=req.accuracy_m,
                last_location_timestamp=now if (req.latitude is not None) else None
            )
            db.add(record)

        db.commit()
        db.refresh(record)
        return SafetyBroadcastService._to_participant_out(record)

    @staticmethod
    def list_participants(district_id: Optional[str], db: Session) -> List[ParticipantOut]:
        query = db.query(ParticipantRecord)
        if district_id and district_id != "all":
            query = query.filter(ParticipantRecord.district_id == district_id)
        participants = query.order_by(ParticipantRecord.last_active_at.desc()).all()
        return [SafetyBroadcastService._to_participant_out(p) for p in participants]

    @staticmethod
    def get_participants(district_id: Optional[str], db: Session) -> List[ParticipantOut]:
        return SafetyBroadcastService.list_participants(district_id, db)

    @staticmethod
    def create_broadcast(req: SafetyBroadcastCreateRequest, db: Session) -> SafetyBroadcastOut:
        """
        Create a new safety broadcast targeted to all, a district, or selected participants.
        Supports any practical number of participants (no hardcoded limits).
        """
        now = datetime.utcnow()
        bc_id = f"BC-KL-{uuid.uuid4().hex[:6].upper()}"
        expires_at = now + timedelta(seconds=req.deadline_seconds)

        broadcast = SafetyBroadcastRecord(
            id=bc_id,
            title=req.title,
            message=req.message,
            severity=req.severity,
            district_id=req.district_id if req.district_id != "all" else None,
            target_participant_ids=req.target_participant_ids or [],
            created_at=now,
            deadline_seconds=req.deadline_seconds,
            expires_at=expires_at,
            created_by=req.created_by,
            status="ACTIVE"
        )
        db.add(broadcast)

        # Select recipients
        p_query = db.query(ParticipantRecord)
        if req.target_participant_ids and len(req.target_participant_ids) > 0:
            p_query = p_query.filter(ParticipantRecord.id.in_(req.target_participant_ids))
        elif req.district_id and req.district_id != "all":
            p_query = p_query.filter(ParticipantRecord.district_id == req.district_id)

        recipients = p_query.all()

        for p in recipients:
            loc_status = "AVAILABLE" if (p.last_latitude is not None and p.last_longitude is not None) else "LOCATION UNAVAILABLE"
            rcpt = BroadcastRecipientRecord(
                id=f"{bc_id}_{p.id}",
                broadcast_id=bc_id,
                participant_id=p.id,
                participant_name=p.name,
                district_id=p.district_id,
                delivery_status="PENDING",
                delivered_at=None,
                delivery_channel="POLL",
                safety_status="AWAITING RESPONSE",
                responded_at=None,
                response_message=None,
                reported_latitude=p.last_latitude,
                reported_longitude=p.last_longitude,
                reported_accuracy_m=p.last_location_accuracy_m,
                location_status=loc_status,
                is_escalated=False,
                escalated_incident_id=None,
                escalated_at=None,
                escalated_by=None,
                escalation_reason=None,
                updated_at=now
            )
            db.add(rcpt)

        db.commit()
        db.refresh(broadcast)

        return SafetyBroadcastService.get_broadcast(bc_id, db)

    @staticmethod
    def get_broadcast(broadcast_id: str, db: Session) -> SafetyBroadcastOut:
        """
        Fetch broadcast with lazy expiration evaluation and aggregate statistics.
        """
        bc = db.query(SafetyBroadcastRecord).filter(SafetyBroadcastRecord.id == broadcast_id).first()
        if not bc:
            raise ValueError(f"Safety broadcast '{broadcast_id}' not found.")

        # Evaluate expiration
        now = datetime.utcnow()
        if bc.status == "ACTIVE" and now >= bc.expires_at:
            bc.status = "EXPIRED"
            # Update all unanswered recipients to 'NO RESPONSE — VERIFY SAFETY'
            db.query(BroadcastRecipientRecord).filter(
                BroadcastRecipientRecord.broadcast_id == bc.id,
                BroadcastRecipientRecord.safety_status == "AWAITING RESPONSE"
            ).update(
                {
                    BroadcastRecipientRecord.safety_status: "NO RESPONSE — VERIFY SAFETY",
                    BroadcastRecipientRecord.updated_at: now
                },
                synchronize_session=False
            )
            db.commit()
            db.refresh(bc)

        recipients = db.query(BroadcastRecipientRecord).filter(
            BroadcastRecipientRecord.broadcast_id == bc.id
        ).all()

        total = len(recipients)
        safe = sum(1 for r in recipients if r.safety_status == "SAFE CONFIRMED")
        help_req = sum(1 for r in recipients if r.safety_status == "HELP REQUESTED")
        awaiting = sum(1 for r in recipients if r.safety_status == "AWAITING RESPONSE")
        no_resp = sum(1 for r in recipients if r.safety_status in ("NO RESPONSE — VERIFY SAFETY", "EXPIRED"))
        escalated = sum(1 for r in recipients if r.is_escalated)

        rem_secs = max(0, int((bc.expires_at - now).total_seconds()))

        rcpt_outs = [SafetyBroadcastService._to_recipient_state_out(r) for r in recipients]

        return SafetyBroadcastOut(
            id=bc.id,
            title=bc.title,
            message=bc.message,
            severity=bc.severity,
            district_id=bc.district_id,
            created_at=bc.created_at.isoformat() + "Z",
            deadline_seconds=bc.deadline_seconds,
            expires_at=bc.expires_at.isoformat() + "Z",
            created_by=bc.created_by,
            status=bc.status,
            total_recipients=total,
            safe_count=safe,
            help_requested_count=help_req,
            awaiting_count=awaiting,
            no_response_count=no_resp,
            escalated_count=escalated,
            seconds_remaining=rem_secs,
            recipients=rcpt_outs
        )

    @staticmethod
    def list_broadcasts(district_id: Optional[str], db: Session) -> List[SafetyBroadcastOut]:
        query = db.query(SafetyBroadcastRecord)
        if district_id and district_id != "all":
            query = query.filter(
                or_(SafetyBroadcastRecord.district_id == district_id, SafetyBroadcastRecord.district_id.is_(None))
            )
        bcs = query.order_by(SafetyBroadcastRecord.created_at.desc()).all()
        return [SafetyBroadcastService.get_broadcast(b.id, db) for b in bcs]

    @staticmethod
    def get_broadcasts(db: Session, district_id: Optional[str] = None) -> List[SafetyBroadcastOut]:
        return SafetyBroadcastService.list_broadcasts(district_id, db)

    @staticmethod
    def get_active_broadcast_for_device(
        participant_id: Optional[str],
        device_id: Optional[str],
        district_id: Optional[str],
        db: Session
    ) -> Optional[SafetyBroadcastOut]:
        """
        Device polling endpoint: checks if there is an active, unexpired safety broadcast.
        Automatically acknowledges delivery to device upon fetch (DELIVERED_TO_DEVICE).
        """
        part = None
        if participant_id:
            part = db.query(ParticipantRecord).filter(ParticipantRecord.id == participant_id).first()
        if not part and device_id:
            part = db.query(ParticipantRecord).filter(ParticipantRecord.device_id == device_id).first()

        if not part:
            return None

        now = datetime.utcnow()
        part.last_active_at = now

        # Find active broadcast with open recipient record
        rec = db.query(BroadcastRecipientRecord).join(
            SafetyBroadcastRecord, BroadcastRecipientRecord.broadcast_id == SafetyBroadcastRecord.id
        ).filter(
            BroadcastRecipientRecord.participant_id == part.id,
            SafetyBroadcastRecord.status == "ACTIVE",
            SafetyBroadcastRecord.expires_at > now
        ).first()

        if not rec:
            db.commit()
            return None

        # Mark delivered to device
        if rec.delivery_status == "PENDING":
            rec.delivery_status = "DELIVERED_TO_DEVICE"
            rec.delivered_at = now
            rec.updated_at = now

        db.commit()
        db.refresh(rec)

        return SafetyBroadcastService.get_broadcast(rec.broadcast_id, db)

    @staticmethod
    def get_active_for_device(
        participant_id: Optional[str],
        device_id: Optional[str],
        db: Session
    ) -> Optional[Dict[str, Any]]:
        """
        Poll endpoint for Android handset to check for active safety broadcast.
        Transitions delivery state to DELIVERED_TO_DEVICE upon receipt.
        """
        part = None
        if participant_id:
            part = db.query(ParticipantRecord).filter(ParticipantRecord.id == participant_id).first()
        if not part and device_id:
            part = db.query(ParticipantRecord).filter(ParticipantRecord.device_id == device_id).first()

        if not part:
            return None

        now = datetime.utcnow()
        part.last_active_at = now

        # Find active broadcast with open recipient record
        rec = db.query(BroadcastRecipientRecord).join(
            SafetyBroadcastRecord, BroadcastRecipientRecord.broadcast_id == SafetyBroadcastRecord.id
        ).filter(
            BroadcastRecipientRecord.participant_id == part.id,
            SafetyBroadcastRecord.status == "ACTIVE",
            SafetyBroadcastRecord.expires_at > now
        ).first()

        if not rec:
            db.commit()
            return None

        # Mark delivered to device
        if rec.delivery_status == "PENDING":
            rec.delivery_status = "DELIVERED_TO_DEVICE"
            rec.delivered_at = now
            rec.updated_at = now

        db.commit()
        db.refresh(rec)

        bc = db.query(SafetyBroadcastRecord).filter(SafetyBroadcastRecord.id == rec.broadcast_id).first()
        rem_secs = max(0, int((bc.expires_at - now).total_seconds()))

        return {
            "broadcastId": bc.id,
            "title": bc.title,
            "message": bc.message,
            "severity": bc.severity,
            "createdAt": bc.created_at.isoformat() + "Z",
            "expiresAt": bc.expires_at.isoformat() + "Z",
            "secondsRemaining": rem_secs,
            "participantId": part.id,
            "deliveryStatus": rec.delivery_status,
            "safetyStatus": rec.safety_status,
            "hasResponded": rec.safety_status in ("SAFE CONFIRMED", "HELP REQUESTED")
        }

    @staticmethod
    def record_safety_response(
        broadcast_id: str,
        req: SafetyResponseRequest,
        db: Session
    ) -> RecipientStateOut:
        """
        Record participant safety confirmation or distress request.
        Only marks SAFE CONFIRMED when validly submitted.
        If HELP REQUESTED, creates or links an official SOS incident immediately.
        """
        rec = db.query(BroadcastRecipientRecord).filter(
            BroadcastRecipientRecord.broadcast_id == broadcast_id,
            BroadcastRecipientRecord.participant_id == req.participant_id
        ).first()

        if not rec:
            raise ValueError(f"Recipient record for participant '{req.participant_id}' in broadcast '{broadcast_id}' not found.")

        now = datetime.utcnow()
        status_norm = req.status.strip().upper()
        if "HELP" in status_norm:
            status_clean = "HELP REQUESTED"
        elif "SAFE" in status_norm:
            status_clean = "SAFE CONFIRMED"
        else:
            status_clean = status_norm

        rec.safety_status = status_clean
        rec.delivery_status = "ACKNOWLEDGED"
        rec.responded_at = now
        rec.response_message = req.message
        rec.updated_at = now

        if req.latitude is not None and req.longitude is not None:
            rec.reported_latitude = req.latitude
            rec.reported_longitude = req.longitude
            rec.reported_accuracy_m = req.accuracy_m
            rec.location_status = "AVAILABLE"

            # Update participant profile location
            part = db.query(ParticipantRecord).filter(ParticipantRecord.id == req.participant_id).first()
            if part:
                part.last_latitude = req.latitude
                part.last_longitude = req.longitude
                part.last_location_accuracy_m = req.accuracy_m
                part.last_location_timestamp = now
                part.last_active_at = now
        else:
            rec.location_status = "LOCATION UNAVAILABLE"

        # If citizen clicked 'I NEED HELP', create or link urgent SOS incident
        if status_clean == "HELP REQUESTED":
            # Check if already escalated to avoid duplicates
            if not rec.escalated_incident_id:
                incident_id = f"SOS-HELP-{uuid.uuid4().hex[:6].upper()}"
                desc = req.message or f"Distress flagged during Safety Broadcast '{broadcast_id}'. Immediate rescue requested."
                
                # Dynamic priority
                score, level, reasons = SosService.calculate_priority(
                    severity=req.severity or "CRITICAL",
                    people_count=req.people_count,
                    has_vulnerable=req.has_vulnerable_people,
                    district_id=rec.district_id
                )
                reasons.append(f"Direct Help Request via Safety Broadcast #{broadcast_id}")

                sos_rec = SosIncidentRecord(
                    id=incident_id,
                    message_id=f"MSG-HELP-{uuid.uuid4().hex[:8]}",
                    district_id=rec.district_id,
                    district_name=rec.district_id.capitalize(),
                    location_name=f"{rec.participant_name or req.participant_id} - Safety Broadcast Sector",
                    created_at=now,
                    latitude=req.latitude or rec.reported_latitude,
                    longitude=req.longitude or rec.reported_longitude,
                    location_accuracy_m=req.accuracy_m or rec.reported_accuracy_m,
                    category="help_requested",
                    description=desc,
                    people_count=req.people_count,
                    vulnerability_flags=["vulnerable_population"] if req.has_vulnerable_people else [],
                    priority_score=max(85, score),
                    priority_level="CRITICAL",
                    priority_reasons=reasons,
                    response_status="unassigned",
                    delivery_status="received",
                    origin_device_id=req.participant_id,
                    participant_id=req.participant_id,
                    broadcast_id=broadcast_id,
                    delivery_channel="INTERNET",
                    updated_at=now
                )
                db.add(sos_rec)

                rec.is_escalated = True
                rec.escalated_incident_id = incident_id
                rec.escalated_at = now
                rec.escalated_by = "Automatic Safety Broadcast Escalation"
                rec.escalation_reason = desc

        db.commit()
        db.refresh(rec)
        return SafetyBroadcastService._to_recipient_state_out(rec)

    @staticmethod
    def manually_escalate(
        broadcast_id: str,
        participant_id: str,
        req: ManualEscalationRequest,
        db: Session
    ) -> RecipientStateOut:
        """
        Manually escalate an unresponsive participant to an active SOS rescue case.
        """
        rec = db.query(BroadcastRecipientRecord).filter(
            BroadcastRecipientRecord.broadcast_id == broadcast_id,
            BroadcastRecipientRecord.participant_id == participant_id
        ).first()

        if not rec:
            raise ValueError(f"Participant '{participant_id}' in broadcast '{broadcast_id}' not found.")

        if rec.is_escalated and rec.escalated_incident_id:
            return SafetyBroadcastService._to_recipient_state_out(rec)

        now = datetime.utcnow()
        incident_id = f"SOS-ESC-{uuid.uuid4().hex[:6].upper()}"
        desc = (
            f"[MANUAL ESCALATION - WELFARE CHECK] Participant '{rec.participant_name or participant_id}' non-responsive "
            f"to safety check (NO RESPONSE). Reason: {req.reason}"
        )

        sos_rec = SosIncidentRecord(
            id=incident_id,
            message_id=f"MSG-ESC-{uuid.uuid4().hex[:8]}",
            district_id=rec.district_id,
            district_name=rec.district_id.capitalize(),
            location_name=f"{rec.participant_name or participant_id} (Unresponsive Location)",
            created_at=now,
            latitude=rec.reported_latitude,
            longitude=rec.reported_longitude,
            location_accuracy_m=rec.reported_accuracy_m,
            category="welfare_check_escalation",
            description=desc,
            people_count=1,
            vulnerability_flags=["unresponsive_escalation"],
            priority_score=88,
            priority_level="HIGH",
            priority_reasons=[
                "Unresponsive to Safety Broadcast deadline",
                "Human responder initiated manual welfare check"
            ],
            response_status="unassigned",
            delivery_status="received",
            origin_device_id=participant_id,
            participant_id=participant_id,
            broadcast_id=broadcast_id,
            delivery_channel="ESCALATED_BY_COMMAND",
            updated_at=now
        )
        db.add(sos_rec)

        rec.is_escalated = True
        rec.escalated_incident_id = incident_id
        rec.escalated_at = now
        rec.escalated_by = req.escalated_by
        rec.escalation_reason = req.reason
        rec.updated_at = now

        db.commit()
        db.refresh(rec)
        return SafetyBroadcastService._to_recipient_state_out(rec)

    @staticmethod
    def ingest_relay_sos(req: SosRelayRequest, db: Session) -> SosIncidentOut:
        """
        Ingest SOS beacon relayed through a neighboring node.
        Preserves original origin location and timestamp, whilst tracking relay node identity.
        """
        # Deduplication on message_id
        existing = db.query(SosIncidentRecord).filter(
            SosIncidentRecord.message_id == req.original_message_id
        ).first()
        if existing:
            return SosService._to_incident_out(existing)

        # Hop limit enforcement (prevent loops / broadcast storm)
        if req.hop_count > 3:
            raise ValueError(f"Exceeded maximum hop limit (3). Packet has {req.hop_count} hops; forwarding terminated.")

        now = datetime.utcnow()

        # Stale/Expired packet rejection (TTL: 24 hours)
        orig_created_at = now
        if req.original_timestamp:
            try:
                orig_created_at = datetime.fromisoformat(req.original_timestamp.replace("Z", "+00:00")).replace(tzinfo=None)
                age_seconds = (now - orig_created_at).total_seconds()
                if age_seconds > 86400:
                    raise ValueError(f"Relayed distress beacon has expired ({int(age_seconds / 3600)}h old). Forwarding terminated.")
            except ValueError as ve:
                if "expired" in str(ve):
                    raise

        district_id = req.district_id
        if not district_id or district_id not in KERALA_DISTRICTS:
            district_id = SosService.resolve_district_for_coordinates(
                req.original_latitude, req.original_longitude
            )

        district_name = KERALA_DISTRICTS[district_id].name if district_id in KERALA_DISTRICTS else district_id.capitalize()

        score, level, reasons = SosService.calculate_priority(
            severity=req.severity,
            people_count=req.people_count,
            has_vulnerable=req.has_vulnerable_people,
            district_id=district_id,
            message_text=req.message_text,
            category=req.category,
            has_location=(req.original_latitude is not None and req.original_longitude is not None)
        )
        reasons.append(f"Relayed via neighboring peer node: {req.relay_node_id} (Hop: {req.hop_count})")

        inc_id = req.original_incident_id or f"SOS-RELAY-{uuid.uuid4().hex[:6].upper()}"

        record = SosIncidentRecord(
            id=inc_id,
            message_id=req.original_message_id,
            district_id=district_id,
            district_name=district_name,
            location_name=f"{district_name} Peer Mesh Relayed Zone",
            created_at=orig_created_at,
            latitude=req.original_latitude,
            longitude=req.original_longitude,
            location_accuracy_m=req.original_accuracy_m,
            category=req.category or "trapped",
            description=req.message_text,
            people_count=req.people_count,
            vulnerability_flags=["vulnerable_population"] if req.has_vulnerable_people else [],
            priority_score=score,
            priority_level=level,
            priority_reasons=reasons,
            response_status="unassigned",
            delivery_status="ACKNOWLEDGED_BY_SERVER",
            acknowledged_by_server_at=now,
            hop_count=req.hop_count,
            origin_device_id=req.origin_device_id,
            participant_id=req.participant_id,
            relay_node_id=req.relay_node_id,
            relayed_at=now,
            delivery_channel="RELAYED_BLE_MESH",
            updated_at=now
        )
        db.add(record)
        db.commit()
        db.refresh(record)

        return SosService._to_incident_out(record)

    @staticmethod
    def _to_participant_out(p: ParticipantRecord) -> ParticipantOut:
        return ParticipantOut(
            id=p.id,
            name=p.name,
            phone_number=p.phone_number,
            district_id=p.district_id,
            device_id=p.device_id,
            registered_at=p.registered_at.isoformat() + "Z",
            last_active_at=p.last_active_at.isoformat() + "Z",
            last_latitude=p.last_latitude,
            last_longitude=p.last_longitude,
            last_location_accuracy_m=p.last_location_accuracy_m,
            last_location_timestamp=p.last_location_timestamp.isoformat() + "Z" if p.last_location_timestamp else None
        )

    @staticmethod
    def manual_escalate(
        broadcast_id: str,
        req: ManualEscalationRequest,
        db: Session
    ) -> RecipientStateOut:
        return SafetyBroadcastService.manually_escalate(broadcast_id, req.participant_id, req, db)

    @staticmethod
    def _to_recipient_state_out(r: BroadcastRecipientRecord) -> RecipientStateOut:
        return RecipientStateOut(
            broadcast_id=r.broadcast_id,
            participant_id=r.participant_id,
            participant_name=r.participant_name,
            district_id=r.district_id,
            delivery_status=r.delivery_status,
            delivered_at=r.delivered_at.isoformat() + "Z" if r.delivered_at else None,
            delivery_channel=r.delivery_channel or "POLL",
            safety_status=r.safety_status,
            responded_at=r.responded_at.isoformat() + "Z" if r.responded_at else None,
            response_message=r.response_message,
            reported_latitude=r.reported_latitude,
            reported_longitude=r.reported_longitude,
            reported_accuracy_m=r.reported_accuracy_m,
            last_known_latitude=r.reported_latitude,
            last_known_longitude=r.reported_longitude,
            last_known_location_timestamp=r.responded_at.isoformat() + "Z" if r.responded_at else (r.delivered_at.isoformat() + "Z" if r.delivered_at else None),
            location_status=r.location_status or "AVAILABLE",
            is_escalated=r.is_escalated,
            escalated_incident_id=r.escalated_incident_id,
            linked_sos_id=r.escalated_incident_id,
            escalated_at=r.escalated_at.isoformat() + "Z" if r.escalated_at else None
        )
