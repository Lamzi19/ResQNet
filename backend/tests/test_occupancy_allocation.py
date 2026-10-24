import pytest
from datetime import datetime, timedelta
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.app.main import app
from backend.app.database.connection import SessionLocal
from backend.app.database.models import ShelterOccupancy, ShelterReservation
from backend.app.services.shelter_service import ShelterService

client = TestClient(app)


@pytest.fixture(autouse=True)
def init_pilot_shelters():
    """Ensure pilot shelters are seeded and cleaned before each test and reset on teardown."""
    db: Session = SessionLocal()
    try:
        # Delete tables so ensure_pilot_shelters_seeded recreates a fresh clean state
        db.query(ShelterReservation).delete()
        db.query(ShelterOccupancy).delete()
        db.commit()
        ShelterService.ensure_pilot_shelters_seeded(db)
    finally:
        db.close()
    yield
    db = SessionLocal()
    try:
        db.query(ShelterReservation).delete()
        db.query(ShelterOccupancy).delete()
        db.commit()
        ShelterService.ensure_pilot_shelters_seeded(db)
    finally:
        db.close()


def test_shelter_occupancy_model_calculations():
    """Verify occupancy percentage and status transitions on the model directly."""
    # Unverified
    occ = ShelterOccupancy(shelter_id="test_01", is_operational=False, total_capacity=200)
    status, avail, pct = occ.calculate_status()
    assert status == "UNVERIFIED"
    assert avail == 0
    assert pct is None

    # Available
    occ_avail = ShelterOccupancy(
        shelter_id="test_02",
        is_operational=True,
        verified_operational_capacity=100,
        occupied_count=40,
        reserved_count=10
    )
    status, avail, pct = occ_avail.calculate_status()
    assert status == "AVAILABLE"
    assert avail == 50
    assert pct == 50.0

    # Limited (>75% occupied)
    occ_lim = ShelterOccupancy(
        shelter_id="test_03",
        is_operational=True,
        verified_operational_capacity=100,
        occupied_count=75,
        reserved_count=5
    )
    status, avail, pct = occ_lim.calculate_status()
    assert status == "LIMITED"
    assert avail == 20
    assert pct == 80.0

    # Full (avail == 0)
    occ_full = ShelterOccupancy(
        shelter_id="test_04",
        is_operational=True,
        verified_operational_capacity=100,
        occupied_count=90,
        reserved_count=10
    )
    status, avail, pct = occ_full.calculate_status()
    assert status == "FULL"
    assert avail == 0
    assert pct == 100.0


def test_unverified_shelters_return_unverified_and_reject_reservation():
    """Historical registry facilities without active verification cannot be booked."""
    # Fetch shelters list
    resp = client.get("/api/shelters?limit=20")
    assert resp.status_code == 200
    data = resp.json()
    assert "facilities" in data

    # Find an unverified shelter
    unverified = next((f for f in data["facilities"] if f["occupancy"]["status"] == "UNVERIFIED"), None)
    assert unverified is not None
    assert unverified["occupancy"]["available_count"] == 0
    assert unverified["occupancy"]["is_operational"] is False

    # Attempt to reserve space at the unverified facility
    res_resp = client.post("/api/shelters/reserve", json={
        "shelter_id": unverified["id"],
        "group_size": 2,
        "citizen_contact": "Citizen Alice"
    })
    assert res_resp.status_code == 400
    assert "not been verified" in res_resp.json()["detail"].lower()


def test_reservation_lifecycle_and_capacity_decrement():
    """Citizen can create a reservation on an eligible verified shelter."""
    # kl_camp_03025: verified=150, occupied=35, reserved=10 -> initial available=105
    reserve_resp = client.post("/api/shelters/reserve", json={
        "shelter_id": "kl_camp_03025",
        "group_size": 4,
        "citizen_contact": "+91-9447000000",
        "notes": "Family with 1 elderly person",
        "expiry_minutes": 60
    })
    assert reserve_resp.status_code == 200
    res_data = reserve_resp.json()
    assert res_data["id"].startswith("RES-")
    assert res_data["status"] == "ACTIVE"
    assert res_data["group_size"] == 4
    assert res_data["available_capacity_after"] == 101  # 105 - 4

    # Verify that reserved count is updated in the database
    db: Session = SessionLocal()
    occ = db.query(ShelterOccupancy).filter(ShelterOccupancy.shelter_id == "kl_camp_03025").first()
    assert occ.reserved_count == 14  # 10 baseline + 4
    db.close()


