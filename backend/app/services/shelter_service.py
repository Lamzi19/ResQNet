"""
Shelter Service for ResQNet.
Loads, caches, and queries the cleaned Kerala relief camp dataset.
Manages live shelter occupancy, atomic reservations, check-ins, staff updates,
and intelligent allocation / safe-spot recommendations.
"""
import os
import json
import math
import uuid
import threading
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func
from fastapi import HTTPException

from backend.app.database.models import ShelterOccupancy, ShelterReservation
from backend.app.schemas.shelter import (
    ReliefFacilityItem, ReliefFacilitiesResponse, ShelterOccupancyInfo,
    ReservationRequest, ReservationResponse, CheckInRequest, CancelReservationRequest,
    StaffCapacityUpdateRequest, ShelterRecommendationRequest, ShelterRecommendationResponse,
    RecommendedShelterItem
)

_SHELTER_CACHE: Optional[Dict[str, Any]] = None

CLEANED_DATA_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..", "data", "cleaned", "kerala_relief_camps_mapped.json")
)
FULL_DATA_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..", "data", "cleaned", "kerala_relief_camps_all.json")
)

# Known responder PINs for staff authorization
AUTHORIZED_STAFF_PINS = {"kerala112", "ksdma2026", "responder999"}
_ALLOCATION_LOCK = threading.Lock()

