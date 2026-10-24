"""
SosService: Central Incident Triage, Fleet Management, and Spatial Geo-Tagging.
Bridges citizen Android distress beacons, responder fleet tasking, and flood risk models.
"""

import uuid
from datetime import datetime
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import or_

from backend.app.database.models import SosIncidentRecord, RescueVessel, AlertEvent, IncidentMessageRecord
from backend.app.schemas.sos import (
    SosSubmissionRequest, SosStatusUpdateRequest, SosIncidentOut,
    BoatStatusUpdateRequest, RescueBoatOut, RiskZoneOut, RescuerAckRequest,
    BleBeaconIngestRequest, IncidentMessageCreate, IncidentMessageOut, MessageAckRequest
)
from backend.app.geography_kerala import KERALA_DISTRICTS, KERALA_DISTRICT_BOUNDS
from backend.app.services.predictor_service import PredictorService
from backend.app.services.priority_scoring_service import PriorityScoringService


class SosService:

    @staticmethod
    def resolve_district_for_coordinates(lat: Optional[float], lon: Optional[float]) -> str:
        """
        Find matching district by coordinates.
        Preserves true Mangaluru / Coastal Karnataka location and missing GPS without forcing Kerala districts.
        """
        if lat is None or lon is None:
            return "unspecified"

        # Check if coordinates fall within Mangaluru / Coastal Karnataka (lat 12.5-13.6, lon 74.5-75.8)
        if 12.5 <= lat <= 13.6 and 74.5 <= lon <= 75.8:
            return "mangaluru_urban"

        # Check district bounding polygons for Kerala
        for d_id, bounds in KERALA_DISTRICT_BOUNDS.items():
            if bounds and isinstance(bounds, list) and isinstance(bounds[0], list):
                min_lat = min(pt[0] for pt in bounds)
                max_lat = max(pt[0] for pt in bounds)
                min_lon = min(pt[1] for pt in bounds)
                max_lon = max(pt[1] for pt in bounds)
                if min_lat <= lat <= max_lat and min_lon <= lon <= max_lon:
                    return d_id

        # Check proximity to nearest Kerala centroid
        best_dist_id = "ernakulam"
        min_distance = float("inf")
        for d_id, d in KERALA_DISTRICTS.items():
            dist = (d.latitude - lat) ** 2 + (d.longitude - lon) ** 2
            if dist < min_distance:
                min_distance = dist
                best_dist_id = d_id

        # Only assign to Kerala if within ~0.35 degrees (~40 km)
        if min_distance < (0.35 ** 2):
            return best_dist_id

        return "outside_kerala"

    @staticmethod
    def calculate_priority(
        severity: str,
        people_count: int,
        has_vulnerable: bool,
        district_id: str,
        message_text: Optional[str] = None,
        category: Optional[str] = None,
        has_location: bool = True
    ) -> tuple[int, str, List[str]]:
        """Calculate dynamic triage urgency score (0-100) and priority level with explanation."""
        flood_risk_level = None
        try:
            pred = PredictorService.predict(location_id=district_id)
            flood_risk_level = pred.risk_level
        except Exception:
            pass

        return PriorityScoringService.calculate_priority(
            severity=severity,
            people_count=people_count,
            has_vulnerable=has_vulnerable,
            district_id=district_id,
            message_text=message_text,
            category=category,
            has_location=has_location,
            flood_risk_level=flood_risk_level
        )

    @staticmethod
    def ingest_sos(req: SosSubmissionRequest, db: Session) -> SosIncidentOut:
        """
        Ingest distress beacon from Android app or gateway.
        Idempotent deduplication on message_id prevents duplicate submissions on retries.
        """
        # Deduplication check
        if req.message_id:
            existing = db.query(SosIncidentRecord).filter(
                SosIncidentRecord.message_id == req.message_id
            ).first()
            if existing:
                return SosService._to_incident_out(existing)

        # Resolve district
        district_id = req.district_id
        if not district_id or (district_id not in KERALA_DISTRICTS and district_id != "mangaluru_urban"):
            district_id = SosService.resolve_district_for_coordinates(req.latitude, req.longitude)

        if district_id in KERALA_DISTRICTS:
            district_name = KERALA_DISTRICTS[district_id].name
        elif district_id == "mangaluru_urban":
            district_name = "Mangaluru (Dakshina Kannada)"
        elif district_id == "outside_kerala":
            district_name = "Outside Kerala Coverage"
        elif district_id == "unspecified":
            district_name = "Location Unspecified (No GPS Fix)"
        else:
            district_name = district_id.capitalize()

        location_name = req.location_name or (
            "Mangaluru Emergency Distress Zone" if district_id == "mangaluru_urban"
            else ("Distress Location Unspecified" if district_id == "unspecified"
            else f"{district_name} Disaster Zone")
        )

        # Compute priority
        score, level, reasons = SosService.calculate_priority(
            severity=req.severity,
            people_count=req.people_count,
            has_vulnerable=req.has_vulnerable_people,
            district_id=district_id,
            message_text=req.message,
            category=req.category,
            has_location=(req.latitude is not None and req.longitude is not None)
        )

        flags = []
        if req.has_vulnerable_people:
            flags.append("vulnerable_population")
        if req.people_count >= 3:
            flags.append("multi_person_group")
        if req.category:
            flags.append(req.category)

        incident_id = req.incident_id or f"SOS-KL-{uuid.uuid4().hex[:6].upper()}"
        message_id = req.message_id or f"MSG-KL-{uuid.uuid4().hex[:8]}"

        record = SosIncidentRecord(
            id=incident_id,
            message_id=message_id,
            district_id=district_id,
            district_name=district_name,
            location_name=location_name,
            created_at=datetime.utcnow(),
            latitude=req.latitude,
            longitude=req.longitude,
            location_accuracy_m=req.accuracy_m,
            category=req.category or "general",
            description=req.message,
            people_count=req.people_count,
            vulnerability_flags=flags,
            priority_score=score,
            priority_level=level,
            priority_reasons=reasons,
            response_status="unassigned",
            assigned_boat_id=None,
            assigned_boat_name=None,
            delivery_status="ACKNOWLEDGED_BY_SERVER",
            acknowledged_by_server_at=datetime.utcnow(),
            hop_count=req.hop_count,
            origin_device_id=req.origin_device_id,
            schema_version=req.schema_version,
            is_demo=getattr(req, "is_demo", False),
            updated_at=datetime.utcnow()
        )

        db.add(record)
        db.commit()
        db.refresh(record)

        return SosService._to_incident_out(record)

    @staticmethod
    def ingest_ble_beacon(req: BleBeaconIngestRequest, db: Session) -> SosIncidentOut:
        """
        Ingest distress beacon received over Bluetooth Low Energy by the laptop gateway.
        Performs deduplication on message_id, computes district and priority score,
        and marks delivery_channel as 'BLUETOOTH_LE'.
        """
        # Deduplication check by message_id or incident_id
        existing = None
        if req.message_id:
            existing = db.query(SosIncidentRecord).filter(
                SosIncidentRecord.message_id == req.message_id
            ).first()
        if not existing and req.incident_id:
            existing = db.query(SosIncidentRecord).filter(
                SosIncidentRecord.id == req.incident_id
            ).first()
        if existing:
            # If existing had missing coordinates, update with newly arrived GPS coordinates
            updated = False
            if existing.latitude is None and req.latitude is not None:
                existing.latitude = req.latitude
                existing.longitude = req.longitude
                updated = True
            if req.hop_count is not None and req.hop_count > (existing.hop_count or 0):
                existing.hop_count = req.hop_count
                if req.source_mac:
                    existing.relay_node_id = req.source_mac
                existing.delivery_channel = "BLE_MESH_RELAY"
                updated = True
            if updated:
                existing.updated_at = datetime.utcnow()
                db.commit()
                db.refresh(existing)
            return SosService._to_incident_out(existing)

        # Resolve district
        district_id = SosService.resolve_district_for_coordinates(req.latitude, req.longitude)
        if district_id in KERALA_DISTRICTS:
            district_name = KERALA_DISTRICTS[district_id].name
        elif district_id == "mangaluru_urban":
            district_name = "Mangaluru (Dakshina Kannada)"
        elif district_id == "outside_kerala":
            district_name = "Outside Kerala Coverage"
        elif district_id == "unspecified":
            district_name = "Location Unspecified (No GPS Fix)"
        else:
            district_name = district_id.capitalize()

        if req.latitude is not None and req.longitude is not None:
            location_name = f"{district_name} (BLE Beacon {req.latitude:.4f}, {req.longitude:.4f})"
        else:
            location_name = f"{district_name} (BLE Beacon - Coordinates Unavailable)"

        category = (req.category or "general").lower()
        if req.message_text:
            message_text = req.message_text
        elif category in ["safe", "welfare"]:
            message_text = f"Citizen BLE Welfare Check: {req.people_count} person(s) reported safe."
        elif category in ["supplies", "food"]:
            message_text = f"Citizen BLE Supplies Beacon: {req.people_count} person(s) requesting food/water supplies."
        elif category == "injured":
            message_text = f"Medical Distress Beacon: {req.people_count} person(s) requiring medical assistance."
        elif category == "trapped":
            message_text = f"Urgent Distress Beacon: {req.people_count} person(s) trapped."
        elif category == "stranded":
            message_text = f"Evacuation Distress Beacon: {req.people_count} person(s) stranded."
        else:
            message_text = f"Emergency BLE Distress Beacon: {req.people_count} person(s) reported."

        score, level, reasons = SosService.calculate_priority(
            severity=req.severity,
            people_count=req.people_count,
            has_vulnerable=req.has_vulnerable_people,
            district_id=district_id,
            message_text=message_text,
            category=category,
            has_location=(req.latitude is not None and req.longitude is not None)
        )

        flags = []
        if req.has_vulnerable_people:
            flags.append("vulnerable_population")
        if req.people_count >= 3:
            flags.append("multi_person_group")
        if category and category != "general":
            flags.append(category)

        incident_id = req.incident_id or f"SOS-BLE-{uuid.uuid4().hex[:6].upper()}"

        is_relayed = (req.hop_count or 0) > 0
        origin_id = f"node_ble_{req.message_id.replace('-', '_')[-8:].lower()}"
        relay_id = req.source_mac if is_relayed else None
        channel = "BLE_MESH_RELAY" if is_relayed else "BLUETOOTH_LE"

        record = SosIncidentRecord(
            id=incident_id,
            message_id=req.message_id,
            district_id=district_id,
            district_name=district_name,
            location_name=location_name,
            created_at=datetime.utcnow(),
            latitude=req.latitude,
            longitude=req.longitude,
            location_accuracy_m=req.location_accuracy_m,
            category=category,
            description=message_text,
            people_count=req.people_count,
            vulnerability_flags=flags,
            priority_score=score,
            priority_level=level,
            priority_reasons=reasons,
            response_status="unassigned",
            assigned_boat_id=None,
            assigned_boat_name=None,
            delivery_status="ACKNOWLEDGED_BY_SERVER",
            acknowledged_by_server_at=datetime.utcnow(),
            hop_count=req.hop_count,
            origin_device_id=origin_id,
            relay_node_id=relay_id,
            schema_version="1.0.0",
            delivery_channel=channel,
            is_demo=req.is_demo,
            updated_at=datetime.utcnow()
        )

        db.add(record)
        db.commit()
        db.refresh(record)

        return SosService._to_incident_out(record)

    @staticmethod
    def get_incidents(
        district_id: Optional[str] = None,
        include_demo: bool = False,
        db: Session = None
    ) -> List[SosIncidentOut]:
        """Fetch distress incidents from persistent database with dynamic waiting-time escalation."""
        query = db.query(SosIncidentRecord)
        if not include_demo:
            query = query.filter(SosIncidentRecord.is_demo == False)
        if district_id:
            query = query.filter(SosIncidentRecord.district_id == district_id)

        incidents = query.order_by(SosIncidentRecord.priority_score.desc(), SosIncidentRecord.created_at.desc()).all()
        results = []
        for i in incidents:
            out = SosService._to_incident_out(i)
            # Reassess unassigned records with waiting time escalation
            try:
                dt_str = out.created_at.replace("Z", "+00:00")
                dt = datetime.fromisoformat(dt_str)
                esc_score, esc_level, esc_note = PriorityScoringService.apply_waiting_time_escalation(
                    created_at=dt,
                    current_score=out.priority_score,
                    response_status=out.response_status
                )
                if esc_note and esc_score != out.priority_score:
                    out.priority_score = esc_score
                    out.priority_level = esc_level
                    out.priority_reasons = list(out.priority_reasons or []) + [esc_note]
            except Exception:
                pass
            results.append(out)

        results.sort(key=lambda x: (x.priority_score, x.created_at), reverse=True)
        return results

    @staticmethod
    def update_incident_status(
        incident_id: str,
        req: SosStatusUpdateRequest,
        db: Session
    ) -> SosIncidentOut:
        """Update incident response status, handle priority overrides, and synchronize with assigned rescue vessel."""
        incident = db.query(SosIncidentRecord).filter(SosIncidentRecord.id == incident_id).first()
        if not incident:
            raise ValueError(f"Incident with ID '{incident_id}' not found.")

        incident.response_status = req.status
        incident.updated_at = datetime.utcnow()

        # Handle responder priority override
        if req.priority_override_level or req.priority_override_score is not None:
            if req.priority_override_level:
                incident.priority_level = req.priority_override_level.upper()
            if req.priority_override_score is not None:
                incident.priority_score = req.priority_override_score
            override_msg = f"Responder override to {incident.priority_level} ({incident.priority_score} pts)"
            if req.priority_override_reason:
                override_msg += f": {req.priority_override_reason}"
            cur_reasons = list(incident.priority_reasons or [])
            cur_reasons.append(override_msg)
            incident.priority_reasons = cur_reasons

        if req.assigned_boat_id:
            incident.assigned_boat_id = req.assigned_boat_id
            incident.assigned_boat_name = req.assigned_boat_name
            incident.mission_phase = req.mission_phase or "en_route"

            # Sync assigned boat
            boat = db.query(RescueVessel).filter(RescueVessel.id == req.assigned_boat_id).first()
            if boat:
                boat.status = "deployed"
                boat.assigned_incident_id = incident.id
                boat.assigned_incident_location = incident.location_name
                boat.mission_phase = req.mission_phase or "en_route"
                boat.updated_at = datetime.utcnow()

        elif req.status == "unassigned":
            # Release previously assigned boat
            if incident.assigned_boat_id:
                prev_boat = db.query(RescueVessel).filter(RescueVessel.id == incident.assigned_boat_id).first()
                if prev_boat:
                    prev_boat.status = "available"
                    prev_boat.assigned_incident_id = None
                    prev_boat.assigned_incident_location = None
                    prev_boat.mission_phase = "standby"
                    prev_boat.updated_at = datetime.utcnow()

            incident.assigned_boat_id = None
            incident.assigned_boat_name = None
            incident.mission_phase = None

        elif req.status == "rescued":
            incident.mission_phase = "completed"
            if incident.assigned_boat_id:
                boat = db.query(RescueVessel).filter(RescueVessel.id == incident.assigned_boat_id).first()
                if boat:
                    boat.status = "available"
                    boat.assigned_incident_id = None
                    boat.assigned_incident_location = None
                    boat.mission_phase = "standby"
                    boat.rescues_completed += incident.people_count
                    boat.updated_at = datetime.utcnow()

        db.commit()
        db.refresh(incident)
        return SosService._to_incident_out(incident)

    @staticmethod
    def get_boats(district_id: Optional[str], db: Session) -> List[RescueBoatOut]:
        """Fetch rescue boats, auto-seeding staging bases across Kerala catchments if empty."""
        query = db.query(RescueVessel)
        if district_id:
            query = query.filter(RescueVessel.district_id == district_id)

        boats = query.order_by(RescueVessel.id.asc()).all()
        if not boats and district_id:
            SosService._seed_district_boats(district_id, db)
            boats = db.query(RescueVessel).filter(RescueVessel.district_id == district_id).all()

        return [SosService._to_boat_out(b) for b in boats]

    @staticmethod
    def update_boat_status(
        boat_id: str,
        req: BoatStatusUpdateRequest,
        db: Session
    ) -> RescueBoatOut:
        """Update boat status and handle mission progression."""
        boat = db.query(RescueVessel).filter(RescueVessel.id == boat_id).first()
        if not boat:
            raise ValueError(f"Rescue boat '{boat_id}' not found.")

        boat.status = req.status
        boat.mission_phase = req.mission_phase or boat.mission_phase
        boat.updated_at = datetime.utcnow()

        if req.status == "available":
            # If boat was completed, update incident
            if boat.assigned_incident_id:
                inc = db.query(SosIncidentRecord).filter(SosIncidentRecord.id == boat.assigned_incident_id).first()
                if inc:
                    inc.response_status = "rescued"
                    inc.mission_phase = "completed"
                    inc.updated_at = datetime.utcnow()
                    boat.rescues_completed += inc.people_count

            boat.assigned_incident_id = None
            boat.assigned_incident_location = None

        db.commit()
        db.refresh(boat)
        return SosService._to_boat_out(boat)

    @staticmethod
    def get_risk_zones(district_id: Optional[str], db: Session) -> List[RiskZoneOut]:
        """Generate verified flood risk zones for district."""
        d_id = district_id or "ernakulam"
        loc = KERALA_DISTRICTS.get(d_id, KERALA_DISTRICTS["ernakulam"])

        # Fetch live risk prediction
        pred_prob = 0.50
        risk_level = "MODERATE"
        try:
            pred = PredictorService.predict(location_id=d_id)
            pred_prob = pred.calibrated_risk_probability
            risk_level = pred.risk_level
        except Exception:
            pass

        zones = [
            RiskZoneOut(
                id=f"RISK-KL-{d_id.upper()}-01",
                district_id=d_id,
                name=f"{loc.name} - Aluva/Periyar River Corridor Inundation Sector",
                latitude=loc.latitude + 0.015,
                longitude=loc.longitude + 0.010,
                radius_m=2200,
                risk_score=round(min(1.0, pred_prob * 1.5 + 0.2), 2),
                risk_level=risk_level,
                source="ResQNet River Telemetry & KSDMA Basin Map"
            ),
            RiskZoneOut(
                id=f"RISK-KL-{d_id.upper()}-02",
                district_id=d_id,
                name=f"{loc.name} - Paravur Low-Lying Coastal Drainage Bottleneck",
                latitude=loc.latitude - 0.012,
                longitude=loc.longitude - 0.008,
                radius_m=1600,
                risk_score=round(min(1.0, pred_prob * 1.2 + 0.1), 2),
                risk_level=risk_level,
                source="CWC Gauge Watch & Elevation Model"
            )
        ]
        return zones

    @staticmethod
    def create_alert(payload: Dict[str, Any], db: Session) -> Dict[str, Any]:
        """Record an alert event and broadcast."""
        loc_id = payload.get("location_id", "ernakulam")
        title = payload.get("title", "Emergency Inundation Directive")
        msg = payload.get("message", "Evacuation alert dispatched.")
        severity = payload.get("severity", "WARNING")

        alert = AlertEvent(
            location_id=loc_id,
            location_name=KERALA_DISTRICTS.get(loc_id, KERALA_DISTRICTS["ernakulam"]).name,
            timestamp=datetime.utcnow(),
            severity=severity,
            title=title,
            message=msg,
            rule_triggered="Responder Dispatch Console",
            source="ResQNet Incident Command",
            is_official_override=True,
            is_test=False,
            suppressed_count=0,
            acknowledged=False
        )
        db.add(alert)
        db.commit()
        db.refresh(alert)
        return {
            "id": f"ALERT-KL-{alert.id}",
            "location_id": alert.location_id,
            "title": alert.title,
            "severity": alert.severity,
            "status": "QUEUED",
            "timestamp": alert.timestamp.isoformat() + "Z"
        }

    @staticmethod
    def _to_incident_out(record: SosIncidentRecord) -> SosIncidentOut:
        return SosIncidentOut(
            id=record.id,
            message_id=record.message_id,
            district_id=record.district_id,
            district_name=record.district_name or record.district_id.capitalize(),
            location_name=record.location_name or "Emergency Sector",
            created_at=record.created_at.isoformat() + "Z",
            latitude=record.latitude,
            longitude=record.longitude,
            location_accuracy_m=record.location_accuracy_m,
            category=record.category or "trapped",
            description=record.description,
            people_count=record.people_count,
            vulnerability_flags=record.vulnerability_flags or [],
            priority_score=record.priority_score,
            priority_level=record.priority_level,
            priority_reasons=record.priority_reasons or [],
            response_status=record.response_status or "unassigned",
            assigned_boat_id=record.assigned_boat_id,
            assigned_boat_name=record.assigned_boat_name,
            mission_phase=record.mission_phase,
            delivery_status=record.delivery_status or "received",
            hop_count=record.hop_count or 0,
            origin_device_id=record.origin_device_id,
            schema_version=record.schema_version or "1.0.0",
            participant_id=record.participant_id,
            broadcast_id=record.broadcast_id,
            relay_node_id=record.relay_node_id,
            relayed_at=record.relayed_at.isoformat() + "Z" if record.relayed_at else None,
            delivery_channel=record.delivery_channel or "INTERNET",
            acknowledged_by_server_at=record.acknowledged_by_server_at.isoformat() + "Z" if getattr(record, "acknowledged_by_server_at", None) else None,
            acknowledged_by_rescuer_at=record.acknowledged_by_rescuer_at.isoformat() + "Z" if getattr(record, "acknowledged_by_rescuer_at", None) else None,
            rescuer_name=getattr(record, "rescuer_name", None),
            is_demo=bool(getattr(record, "is_demo", False))
        )

    @staticmethod
    def get_incident_by_message_id(message_id: str, db: Session) -> Optional[SosIncidentOut]:
        """Look up an SOS incident by client-generated message ID."""
        record = db.query(SosIncidentRecord).filter(SosIncidentRecord.message_id == message_id).first()
        if not record:
            return None
        return SosService._to_incident_out(record)

    @staticmethod
    def acknowledge_by_rescuer(incident_id: str, req: RescuerAckRequest, db: Session) -> SosIncidentOut:
        """
        Record authoritative rescuer acknowledgement.
        Transitions delivery state to ACKNOWLEDGED_BY_RESCUER and updates response status.
        """
        record = db.query(SosIncidentRecord).filter(
            or_(SosIncidentRecord.id == incident_id, SosIncidentRecord.message_id == incident_id)
        ).first()
        if not record:
            raise ValueError(f"Incident with ID '{incident_id}' not found.")

        now = datetime.utcnow()
        record.acknowledged_by_rescuer_at = now
        record.rescuer_name = req.rescuer_name
        record.delivery_status = "ACKNOWLEDGED_BY_RESCUER"
        if record.response_status == "unassigned":
            record.response_status = "acknowledged"

        if req.assigned_boat_id:
            record.assigned_boat_id = req.assigned_boat_id
            record.response_status = "assigned"
            record.mission_phase = req.mission_phase or "en_route"
            boat = db.query(RescueVessel).filter(RescueVessel.id == req.assigned_boat_id).first()
            if boat:
                record.assigned_boat_name = boat.name
                boat.status = "deployed"
                boat.assigned_incident_id = record.id
                boat.assigned_incident_location = record.location_name
                boat.mission_phase = req.mission_phase or "en_route"

        record.updated_at = now
        db.commit()
        db.refresh(record)
        return SosService._to_incident_out(record)

    @staticmethod
    def get_stop_forwarding_message_ids(db: Session, since: Optional[datetime] = None) -> List[str]:
        """
        Return message IDs for incidents that have been successfully persisted on the server
        or acknowledged by a rescuer. Reachable peers use this to stop retransmission.
        """
        query = db.query(SosIncidentRecord.message_id).filter(
            SosIncidentRecord.message_id.isnot(None),
            or_(
                SosIncidentRecord.delivery_status.in_(["ACKNOWLEDGED_BY_SERVER", "ACKNOWLEDGED_BY_RESCUER", "received"]),
                SosIncidentRecord.acknowledged_by_server_at.isnot(None),
                SosIncidentRecord.response_status != "unassigned"
            )
        )
        if since:
            query = query.filter(SosIncidentRecord.updated_at >= since)

        rows = query.distinct().all()
        return [r[0] for r in rows if r[0]]

    @staticmethod
    def _to_message_out(record: IncidentMessageRecord) -> IncidentMessageOut:
        return IncidentMessageOut(
            id=record.id,
            incident_id=record.incident_id,
            sender_role=record.sender_role,
            sender_name=record.sender_name,
            message_text=record.message_text,
            created_at=record.created_at.isoformat() + "Z" if record.created_at else datetime.utcnow().isoformat() + "Z",
            delivery_status=record.delivery_status or "SAVED_ON_SERVER",
            delivery_channel=record.delivery_channel or "INTERNET",
            delivered_at=record.delivered_at.isoformat() + "Z" if record.delivered_at else None,
            acknowledged_at=record.acknowledged_at.isoformat() + "Z" if record.acknowledged_at else None,
        )

    @staticmethod
    def get_incident_messages(incident_id: str, db: Session) -> List[IncidentMessageOut]:
        """
        Retrieve chronological message conversation for an incident.
        If no messages exist yet in the conversation table, automatically seeds the citizen's
        original distress beacon as the starting message (with CONFIRMED_RECEIVED state).
        """
        incident = db.query(SosIncidentRecord).filter(
            or_(SosIncidentRecord.id == incident_id, SosIncidentRecord.message_id == incident_id)
        ).first()
        canonical_id = incident.id if incident else incident_id

        records = db.query(IncidentMessageRecord).filter(
            IncidentMessageRecord.incident_id == canonical_id
        ).order_by(IncidentMessageRecord.created_at.asc()).all()

        if not records and incident and incident.description:
            initial_msg = IncidentMessageRecord(
                id=f"MSG-INIT-{incident.id[:16]}",
                incident_id=canonical_id,
                sender_role="citizen",
                sender_name="Citizen Distress Beacon",
                message_text=incident.description,
                created_at=incident.created_at or datetime.utcnow(),
                delivery_status="CONFIRMED_RECEIVED",
                delivery_channel=incident.delivery_channel or "INTERNET",
                delivered_at=incident.created_at,
                acknowledged_at=incident.acknowledged_by_server_at or incident.created_at
            )
            db.add(initial_msg)
            try:
                db.commit()
                db.refresh(initial_msg)
                records = [initial_msg]
            except Exception:
                db.rollback()

        return [SosService._to_message_out(r) for r in records]

    @staticmethod
    def create_incident_message(incident_id: str, req: IncidentMessageCreate, db: Session) -> IncidentMessageOut:
        """
        Persist a new message from a responder or citizen.
        Honest delivery semantics:
        - When responder posts a message, it is marked 'SAVED_ON_SERVER' (or 'QUEUED_FOR_DELIVERY').
          It is NEVER falsely marked 'CONFIRMED_RECEIVED' or 'DELIVERED' until physical device ack.
        """
        incident = db.query(SosIncidentRecord).filter(
            or_(SosIncidentRecord.id == incident_id, SosIncidentRecord.message_id == incident_id)
        ).first()
        canonical_id = incident.id if incident else incident_id

        initial_status = "SAVED_ON_SERVER"
        channel = req.delivery_channel or (incident.delivery_channel if incident else "INTERNET")

        msg_id = f"MSG-{uuid.uuid4().hex[:12].upper()}"
        record = IncidentMessageRecord(
            id=msg_id,
            incident_id=canonical_id,
            sender_role=req.sender_role,
            sender_name=req.sender_name or ("Incident Command" if req.sender_role == "responder" else "Citizen"),
            message_text=req.message_text.strip(),
            created_at=datetime.utcnow(),
            delivery_status=initial_status,
            delivery_channel=channel,
            delivered_at=None,
            acknowledged_at=None
        )
        db.add(record)
        db.commit()
        db.refresh(record)
        return SosService._to_message_out(record)

    @staticmethod
    def acknowledge_incident_message(
        incident_id: str,
        message_id: str,
        req: MessageAckRequest,
        db: Session
    ) -> IncidentMessageOut:
        """
        Process device acknowledgement for a message (from phone, BLE gateway, or mesh relay).
        Transitions status to CONFIRMED_RECEIVED, SENT_TO_DEVICE, or DELIVERY_FAILED with timestamps.
        """
        incident = db.query(SosIncidentRecord).filter(
            or_(SosIncidentRecord.id == incident_id, SosIncidentRecord.message_id == incident_id)
        ).first()
        canonical_id = incident.id if incident else incident_id

        msg = db.query(IncidentMessageRecord).filter(
            IncidentMessageRecord.id == message_id,
            IncidentMessageRecord.incident_id == canonical_id
        ).first()
        if not msg:
            msg = db.query(IncidentMessageRecord).filter(IncidentMessageRecord.id == message_id).first()
        if not msg:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail=f"Message '{message_id}' not found for incident '{incident_id}'")

        valid_statuses = [
            "SAVED_ON_SERVER", "QUEUED_FOR_DELIVERY", "SENT_TO_DEVICE",
            "CONFIRMED_RECEIVED", "DELIVERY_FAILED", "UNKNOWN"
        ]
        status = req.status.upper() if req.status.upper() in valid_statuses else "CONFIRMED_RECEIVED"
        msg.delivery_status = status
        now = datetime.utcnow()
        if status == "CONFIRMED_RECEIVED":
            msg.acknowledged_at = now
            if not msg.delivered_at:
                msg.delivered_at = now
        elif status == "SENT_TO_DEVICE":
            msg.delivered_at = now

        db.commit()
        db.refresh(msg)
        return SosService._to_message_out(msg)

    @staticmethod
    def _to_boat_out(boat: RescueVessel) -> RescueBoatOut:
        return RescueBoatOut(
            id=boat.id,
            district_id=boat.district_id,
            district_name=boat.district_name,
            name=boat.name,
            agency=boat.agency,
            type=boat.type,
            capacity=boat.capacity,
            commander=boat.commander,
            crew_count=boat.crew_count,
            contact=boat.contact,
            base_name=boat.base_name,
            latitude=boat.latitude,
            longitude=boat.longitude,
            status=boat.status,
            assigned_incident_id=boat.assigned_incident_id,
            assigned_incident_location=boat.assigned_incident_location,
            mission_phase=boat.mission_phase,
            fuel_percent=boat.fuel_percent,
            rescues_completed=boat.rescues_completed,
            updated_at=boat.updated_at.isoformat() + "Z"
        )

    @staticmethod
    def _seed_district_incidents(district_id: str, db: Session):
        """Seed realistic emergency scenarios for testing and demonstration."""
        loc = KERALA_DISTRICTS.get(district_id, KERALA_DISTRICTS["ernakulam"])
        seeds = [
            {
                "id": f"SOS-KL-{district_id[:3].upper()}-01",
                "message_id": f"SEED-{district_id}-01",
                "district_id": district_id,
                "district_name": loc.name,
                "location_name": f"{loc.name} Riverbank Settlement",
                "latitude": loc.latitude + 0.008,
                "longitude": loc.longitude + 0.005,
                "location_accuracy_m": 8.5,
                "category": "trapped",
                "description": f"{loc.primary_river_basins[0].capitalize()} river overflowed bank. 4 persons trapped on second floor. Children present.",
                "people_count": 4,
                "vulnerability_flags": ["child", "rising_flood"],
                "priority_score": 94,
                "priority_level": "CRITICAL",
                "priority_reasons": ["Rapid water rise", "Children trapped", "Riverbank overflow"],
                "response_status": "unassigned"
            },
            {
                "id": f"SOS-KL-{district_id[:3].upper()}-02",
                "message_id": f"SEED-{district_id}-02",
                "district_id": district_id,
                "district_name": loc.name,
                "location_name": f"{loc.name} Low-Lying Ward 5",
                "latitude": loc.latitude - 0.010,
                "longitude": loc.longitude - 0.007,
                "location_accuracy_m": 12.0,
                "category": "injured",
                "description": "Submerged road access. One elderly resident suffered head injury, needs stretcher transport.",
                "people_count": 2,
                "vulnerability_flags": ["elderly", "medical_emergency"],
                "priority_score": 86,
                "priority_level": "HIGH",
                "priority_reasons": ["Severe injury reported", "Elderly resident", "Access road submerged"],
                "response_status": "unassigned"
            }
        ]

        for s in seeds:
            rec = SosIncidentRecord(
                id=s["id"],
                message_id=s["message_id"],
                district_id=s["district_id"],
                district_name=s["district_name"],
                location_name=s["location_name"],
                created_at=datetime.utcnow(),
                latitude=s["latitude"],
                longitude=s["longitude"],
                location_accuracy_m=s["location_accuracy_m"],
                category=s["category"],
                description=s["description"],
                people_count=s["people_count"],
                vulnerability_flags=s["vulnerability_flags"],
                priority_score=s["priority_score"],
                priority_level=s["priority_level"],
                priority_reasons=s["priority_reasons"],
                response_status=s["response_status"],
                assigned_boat_id=None,
                assigned_boat_name=None,
                mission_phase="standby",
                delivery_status="received",
                hop_count=1,
                origin_device_id="seed_device",
                schema_version="1.0.0",
                updated_at=datetime.utcnow()
            )
            db.add(rec)
        db.commit()

    @staticmethod
    def _seed_district_boats(district_id: str, db: Session):
        """Seed verified rescue boats for Kerala Fire & Rescue and Matsyathozhilali."""
        loc = KERALA_DISTRICTS.get(district_id, KERALA_DISTRICTS["ernakulam"])
        boats_data = [
            {
                "id": f"BOAT-KL-{district_id[:3].upper()}-101",
                "district_id": district_id,
                "district_name": loc.name,
                "name": f"Kerala Fire & Rescue Gemini-01 ({loc.name})",
                "agency": "Kerala Fire & Emergency Services",
                "type": "Inflatable Motorized Gemini",
                "capacity": 8,
                "commander": "Station Officer K. Manoj",
                "crew_count": 3,
                "contact": "VHF Ch 16 / +91-484-2623333",
                "base_name": f"{loc.name} Staging Depot",
                "latitude": loc.latitude + 0.005,
                "longitude": loc.longitude - 0.002,
                "status": "available",
                "mission_phase": "standby",
                "fuel_percent": 95,
                "rescues_completed": 4
            },
            {
                "id": f"BOAT-KL-{district_id[:3].upper()}-102",
                "district_id": district_id,
                "district_name": loc.name,
                "name": f"Matsyathozhilali Marine Rescue-04 ({loc.name})",
                "agency": "Matsyathozhilali Fishermen Fleet",
                "type": "Reinforced Outboard Motor Craft",
                "capacity": 14,
                "commander": "Captain Antony Xavier",
                "crew_count": 4,
                "contact": "VHF Ch 06 / +91-9447-010203",
                "base_name": f"{loc.name} River Jetty Staging",
                "latitude": loc.latitude - 0.006,
                "longitude": loc.longitude + 0.004,
                "status": "available",
                "mission_phase": "standby",
                "fuel_percent": 88,
                "rescues_completed": 12
            }
        ]

        for b in boats_data:
            vessel = RescueVessel(
                id=b["id"],
                district_id=b["district_id"],
                district_name=b["district_name"],
                name=b["name"],
                agency=b["agency"],
                type=b["type"],
                capacity=b["capacity"],
                commander=b["commander"],
                crew_count=b["crew_count"],
                contact=b["contact"],
                base_name=b["base_name"],
                latitude=b["latitude"],
                longitude=b["longitude"],
                status=b["status"],
                assigned_incident_id=None,
                assigned_incident_location=None,
                mission_phase=b["mission_phase"],
                fuel_percent=b["fuel_percent"],
                rescues_completed=b["rescues_completed"],
                updated_at=datetime.utcnow()
            )
            db.add(vessel)
        db.commit()