def test_over_capacity_reservation_rejected():
    """Requesting more beds than available triggers 409 Conflict."""
    # kl_camp_03062 is seeded as FULL (capacity 100, occupied 95, reserved 5 -> avail 0)
    res_resp = client.post("/api/shelters/reserve", json={
        "shelter_id": "kl_camp_03062",
        "group_size": 2,
        "citizen_contact": "Traveler Bob"
    })
    assert res_resp.status_code == 409
    assert "Insufficient verified capacity" in res_resp.json()["detail"]


def test_check_in_lifecycle_once_only():
    """Confirmed check-in moves reservation to CHECKED_IN and updates occupied count exactly once."""
    # 1. Reserve 3 beds
    res_resp = client.post("/api/shelters/reserve", json={
        "shelter_id": "kl_camp_03025",
        "group_size": 3,
        "citizen_contact": "Arriving Evacuee"
    })
    assert res_resp.status_code == 200
    res_id = res_resp.json()["id"]

    # 2. Check in
    checkin_resp = client.post("/api/shelters/check-in", json={
        "reservation_id": res_id
    })
    assert checkin_resp.status_code == 200
    checkin_data = checkin_resp.json()
    assert checkin_data["status"] == "CHECKED_IN"
    assert checkin_data["checked_in_at"] is not None

    # Check occupancy counts: occupied increased by 3, reserved decreased by 3
    db: Session = SessionLocal()
    occ = db.query(ShelterOccupancy).filter(ShelterOccupancy.shelter_id == "kl_camp_03025").first()
    assert occ.occupied_count == 38  # 35 + 3
    assert occ.reserved_count == 10  # 10 + 3 - 3
    db.close()

    # 3. Duplicate check-in rejection
    dup_resp = client.post("/api/shelters/check-in", json={
        "reservation_id": res_id
    })
    assert dup_resp.status_code == 400
    assert "duplicate check-in rejected" in dup_resp.json()["detail"].lower()


def test_cancellation_releases_capacity():
    """Cancelling an active reservation immediately returns held capacity."""
    # Reserve 5 beds
    res_resp = client.post("/api/shelters/reserve", json={
        "shelter_id": "kl_camp_03025",
        "group_size": 5
    })
    res_id = res_resp.json()["id"]

    # Cancel reservation
    cancel_resp = client.post("/api/shelters/cancel", json={
        "reservation_id": res_id,
        "reason": "Found alternative shelter with relatives"
    })
    assert cancel_resp.status_code == 200
    cancel_data = cancel_resp.json()
    assert cancel_data["status"] == "CANCELLED"
    assert cancel_data["cancelled_at"] is not None

    # Verify capacity was released
    db: Session = SessionLocal()
    occ = db.query(ShelterOccupancy).filter(ShelterOccupancy.shelter_id == "kl_camp_03025").first()
    assert occ.reserved_count == 10  # returned to baseline
    db.close()

    # Attempting to check in a cancelled reservation must be rejected
    checkin_resp = client.post("/api/shelters/check-in", json={
        "reservation_id": res_id
    })
    assert checkin_resp.status_code == 400
    assert "previously cancelled" in checkin_resp.json()["detail"]


def test_reservation_expiry_cleanup():
    """Expired reservations are transitioned to EXPIRED and held capacity is released."""
    db: Session = SessionLocal()
    try:
        occ = db.query(ShelterOccupancy).filter(ShelterOccupancy.shelter_id == "kl_camp_03025").first()
        initial_reserved = occ.reserved_count

        # Artificially insert an expired reservation
        expired_res = ShelterReservation(
            id="RES-EXPTEST01",
            shelter_id="kl_camp_03025",
            group_size=6,
            status="ACTIVE",
            created_at=datetime.utcnow() - timedelta(hours=3),
            expires_at=datetime.utcnow() - timedelta(hours=1)
        )
        occ.reserved_count += 6
        db.add(expired_res)
        db.commit()

        # Trigger cleanup
        cleaned = ShelterService.cleanup_expired_reservations(db)
        assert cleaned >= 1

        db.refresh(expired_res)
        db.refresh(occ)
        assert expired_res.status == "EXPIRED"
        assert occ.reserved_count == initial_reserved
    finally:
        db.close()