# Pilot demonstration facilities seeded into ShelterOccupancy
# Represents realistic test facilities across flood-vulnerable districts
PILOT_DEMO_FACILITIES = [
    {
        "shelter_id": "kl_camp_03025",
        "district_id": "ernakulam",
        "name": "Rajeev Gandhi Auditorium",
        "total_capacity": 200,
        "is_operational": True,
        "verified_operational_capacity": 150,
        "occupied_count": 35,
        "reserved_count": 10,
        "is_simulated": True,
        "verification_notes": "Live Drill 2026: Operational primary facility in Aluva taluk.",
        "updated_by": "Ernakulam DDMA Pilot Staff"
    },
    {
        "shelter_id": "kl_camp_03037",
        "district_id": "ernakulam",
        "name": "Holy Cross Church Hall Kottayil Kovilakam",
        "total_capacity": 1000,
        "is_operational": True,
        "verified_operational_capacity": 80,
        "occupied_count": 68,
        "reserved_count": 8,
        "is_simulated": True,
        "verification_notes": "Live Drill 2026: High occupancy facility near North Paravur.",
        "updated_by": "North Paravur Camp Officer"
    },
    {
        "shelter_id": "kl_camp_03062",
        "district_id": "ernakulam",
        "name": "St.Pauls College",
        "total_capacity": 340,
        "is_operational": True,
        "verified_operational_capacity": 100,
        "occupied_count": 95,
        "reserved_count": 5,
        "is_simulated": True,
        "verification_notes": "Live Drill 2026: Reached maximum operational capacity (FULL).",
        "updated_by": "Kalamassery Nodal Officer"
    },
    {
        "shelter_id": "kl_camp_01266",
        "district_id": "alappuzha",
        "name": "Govt College, Ambalapuzha",
        "total_capacity": 500,
        "is_operational": True,
        "verified_operational_capacity": 200,
        "occupied_count": 50,
        "reserved_count": 15,
        "is_simulated": True,
        "verification_notes": "Live Drill 2026: Coastal/Kuttanad relief staging center.",
        "updated_by": "Alappuzha DDMA Pilot Staff"
    },
    {
        "shelter_id": "kl_camp_01267",
        "district_id": "alappuzha",
        "name": "Govt Model HSS Ambalapuzha",
        "total_capacity": 400,
        "is_operational": True,
        "verified_operational_capacity": 120,
        "occupied_count": 110,
        "reserved_count": 10,
        "is_simulated": True,
        "verification_notes": "Live Drill 2026: Currently FULL due to active sector evacuations.",
        "updated_by": "Ambalapuzha Camp Officer"
    },
    {
        "shelter_id": "kl_camp_01280",
        "district_id": "alappuzha",
        "name": "Saint Augustine hss",
        "total_capacity": 150,
        "is_operational": True,
        "verified_operational_capacity": 80,
        "occupied_count": 20,
        "reserved_count": 5,
        "is_simulated": True,
        "verification_notes": "Live Drill 2026: Verified operational secondary safe-spot.",
        "updated_by": "Cherthala Taluk Officer"
    }
]


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate Great Circle distance in kilometres between two coordinates."""
    r = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return round(r * c, 2)


class ShelterService:
    @staticmethod
    def _load_data() -> Dict[str, Any]:
        global _SHELTER_CACHE
        if _SHELTER_CACHE is not None:
            return _SHELTER_CACHE

        if not os.path.exists(CLEANED_DATA_PATH):
            from backend.scripts import clean_relief_camps  # noqa
            
        if not os.path.exists(CLEANED_DATA_PATH):
            raise FileNotFoundError(f"Cleaned relief camps dataset not found at {CLEANED_DATA_PATH}")

        with open(CLEANED_DATA_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
            _SHELTER_CACHE = data
            return _SHELTER_CACHE

    @staticmethod
    def ensure_pilot_shelters_seeded(db: Session) -> None:
        """
        Seeds designated pilot facilities into ShelterOccupancy if table is unpopulated.
        Preserves unverified baseline for all other 6,000+ facilities.
        """
        count = db.query(ShelterOccupancy).count()
        if count == 0:
            now = datetime.utcnow()
            for p in PILOT_DEMO_FACILITIES:
                occ = ShelterOccupancy(
                    shelter_id=p["shelter_id"],
                    district_id=p.get("district_id"),
                    name=p.get("name"),
                    total_capacity=p["total_capacity"],
                    is_operational=p["is_operational"],
                    verified_operational_capacity=p["verified_operational_capacity"],
                    occupied_count=p["occupied_count"],
                    reserved_count=p["reserved_count"],
                    is_simulated=p["is_simulated"],
                    verification_notes=p["verification_notes"],
                    updated_by=p["updated_by"],
                    updated_at=now
                )
                db.add(occ)
                # Seed baseline active reservation if initial reserved_count > 0
                if p["reserved_count"] > 0:
                    base_res = ShelterReservation(
                        id=f"RES-PILOT-{p['shelter_id'].upper()}",
                        shelter_id=p["shelter_id"],
                        group_size=p["reserved_count"],
                        status="ACTIVE",
                        created_at=now,
                        expires_at=now + timedelta(days=7),
                        citizen_contact="Simulation Baseline Drill Hold",
                        notes="Simulated active sector hold for live demonstration."
                    )
                    db.add(base_res)
            db.commit()

    @staticmethod
    def cleanup_expired_reservations(db: Session) -> int:
        """
        Transitions active reservations that have passed expires_at to EXPIRED,
        and releases their held reserved capacity back to available.
        """
        now = datetime.utcnow()
        expired_reservations = (
            db.query(ShelterReservation)
            .filter(
                ShelterReservation.status == "ACTIVE",
                ShelterReservation.expires_at < now
            )
            .all()
        )
        count = len(expired_reservations)
        for res in expired_reservations:
            res.status = "EXPIRED"
            occ = db.query(ShelterOccupancy).filter(ShelterOccupancy.shelter_id == res.shelter_id).first()
            if occ:
                occ.reserved_count = max(0, occ.reserved_count - res.group_size)
                occ.updated_at = now
        if count > 0:
            db.commit()
        return count

    @staticmethod
    def get_shelter_metadata(shelter_id: str) -> Optional[Dict[str, Any]]:
        """Look up static shelter record from cleaned dataset."""
        data = ShelterService._load_data()
        for r in data.get("records", []):
            if r.get("id") == shelter_id:
                return r
        return None

    @staticmethod
    def get_shelters(
        db: Session,
        district_id: Optional[str] = None,
        search_query: Optional[str] = None,
        limit: int = 200,
        offset: int = 0
    ) -> ReliefFacilitiesResponse:
        """
        Retrieve shelters with attached live occupancy models.
        Unverified registry facilities return status UNVERIFIED with available_count=0.
        """
        ShelterService.ensure_pilot_shelters_seeded(db)
        ShelterService.cleanup_expired_reservations(db)

        data = ShelterService._load_data()
        records: List[Dict[str, Any]] = data.get("records", [])
        meta = data.get("metadata", {})

        filtered = records

        if district_id and district_id.lower() != "all":
            d_norm = district_id.lower().strip()
            filtered = [r for r in filtered if r.get("district_id", "").lower() == d_norm]

        if search_query and search_query.strip():
            q = search_query.lower().strip()
            filtered = [
                r for r in filtered
                if q in (r.get("name") or "").lower()
                or q in (r.get("village") or "").lower()
                or q in (r.get("lsg") or "").lower()
            ]

        total_in_registry = meta.get("total_source_records", 6377)
        mapped_count = len(records)
        unmapped_count = total_in_registry - mapped_count
        filtered_count = len(filtered)

        paged_records = filtered[offset : offset + limit] if limit > 0 else filtered

        # Fetch all live occupancy entries into a lookup dictionary
        occupancy_rows = db.query(ShelterOccupancy).all()
        occupancy_map = {o.shelter_id: o for o in occupancy_rows}

        items: List[ReliefFacilityItem] = []
        for r in paged_records:
            s_id = r["id"]
            occ = occupancy_map.get(s_id)
            if occ:
                status, available, pct = occ.calculate_status()
                occ_info = ShelterOccupancyInfo(
                    shelter_id=s_id,
                    is_operational=occ.is_operational,
                    total_capacity=occ.total_capacity or r.get("capacity_persons"),
                    verified_operational_capacity=occ.verified_operational_capacity,
                    occupied_count=occ.occupied_count,
                    reserved_count=occ.reserved_count,
                    available_count=available,
                    occupancy_pct=pct,
                    status=status,
                    is_simulated=occ.is_simulated,
                    verification_notes=occ.verification_notes,
                    updated_by=occ.updated_by,
                    updated_at=occ.updated_at.isoformat() if occ.updated_at else datetime.utcnow().isoformat()
                )
            else:
                occ_info = ShelterOccupancyInfo(
                    shelter_id=s_id,
                    is_operational=False,
                    total_capacity=r.get("capacity_persons"),
                    verified_operational_capacity=None,
                    occupied_count=0,
                    reserved_count=0,
                    available_count=0,
                    occupancy_pct=None,
                    status="UNVERIFIED",
                    is_simulated=False,
                    verification_notes="Historical baseline record (SEOC Aug 2020). Operational capacity unverified.",
                    updated_by="SEOC Baseline Registry",
                    updated_at=datetime.utcnow().isoformat()
                )

            item_dict = dict(r)
            if occ and occ.is_operational and occ.verified_operational_capacity is not None:
                item_dict["is_verified_operational_2026"] = True
                item_dict["official_verification_status"] = "VERIFIED_OPERATIONAL"
                item_dict["status_notice"] = f"Verified operational emergency relief center (Capacity: {occ.verified_operational_capacity})."
            item_dict["occupancy"] = occ_info
            items.append(ReliefFacilityItem(**item_dict))

        return ReliefFacilitiesResponse(
            total_facilities_in_registry=total_in_registry,
            mapped_facilities_count=mapped_count,
            unmapped_facilities_count=unmapped_count,
            filtered_count=filtered_count,
            district_filter=district_id,
            source_agency=meta.get("source_agency", "Kerala State Emergency Operations Centre (SEOC GIS Cell)"),
            source_compilation_date=meta.get("source_created_date", "2020-08-05"),
            facilities=items
        )

    @staticmethod
    def create_reservation(req: ReservationRequest, db: Session) -> ReservationResponse:
        """
        Atomically checks remaining verified capacity and creates an active reservation.
        Rejects requests for unverified or full facilities.
        """
        with _ALLOCATION_LOCK:
            ShelterService.ensure_pilot_shelters_seeded(db)
            ShelterService.cleanup_expired_reservations(db)

            # Retrieve occupancy record
            occ = db.query(ShelterOccupancy).filter(ShelterOccupancy.shelter_id == req.shelter_id).first()
            if not occ or not occ.is_operational or occ.verified_operational_capacity is None:
                raise HTTPException(
                    status_code=400,
                    detail="Cannot reserve space: This facility has not been verified as an active, staffed operational shelter."
                )

            # Synchronize active reserved count atomically
            active_reserved_sum = (
                db.query(func.sum(ShelterReservation.group_size))
                .filter(
                    ShelterReservation.shelter_id == req.shelter_id,
                    ShelterReservation.status == "ACTIVE",
                    ShelterReservation.expires_at > datetime.utcnow()
                )
                .scalar() or 0
            )
            occ.reserved_count = active_reserved_sum

            available_capacity = max(0, occ.verified_operational_capacity - occ.occupied_count - occ.reserved_count)
            if req.group_size > available_capacity:
                raise HTTPException(
                    status_code=409,
                    detail=f"Insufficient verified capacity. Requested: {req.group_size}, Available: {available_capacity}."
                )

            res_id = f"RES-{uuid.uuid4().hex[:8].upper()}"
            created_at = datetime.utcnow()
            expires_at = created_at + timedelta(minutes=req.expiry_minutes)

            reservation = ShelterReservation(
                id=res_id,
                shelter_id=req.shelter_id,
                group_size=req.group_size,
                status="ACTIVE",
                created_at=created_at,
                expires_at=expires_at,
                citizen_contact=req.citizen_contact,
                notes=req.notes
            )

            occ.reserved_count += req.group_size
            occ.updated_at = created_at

            db.add(reservation)
            db.commit()
            db.refresh(reservation)

            meta = ShelterService.get_shelter_metadata(req.shelter_id) or {}
            shelter_name = meta.get("name", req.shelter_id)
            district_id = meta.get("district_id", "kerala")

            available_after = max(0, occ.verified_operational_capacity - occ.occupied_count - occ.reserved_count)

            return ReservationResponse(
                id=reservation.id,
                shelter_id=reservation.shelter_id,
                shelter_name=shelter_name,
                district_id=district_id,
                group_size=reservation.group_size,
                status=reservation.status,
                created_at=reservation.created_at.isoformat(),
                expires_at=reservation.expires_at.isoformat(),
                available_capacity_after=available_after,
                message=f"Reserved {req.group_size} bed(s) at {shelter_name}. Hold expires in {req.expiry_minutes} mins (ID: {res_id})."
            )

    @staticmethod
    def check_in_reservation(req: CheckInRequest, db: Session) -> ReservationResponse:
        """
        Transitions reservation from ACTIVE to CHECKED_IN exactly once.
        Atomically shifts held reserved capacity to occupied count.
        Rejects duplicates, cancellations, or expired reservations.
        """
        with _ALLOCATION_LOCK:
            ShelterService.cleanup_expired_reservations(db)

            res = db.query(ShelterReservation).filter(ShelterReservation.id == req.reservation_id).first()
            if not res:
                raise HTTPException(status_code=404, detail=f"Reservation '{req.reservation_id}' not found.")

            if res.status == "CHECKED_IN":
                raise HTTPException(
                    status_code=400,
                    detail="Duplicate check-in rejected: This reservation has already been confirmed as arrived."
                )
            elif res.status == "CANCELLED":
                raise HTTPException(status_code=400, detail="Check-in rejected: This reservation was previously cancelled.")
            elif res.status == "EXPIRED" or (res.status == "ACTIVE" and res.expires_at < datetime.utcnow()):
                res.status = "EXPIRED"
                db.commit()
                raise HTTPException(status_code=400, detail="Check-in rejected: Reservation has expired.")
            elif res.status != "ACTIVE":
                raise HTTPException(status_code=400, detail=f"Invalid reservation status '{res.status}' for check-in.")

            occ = db.query(ShelterOccupancy).filter(ShelterOccupancy.shelter_id == res.shelter_id).first()
            if not occ:
                raise HTTPException(status_code=404, detail="Shelter occupancy record not found.")

            # Exactly once transition: shift reserved -> occupied
            now = datetime.utcnow()
            res.status = "CHECKED_IN"
            res.checked_in_at = now

            occ.reserved_count = max(0, occ.reserved_count - res.group_size)
            occ.occupied_count += res.group_size
            occ.updated_at = now

            db.commit()
            db.refresh(res)
            db.refresh(occ)

            meta = ShelterService.get_shelter_metadata(res.shelter_id) or {}
            shelter_name = meta.get("name", res.shelter_id)
            available_after = max(0, (occ.verified_operational_capacity or 0) - occ.occupied_count - occ.reserved_count)

            return ReservationResponse(
                id=res.id,
                shelter_id=res.shelter_id,
                shelter_name=shelter_name,
                district_id=meta.get("district_id", "kerala"),
                group_size=res.group_size,
                status=res.status,
                created_at=res.created_at.isoformat(),
                expires_at=res.expires_at.isoformat(),
                checked_in_at=res.checked_in_at.isoformat(),
                available_capacity_after=available_after,
                message=f"Check-in verified for {res.group_size} person(s) at {shelter_name}. Space marked occupied."
            )

    @staticmethod
    def cancel_reservation(req: CancelReservationRequest, db: Session) -> ReservationResponse:
        """
        Cancels an ACTIVE reservation and immediately releases reserved capacity.
        """
        with _ALLOCATION_LOCK:
            res = db.query(ShelterReservation).filter(ShelterReservation.id == req.reservation_id).first()
            if not res:
                raise HTTPException(status_code=404, detail=f"Reservation '{req.reservation_id}' not found.")

            if res.status != "ACTIVE":
                raise HTTPException(
                    status_code=400,
                    detail=f"Cannot cancel reservation with status '{res.status}'. Only ACTIVE reservations can be cancelled."
                )

            now = datetime.utcnow()
            res.status = "CANCELLED"
            res.cancelled_at = now
            if req.reason:
                res.notes = f"{res.notes or ''} [Cancelled: {req.reason}]".strip()

            occ = db.query(ShelterOccupancy).filter(ShelterOccupancy.shelter_id == res.shelter_id).first()
            if occ:
                occ.reserved_count = max(0, occ.reserved_count - res.group_size)
                occ.updated_at = now

            db.commit()
            db.refresh(res)

            meta = ShelterService.get_shelter_metadata(res.shelter_id) or {}
            shelter_name = meta.get("name", res.shelter_id)
            available_after = max(0, (occ.verified_operational_capacity or 0) - occ.occupied_count - occ.reserved_count) if occ else 0

            return ReservationResponse(
                id=res.id,
                shelter_id=res.shelter_id,
                shelter_name=shelter_name,
                district_id=meta.get("district_id", "kerala"),
                group_size=res.group_size,
                status=res.status,
                created_at=res.created_at.isoformat(),
                expires_at=res.expires_at.isoformat(),
                cancelled_at=res.cancelled_at.isoformat(),
                available_capacity_after=available_after,
                message=f"Reservation {res.id} cancelled. Reserved capacity for {res.group_size} person(s) released."
            )

    @staticmethod
    def update_staff_capacity(req: StaffCapacityUpdateRequest, db: Session) -> ShelterOccupancyInfo:
        """
        Updates verified operational capacity and occupancy counts.
        Requires authorized responder PIN to prevent unauthorized modifications.
        """
        pin = (req.staff_pin or "").strip().lower()
        if not pin or pin not in AUTHORIZED_STAFF_PINS:
            raise HTTPException(
                status_code=403,
                detail="Unauthorized: Invalid responder/staff PIN. Regular users cannot alter shelter operational capacity."
            )

        with _ALLOCATION_LOCK:
            shelter_id = req.shelter_id.strip()
            occ = db.query(ShelterOccupancy).filter(ShelterOccupancy.shelter_id == shelter_id).first()
            if not occ:
                meta = ShelterService.get_shelter_metadata(shelter_id) or {}
                occ = ShelterOccupancy(
                    shelter_id=shelter_id,
                    district_id=meta.get("district_id"),
                    name=meta.get("name"),
                    total_capacity=meta.get("capacity_persons"),
                    occupied_count=0,
                    reserved_count=0,
                    is_simulated=False if req.is_simulated is None else req.is_simulated
                )
                db.add(occ)

            occ.is_operational = req.is_operational
            if req.verified_operational_capacity is not None:
                occ.verified_operational_capacity = req.verified_operational_capacity
            if req.occupied_count is not None:
                occ.occupied_count = req.occupied_count
            if req.verification_notes is not None:
                occ.verification_notes = req.verification_notes
            if req.is_simulated is not None:
                occ.is_simulated = req.is_simulated

            occ.updated_by = req.updated_by
            occ.updated_at = datetime.utcnow()

            db.commit()
            db.refresh(occ)

            status, available, pct = occ.calculate_status()
            return ShelterOccupancyInfo(
                shelter_id=occ.shelter_id,
                is_operational=occ.is_operational,
                total_capacity=occ.total_capacity,
                verified_operational_capacity=occ.verified_operational_capacity,
                occupied_count=occ.occupied_count,
                reserved_count=occ.reserved_count,
                available_count=available,
                occupancy_pct=pct,
                status=status,
                is_simulated=occ.is_simulated,
                verification_notes=occ.verification_notes,
                updated_by=occ.updated_by,
                updated_at=occ.updated_at.isoformat()
            )

    @staticmethod
    def recommend_shelters(req: ShelterRecommendationRequest, db: Session) -> ShelterRecommendationResponse:
        """
        Intelligently recommends relief shelters based on:
        1. Verified available capacity for the group size.
        2. Proximity from user GPS location (straight-line + estimated road distance).
        3. Automatic fallback alternatives if the nearest shelter is full or unverified.
        """
        ShelterService.ensure_pilot_shelters_seeded(db)
        ShelterService.cleanup_expired_reservations(db)

        data = ShelterService._load_data()
        records: List[Dict[str, Any]] = data.get("records", [])

        # Fetch all operational occupancy records
        all_occ = db.query(ShelterOccupancy).all()
        occ_map = {o.shelter_id: o for o in all_occ}

        verified_candidates: List[Tuple[float, Dict[str, Any], ShelterOccupancy, int, str]] = []
        unverified_candidates: List[Tuple[float, Dict[str, Any]]] = []

        for r in records:
            if req.district_id and req.district_id.lower() != "all":
                if r.get("district_id", "").lower() != req.district_id.lower().strip():
                    continue

            lat, lng = r.get("latitude"), r.get("longitude")
            if lat is None or lng is None:
                continue

            dist = haversine_km(req.user_lat, req.user_lng, lat, lng)
            if req.max_distance_km and dist > req.max_distance_km:
                continue

            occ = occ_map.get(r["id"])
            if occ and occ.is_operational and occ.verified_operational_capacity is not None:
                status, available, _ = occ.calculate_status()
                verified_candidates.append((dist, r, occ, available, status))
            else:
                unverified_candidates.append((dist, r))

        # Sort by distance
        verified_candidates.sort(key=lambda x: x[0])
        unverified_candidates.sort(key=lambda x: x[0])

        nearest_was_full = False
        nearest_full_name: Optional[str] = None
        primary_rec: Optional[RecommendedShelterItem] = None
        alternatives: List[RecommendedShelterItem] = []

        # Check if the closest verified facility exists
        if verified_candidates:
            closest_dist, closest_r, closest_occ, closest_avail, closest_status = verified_candidates[0]

            if closest_avail < req.group_size:
                # Nearest verified shelter cannot accommodate the group
                nearest_was_full = True
                nearest_full_name = closest_r.get("name", "Nearest Shelter")

                # Find next verified candidate with sufficient capacity
                eligible_verified = [c for c in verified_candidates if c[3] >= req.group_size]
                if eligible_verified:
                    best_dist, best_r, best_occ, best_avail, best_status = eligible_verified[0]
                    road_est = round(best_dist * 1.35, 1)
                    primary_rec = RecommendedShelterItem(
                        shelter_id=best_r["id"],
                        name=best_r["name"],
                        district_id=best_r["district_id"],
                        district_name=best_r["district_name"],
                        latitude=best_r["latitude"],
                        longitude=best_r["longitude"],
                        straight_line_distance_km=best_dist,
                        estimated_road_distance_km=road_est,
                        occupancy_status=best_status,
                        verified_operational=True,
                        available_capacity=best_avail,
                        total_capacity=best_occ.total_capacity,
                        recommendation_reason=(
                            f"Nearest verified center with sufficient capacity for {req.group_size} persons. "
                            f"(Nearest facility '{nearest_full_name}' is currently at capacity)."
                        ),
                        is_primary=True,
                        is_alternative=False,
                        hazard_warning="Estimated road distance. Road safety must be confirmed with local control room before transit."
                    )

                    # Populate other alternatives
                    for d, r, occ, avail, status in eligible_verified[1:4]:
                        alternatives.append(RecommendedShelterItem(
                            shelter_id=r["id"],
                            name=r["name"],
                            district_id=r["district_id"],
                            district_name=r["district_name"],
                            latitude=r["latitude"],
                            longitude=r["longitude"],
                            straight_line_distance_km=d,
                            estimated_road_distance_km=round(d * 1.35, 1),
                            occupancy_status=status,
                            verified_operational=True,
                            available_capacity=avail,
                            total_capacity=occ.total_capacity,
                            recommendation_reason=f"Alternative verified shelter with {avail} available beds.",
                            is_primary=False,
                            is_alternative=True
                        ))
            else:
                # Closest verified facility has capacity
                road_est = round(closest_dist * 1.35, 1)
                primary_rec = RecommendedShelterItem(
                    shelter_id=closest_r["id"],
                    name=closest_r["name"],
                    district_id=closest_r["district_id"],
                    district_name=closest_r["district_name"],
                    latitude=closest_r["latitude"],
                    longitude=closest_r["longitude"],
                    straight_line_distance_km=closest_dist,
                    estimated_road_distance_km=road_est,
                    occupancy_status=closest_status,
                    verified_operational=True,
                    available_capacity=closest_avail,
                    total_capacity=closest_occ.total_capacity,
                    recommendation_reason=f"Closest verified operational shelter with {closest_avail} beds available.",
                    is_primary=True,
                    is_alternative=False,
                    hazard_warning="Estimated road distance. Road safety must be confirmed with local control room before transit."
                )

                for d, r, occ, avail, status in verified_candidates[1:4]:
                    if avail >= req.group_size:
                        alternatives.append(RecommendedShelterItem(
                            shelter_id=r["id"],
                            name=r["name"],
                            district_id=r["district_id"],
                            district_name=r["district_name"],
                            latitude=r["latitude"],
                            longitude=r["longitude"],
                            straight_line_distance_km=d,
                            estimated_road_distance_km=round(d * 1.35, 1),
                            occupancy_status=status,
                            verified_operational=True,
                            available_capacity=avail,
                            total_capacity=occ.total_capacity,
                            recommendation_reason=f"Secondary verified safe-spot with {avail} beds available.",
                            is_primary=False,
                            is_alternative=True
                        ))

        # Fallback: if no verified shelters available in range, supply nearest unverified baseline with clear disclosure
        if not primary_rec and unverified_candidates:
            d, r = unverified_candidates[0]
            primary_rec = RecommendedShelterItem(
                shelter_id=r["id"],
                name=r["name"],
                district_id=r["district_id"],
                district_name=r["district_name"],
                latitude=r["latitude"],
                longitude=r["longitude"],
                straight_line_distance_km=d,
                estimated_road_distance_km=round(d * 1.35, 1),
                occupancy_status="UNVERIFIED",
                verified_operational=False,
                available_capacity=0,
                total_capacity=r.get("capacity_persons"),
                recommendation_reason=(
                    "No verified operational shelters found in current search radius. "
                    "Displaying nearest historical designated facility from SEOC registry. "
                    "Opening status and capacity MUST be confirmed with Taluk Control Room (1077/112)."
                ),
                is_primary=True,
                is_alternative=False,
                hazard_warning="UNVERIFIED: Call 1077/112 before moving."
            )

        return ShelterRecommendationResponse(
            primary_recommendation=primary_rec,
            alternatives=alternatives,
            nearest_facility_was_full=nearest_was_full,
            nearest_full_facility_name=nearest_full_name,
            group_size=req.group_size
        )