def test_staff_capacity_update_and_pin_protection():
    """Ordinary users cannot modify operational capacity; authorized staff PIN is required."""
    # Bad PIN
    unauth_resp = client.post("/api/shelters/staff/update", json={
        "shelter_id": "kl_camp_03025",
        "is_operational": True,
        "verified_operational_capacity": 250,
        "staff_pin": "wrong_pin"
    })
    assert unauth_resp.status_code == 403

    # Valid staff PIN
    auth_resp = client.post("/api/shelters/staff/update", json={
        "shelter_id": "kl_camp_03025",
        "is_operational": True,
        "verified_operational_capacity": 180,
        "occupied_count": 40,
        "verification_notes": "DDMA inspection confirmed additional classroom wing opened.",
        "updated_by": "Ernakulam Incident Commander",
        "staff_pin": "kerala112"
    })
    assert auth_resp.status_code == 200
    data = auth_resp.json()
    assert data["verified_operational_capacity"] == 180
    assert data["occupied_count"] == 40
    assert data["status"] in ["AVAILABLE", "LIMITED"]


def test_intelligent_recommendation_and_full_shelter_fallback():
    """
    When user is closer to a FULL shelter, recommendation engine marks the nearest as full
    and provides the nearest eligible verified alternative.
    """
    # kl_camp_03062 (Kalamassery, Ernakulam): lat 10.0524, lon 76.3288 (FULL)
    # kl_camp_03025 (Aluva, Ernakulam): lat 10.074861, lon 76.379131 (AVAILABLE with >100 beds)
    # User coordinates near Kalamassery (closer to 03062 than 03025):
    user_lat, user_lng = 10.051, 76.329

    rec_resp = client.post("/api/shelters/recommend", json={
        "user_lat": user_lat,
        "user_lng": user_lng,
        "group_size": 4,
        "district_id": "ernakulam",
        "max_distance_km": 50.0
    })
    assert rec_resp.status_code == 200
    rec_data = rec_resp.json()

    assert rec_data["nearest_facility_was_full"] is True
    assert rec_data["nearest_full_facility_name"] is not None
    assert rec_data["primary_recommendation"] is not None
    # Primary recommendation should be the available facility
    assert rec_data["primary_recommendation"]["available_capacity"] >= 4
    assert rec_data["primary_recommendation"]["estimated_road_distance_km"] is not None
    assert rec_data["primary_recommendation"]["straight_line_distance_km"] > 0
    assert "at capacity" in rec_data["primary_recommendation"]["recommendation_reason"].lower() or "sufficient capacity" in rec_data["primary_recommendation"]["recommendation_reason"].lower()


def test_concurrent_reservations_cannot_exceed_capacity():
    """Sequential simulation of concurrent reservation requests prevents overselling capacity."""
    # Set a pilot shelter with exactly 5 beds remaining
    db: Session = SessionLocal()
    db.query(ShelterReservation).filter(ShelterReservation.shelter_id == "kl_camp_03025").delete()
    occ = db.query(ShelterOccupancy).filter(ShelterOccupancy.shelter_id == "kl_camp_03025").first()
    occ.verified_operational_capacity = 50
    occ.occupied_count = 45
    occ.reserved_count = 0
    db.commit()
    db.close()

    # Request 1: 3 beds -> should succeed (2 left)
    r1 = client.post("/api/shelters/reserve", json={
        "shelter_id": "kl_camp_03025",
        "group_size": 3,
        "citizen_contact": "User 1"
    })
    assert r1.status_code == 200

    # Request 2: 3 beds -> should fail (only 2 left)
    r2 = client.post("/api/shelters/reserve", json={
        "shelter_id": "kl_camp_03025",
        "group_size": 3,
        "citizen_contact": "User 2"
    })
    assert r2.status_code == 409

    # Request 3: 2 beds -> should succeed (0 left)
    r3 = client.post("/api/shelters/reserve", json={
        "shelter_id": "kl_camp_03025",
        "group_size": 2,
        "citizen_contact": "User 3"
    })
    assert r3.status_code == 200

    # Request 4: 1 bed -> should fail (0 left)
    r4 = client.post("/api/shelters/reserve", json={
        "shelter_id": "kl_camp_03025",
        "group_size": 1,
        "citizen_contact": "User 4"
    })
    assert r4.status_code == 409


def test_verified_shelter_capacity_250_occupancy_25_persists_in_get_shelters():
    """
    Core bug requirement test:
    When authorised staff verify a shelter and set operational capacity to 250
    and occupied people to 25:
    1. Persist those values in the database.
    2. GET /api/shelters?limit=7000 returns operational capacity 250, occupied 25,
       reserved 0, available 225, status AVAILABLE, and is_verified_operational_2026=True.
    3. Unverified shelters in the same response remain clearly labelled UNVERIFIED
       with no verified capacity fabricated.
    4. Reservation followed by check-in moves people from reserved to occupied
       without changing total usage.
    """
    # 1. Staff verifies shelter kl_camp_00002
    update_resp = client.post("/api/shelters/staff/update", json={
        "shelter_id": "kl_camp_00002",
        "is_operational": True,
        "verified_operational_capacity": 250,
        "occupied_count": 25,
        "verification_notes": "Official inspection: 250 beds operational, 25 currently occupied.",
        "updated_by": "Ernakulam Incident Commander",
        "is_simulated": False,
        "staff_pin": "kerala112"
    })
    assert update_resp.status_code == 200
    occ = update_resp.json()
    assert occ["verified_operational_capacity"] == 250
    assert occ["occupied_count"] == 25
    assert occ["reserved_count"] == 0
    assert occ["available_count"] == 225
    assert occ["status"] == "AVAILABLE"
    assert occ["is_simulated"] is False

    # 2. GET /api/shelters?limit=7000 returns the updated facility with matching values
    get_resp = client.get("/api/shelters?limit=7000")
    assert get_resp.status_code == 200
    data = get_resp.json()
    assert data["mapped_facilities_count"] == 6001

    target = next((f for f in data["facilities"] if f["id"] == "kl_camp_00002"), None)
    assert target is not None, "Target facility kl_camp_00002 must exist in GET /api/shelters"
    assert target["is_verified_operational_2026"] is True
    assert target["occupancy"]["is_operational"] is True
    assert target["occupancy"]["verified_operational_capacity"] == 250
    assert target["occupancy"]["occupied_count"] == 25
    assert target["occupancy"]["reserved_count"] == 0
    assert target["occupancy"]["available_count"] == 225
    assert target["occupancy"]["status"] == "AVAILABLE"
    assert target["occupancy"]["is_simulated"] is False

    # 3. Unverified historical shelters remain explicitly UNVERIFIED
    unverified = next((f for f in data["facilities"] if f["occupancy"]["status"] == "UNVERIFIED"), None)
    assert unverified is not None
    assert unverified["is_verified_operational_2026"] is False
    assert unverified["occupancy"]["is_operational"] is False
    assert unverified["occupancy"]["verified_operational_capacity"] is None
    assert unverified["occupancy"]["available_count"] == 0

    # 4. Reservation of 5 beds: occupied=25, reserved=5, available=220
    res_resp = client.post("/api/shelters/reserve", json={
        "shelter_id": "kl_camp_00002",
        "group_size": 5,
        "citizen_contact": "Citizen 250 Test"
    })
    assert res_resp.status_code == 200
    res_id = res_resp.json()["id"]
    assert res_resp.json()["available_capacity_after"] == 220

    # Verify GET /api/shelters reflects reserved count
    get_res_resp = client.get("/api/shelters?limit=7000")
    target_res = next((f for f in get_res_resp.json()["facilities"] if f["id"] == "kl_camp_00002"), None)
    assert target_res["occupancy"]["occupied_count"] == 25
    assert target_res["occupancy"]["reserved_count"] == 5
    assert target_res["occupancy"]["available_count"] == 220

    # 5. Check-in moves from reserved to occupied (occupied=30, reserved=0, available=220)
    checkin_resp = client.post("/api/shelters/check-in", json={
        "reservation_id": res_id
    })
    assert checkin_resp.status_code == 200
    assert checkin_resp.json()["status"] == "CHECKED_IN"

    get_checkin_resp = client.get("/api/shelters?limit=7000")
    target_checkin = next((f for f in get_checkin_resp.json()["facilities"] if f["id"] == "kl_camp_00002"), None)
    assert target_checkin["occupancy"]["occupied_count"] == 30
    assert target_checkin["occupancy"]["reserved_count"] == 0
    assert target_checkin["occupancy"]["available_count"] == 220


def test_staff_update_simulated_drill_mode():
    """Staff updates marked as simulation are tagged is_simulated=True and visible in API."""
    sim_resp = client.post("/api/shelters/staff/update", json={
        "shelter_id": "kl_camp_00003",
        "is_operational": True,
        "verified_operational_capacity": 150,
        "occupied_count": 50,
        "verification_notes": "KSDMA Monsoon Preparedness Mock Drill Scenario",
        "is_simulated": True,
        "staff_pin": "kerala112"
    })
    assert sim_resp.status_code == 200
    data = sim_resp.json()
    assert data["is_simulated"] is True
    assert data["available_count"] == 100

    # Ensure GET /api/shelters reflects is_simulated=True
    get_resp = client.get("/api/shelters?limit=7000")
    target = next((f for f in get_resp.json()["facilities"] if f["id"] == "kl_camp_00003"), None)
    assert target is not None
    assert target["occupancy"]["is_simulated"] is True

