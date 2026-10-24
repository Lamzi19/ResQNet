from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any

from backend.app.config import settings, SUPPORTED_LOCATIONS
from backend.app.database.connection import get_db
from backend.app.database.models import PredictionRecord, AlertEvent, OfficialAdvisory
from backend.app.schemas.prediction import (
    LocationOut, WeatherResponse, PredictionRequest, PredictionResponse,
    AlertOut, TestAlertRequest, OfficialAdvisoryOut
)
from backend.app.schemas.shelter import (
    ReliefFacilitiesResponse, ReservationRequest, ReservationResponse,
    CheckInRequest, CancelReservationRequest, StaffCapacityUpdateRequest,
    ShelterRecommendationRequest, ShelterRecommendationResponse, ShelterOccupancyInfo
)
from backend.app.schemas.sos import (
    SosSubmissionRequest, SosStatusUpdateRequest, SosIncidentOut,
    RescueBoatOut, BoatStatusUpdateRequest, RiskZoneOut,
    ParticipantRegisterRequest, ParticipantOut,
    SafetyBroadcastCreateRequest, SafetyBroadcastOut,
    RecipientStateOut, SafetyResponseRequest,
    ManualEscalationRequest, SosRelayRequest,
    RescuerAckRequest, StopForwardingResponse,
    BleBeaconIngestRequest, IncidentMessageCreate, IncidentMessageOut, MessageAckRequest
)
from datetime import datetime
from backend.app.services.weather_service import WeatherService
from backend.app.services.predictor_service import PredictorService
from backend.app.services.warning_engine import WarningEngine
from backend.app.services.sos_service import SosService
from backend.app.services.safety_broadcast_service import SafetyBroadcastService

router = APIRouter()


@router.get("/health", tags=["System"])
def health_check():
    return {
        "status": "online",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "supported_locations": list(SUPPORTED_LOCATIONS.keys()),
        "mode": "Phase 1 - Prototype / Experimental"
    }


@router.get("/locations", response_model=List[LocationOut], tags=["Locations"])
def get_locations(region: Optional[str] = Query(default=None, description="Filter by region ('kerala' or 'karnataka_archive')")):
    """List supported monitoring locations with basin, terrain, and vulnerability context."""
    locs = list(SUPPORTED_LOCATIONS.values())
    if region:
        locs = [l for l in locs if getattr(l, "region", "kerala") == region]
    return [
        LocationOut(
            id=loc.id,
            name=loc.name,
            latitude=loc.latitude,
            longitude=loc.longitude,
            elevation_m=loc.elevation_m,
            basin=loc.basin,
            vulnerability_notes=loc.vulnerability_notes,
            malayalam_name=getattr(loc, "malayalam_name", None),
            is_coastal=getattr(loc, "is_coastal", False),
            region=getattr(loc, "region", "kerala"),
            data_coverage_status=getattr(loc, "data_coverage_status", "FULL_MULTI_FACTOR"),
            terrain_type=getattr(loc, "terrain_type", None)
        )
        for loc in locs
    ]


@router.get("/weather/{location_id}", response_model=WeatherResponse, tags=["Weather"])
def get_weather_for_location(location_id: str, force_refresh: bool = False):
    """Retrieve normalized live weather observations, antecedent rainfall, and 48-hour forecast."""
    try:
        data = WeatherService.get_weather(location_id, force_refresh=force_refresh)
        return WeatherResponse(**data)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Weather retrieval failure: {str(e)}")


@router.post("/predict", response_model=PredictionResponse, tags=["Prediction"])
def generate_prediction(req: PredictionRequest, db: Session = Depends(get_db)):
    """Generate 24-hour flood risk estimate using trained ML pipeline (v1 or v2), evaluate warning rules, and log record."""
    try:
        prediction = PredictorService.predict(
            location_id=req.location_id,
            model_version=req.model_version,
            manual_forecast_override=req.manual_forecast_override_mm,
            simulation_scenario=req.simulation_scenario,
            db_session=db
        )
        # Evaluate warning rules immediately
        WarningEngine.evaluate_and_notify(prediction, db=db)
        return prediction
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction error: {str(e)}")


@router.get("/models", tags=["Model Intelligence"])
def get_model_comparison():
    """Retrieve verified metrics comparison between Version 1 (Rainfall Baseline) and Version 2 (Multi-Factor Coastal)."""
    import json
    import os
    comp_path = os.path.join(os.path.dirname(__file__), "..", "..", "..", "ml", "reports", "model_v1_v2_comparison_report.json")
    if os.path.exists(comp_path):
        with open(comp_path, "r") as f:
            return json.load(f)
    return {"status": "Comparison report not yet generated."}


@router.get("/predictions", tags=["Prediction"])
def get_prediction_history(location_id: Optional[str] = None, limit: int = Query(default=25, le=100), db: Session = Depends(get_db)):
    """Retrieve recent recorded prediction history for model evaluation and audit tracking."""
    query = db.query(PredictionRecord)
    if location_id:
        query = query.filter(PredictionRecord.location_id == location_id)
    records = query.order_by(PredictionRecord.timestamp.desc()).limit(limit).all()

    return [
        {
            "id": r.id,
            "location_id": r.location_id,
            "timestamp": r.timestamp.isoformat() + "Z",
            "weather_observed_at": r.weather_observed_at,
            "risk_probability": r.risk_probability,
            "baseline_probability": r.baseline_probability,
            "risk_level": r.risk_level,
            "forecast_precip_24h_mm": r.forecast_precip_24h_mm,
            "past_72h_precip_mm": r.past_72h_precip_mm,
            "model_version": r.model_version,
            "data_freshness": r.data_freshness_status
        }
        for r in records
    ]


@router.get("/alerts", response_model=List[AlertOut], tags=["Early Warning"])
def get_recent_alerts(limit: int = Query(default=20, le=50), db: Session = Depends(get_db)):
    """Retrieve warning and notification event history."""
    return WarningEngine.get_recent_alerts(limit=limit, db=db)


@router.post("/alerts/test", response_model=AlertOut, tags=["Early Warning"])
def trigger_test_alert(req: TestAlertRequest, db: Session = Depends(get_db)):
    """Trigger a clearly labelled in-app test notification for demo and connectivity verification."""
    return WarningEngine.trigger_test_alert(req, db=db)


@router.get("/advisories", response_model=List[OfficialAdvisoryOut], tags=["Official Directives"])
def get_official_advisories(db: Session = Depends(get_db)):
    """Retrieve active state/district official disaster warnings (IMD / KSNDMC)."""
    advisories = db.query(OfficialAdvisory).filter(OfficialAdvisory.is_active == True).all()
    return [
        OfficialAdvisoryOut(
            district=a.district,
            alert_color=a.alert_color,
            issuing_agency=a.issuing_agency,
            issued_at=a.issued_at.isoformat() + "Z",
            description=a.description,
            is_active=a.is_active
        )
        for a in advisories
    ]


@router.get("/geography/kerala", tags=["Geography"])
def get_kerala_geography():
    """Retrieve verified centralized Kerala geography, district bounding boxes, river basins, and coastal stations."""
    from backend.app.geography_kerala import (
        KERALA_DISTRICTS,
        KERALA_RIVER_BASINS,
        KERALA_COASTAL_STATIONS,
        KERALA_DISTRICT_BOUNDS
    )
    return {
        "districts": [
            {
                **d.dict(),
                "bounds": KERALA_DISTRICT_BOUNDS.get(d.id, [])
            }
            for d in KERALA_DISTRICTS.values()
        ],
        "river_basins": [b.dict() for b in KERALA_RIVER_BASINS.values()],
        "coastal_stations": [s.dict() for s in KERALA_COASTAL_STATIONS.values()]
    }


@router.get("/shelters", response_model=ReliefFacilitiesResponse, tags=["Relief & Evacuation"])
def get_relief_facilities(
    district_id: Optional[str] = Query(default=None, description="Filter by Kerala district ID (e.g. 'ernakulam')"),
    query: Optional[str] = Query(default=None, description="Search keyword for camp name, village, or LSG"),
    limit: int = Query(default=7000, ge=1, le=10000, description="Max facilities to return"),
    offset: int = Query(default=0, ge=0, description="Pagination offset"),
    db: Session = Depends(get_db)
):
    """
    Retrieve baseline Kerala relief and evacuation facilities from SEOC GIS registry
    with attached live shelter occupancy models.
    """
    from backend.app.services.shelter_service import ShelterService
    return ShelterService.get_shelters(
        db=db,
        district_id=district_id,
        search_query=query,
        limit=limit,
        offset=offset
    )


@router.post("/shelters/reserve", response_model=ReservationResponse, tags=["Relief & Evacuation"])
def reserve_shelter_space(
    payload: ReservationRequest,
    db: Session = Depends(get_db)
):
    """
    Atomically creates a timed reservation for shelter space.
    Rejects reservations for unverified or full shelters.
    """
    from backend.app.services.shelter_service import ShelterService
    return ShelterService.create_reservation(payload, db)


@router.post("/shelters/check-in", response_model=ReservationResponse, tags=["Relief & Evacuation"])
def check_in_shelter(
    payload: CheckInRequest,
    db: Session = Depends(get_db)
):
    """
    Confirms arrival and check-in for an active reservation exactly once.
    Transitions reservation to CHECKED_IN and moves held capacity to occupied count.
    """
    from backend.app.services.shelter_service import ShelterService
    return ShelterService.check_in_reservation(payload, db)


@router.post("/shelters/cancel", response_model=ReservationResponse, tags=["Relief & Evacuation"])
def cancel_shelter_reservation(
    payload: CancelReservationRequest,
    db: Session = Depends(get_db)
):
    """
    Cancels an active reservation and immediately releases held capacity.
    """
    from backend.app.services.shelter_service import ShelterService
    return ShelterService.cancel_reservation(payload, db)


@router.post("/shelters/staff/update", response_model=ShelterOccupancyInfo, tags=["Relief & Evacuation"])
def staff_update_shelter_capacity(
    payload: StaffCapacityUpdateRequest,
    db: Session = Depends(get_db)
):
    """
    Authorized responder / camp officer endpoint to update verified operational capacity
    and live occupancy counts. Requires responder PIN.
    """
    from backend.app.services.shelter_service import ShelterService
    return ShelterService.update_staff_capacity(payload, db)


@router.post("/shelters/recommend", response_model=ShelterRecommendationResponse, tags=["Relief & Evacuation"])
def recommend_shelters(
    payload: ShelterRecommendationRequest,
    db: Session = Depends(get_db)
):
    """
    Intelligently recommends safe evacuation spots based on live GPS location, group size,
    verified operational capacity, road distance, and fallback alternatives if nearest is full.
    """
    from backend.app.services.shelter_service import ShelterService
    return ShelterService.recommend_shelters(payload, db)


# ==========================================
# ResQNet Live SOS & Fleet Command Endpoints
# ==========================================

@router.post("/sos", response_model=SosIncidentOut, status_code=201, tags=["SOS & Rescue Fleet"])
def submit_distress_beacon(
    payload: SosSubmissionRequest,
    db: Session = Depends(get_db)
):
    """
    Ingest citizen distress beacon from Android app or BLE mesh gateway.
    Performs deduplication, spatial district mapping, and dynamic triage scoring.
    """
    return SosService.ingest_sos(req=payload, db=db)


@router.get("/sos", response_model=List[SosIncidentOut], tags=["SOS & Rescue Fleet"])
def list_distress_incidents(
    district: Optional[str] = Query(default=None, description="Optional Kerala district filter (e.g. 'ernakulam')"),
    include_demo: bool = Query(default=False, description="Whether to include synthetic demo/test records (default: False, real live incidents only)"),
    db: Session = Depends(get_db)
):
    """
    Retrieve live distress incidents sorted by triage priority score and recency.
    By default, returns only genuine live beacons (excluding demo/synthetic records).
    """
    return SosService.get_incidents(district_id=district, include_demo=include_demo, db=db)


@router.post("/sos/ble-ingest", response_model=SosIncidentOut, status_code=201, tags=["SOS & Rescue Fleet"])
def ingest_ble_distress_beacon(
    payload: BleBeaconIngestRequest,
    db: Session = Depends(get_db)
):
    """
    Ingest distress beacon received over Bluetooth Low Energy by the local laptop receiver.
    Decoded from over-the-air 25-byte BLE broadcast packets without requiring internet.
    """
    return SosService.ingest_ble_beacon(req=payload, db=db)


@router.patch("/sos/{incident_id}/status", response_model=SosIncidentOut, tags=["SOS & Rescue Fleet"])
def update_distress_status(
    incident_id: str,
    payload: SosStatusUpdateRequest,
    db: Session = Depends(get_db)
):
    """
    Update incident response status (unassigned, assigned, en_route, on_site, rescued, closed)
    and synchronize tasking with assigned rescue boat.
    """
    try:
        return SosService.update_incident_status(incident_id=incident_id, req=payload, db=db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/sos/message/{message_id}", response_model=SosIncidentOut, tags=["SOS & Rescue Fleet"])
def get_sos_by_message_id(
    message_id: str,
    db: Session = Depends(get_db)
):
    """
    Look up a distress incident by client-generated unique message UUID.
    Returns authoritative server persistence receipt and acknowledgement state.
    """
    incident = SosService.get_incident_by_message_id(message_id=message_id, db=db)
    if not incident:
        raise HTTPException(status_code=404, detail=f"Distress beacon with message_id '{message_id}' not found on server.")
    return incident


@router.post("/sos/{incident_id}/rescuer-ack", response_model=SosIncidentOut, tags=["SOS & Rescue Fleet"])
def acknowledge_sos_by_rescuer(
    incident_id: str,
    payload: RescuerAckRequest,
    db: Session = Depends(get_db)
):
    """
    Record authoritative human rescuer acknowledgement.
    Transitions incident to ACKNOWLEDGED_BY_RESCUER and assigns commander notes.
    """
    try:
        return SosService.acknowledge_by_rescuer(incident_id=incident_id, req=payload, db=db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/sos/{incident_id}/messages", response_model=List[IncidentMessageOut], tags=["SOS & Rescue Fleet"])
def list_incident_messages(
    incident_id: str,
    db: Session = Depends(get_db)
):
    """
    Retrieve full two-way message conversation thread between citizen and responders
    associated with an SOS incident.
    """
    return SosService.get_incident_messages(incident_id=incident_id, db=db)


@router.post("/sos/{incident_id}/messages", response_model=IncidentMessageOut, status_code=201, tags=["SOS & Rescue Fleet"])
def send_incident_message(
    incident_id: str,
    payload: IncidentMessageCreate,
    db: Session = Depends(get_db)
):
    """
    Post a new two-way message to the incident conversation.
    Responder replies are stored with SAVED_ON_SERVER status until acknowledged by device.
    """
    return SosService.create_incident_message(incident_id=incident_id, req=payload, db=db)


@router.post("/sos/{incident_id}/messages/{message_id}/ack", response_model=IncidentMessageOut, tags=["SOS & Rescue Fleet"])
def acknowledge_incident_message(
    incident_id: str,
    message_id: str,
    payload: MessageAckRequest,
    db: Session = Depends(get_db)
):
    """
    Confirm physical receipt/delivery of an incident message by citizen device or gateway.
    Updates delivery status honestly to CONFIRMED_RECEIVED, SENT_TO_DEVICE, or DELIVERY_FAILED.
    """
    return SosService.acknowledge_incident_message(
        incident_id=incident_id,
        message_id=message_id,
        req=payload,
        db=db
    )


@router.get("/sos/stop-forwarding", response_model=StopForwardingResponse, tags=["SOS & Rescue Fleet"])
def get_stop_forwarding_instructions(
    since: Optional[str] = Query(default=None, description="ISO timestamp to filter recently confirmed messages"),
    db: Session = Depends(get_db)
):
    """
    Retrieve message IDs of all distress beacons confirmed by server or rescuer.
    Client devices and relay nodes query this to halt re-broadcasting confirmed beacons.
    """
    dt_since = None
    if since:
        try:
            dt_since = datetime.fromisoformat(since.replace("Z", "+00:00")).replace(tzinfo=None)
        except Exception:
            pass

    msg_ids = SosService.get_stop_forwarding_message_ids(db=db, since=dt_since)
    return StopForwardingResponse(
        confirmed_message_ids=msg_ids,
        timestamp=datetime.utcnow().isoformat() + "Z",
        count=len(msg_ids)
    )


@router.get("/boats", response_model=List[RescueBoatOut], tags=["SOS & Rescue Fleet"])
def list_rescue_boats(
    district: Optional[str] = Query(default=None, description="Optional Kerala district filter"),
    db: Session = Depends(get_db)
):
    """
    Retrieve live rescue vessels and tasking status across NDRF/Fire & Rescue bases.
    """
    return SosService.get_boats(district_id=district, db=db)


@router.patch("/boats/{boat_id}/status", response_model=RescueBoatOut, tags=["SOS & Rescue Fleet"])
def update_rescue_boat_status(
    boat_id: str,
    payload: BoatStatusUpdateRequest,
    db: Session = Depends(get_db)
):
    """
    Update rescue boat readiness status (available, deployed, maintenance).
    """
    try:
        return SosService.update_boat_status(boat_id=boat_id, req=payload, db=db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/risk", response_model=List[RiskZoneOut], tags=["SOS & Rescue Fleet"])
def get_live_risk_zones(
    district: Optional[str] = Query(default=None, description="Optional Kerala district filter"),
    db: Session = Depends(get_db)
):
    """
    Fetch active geospatial risk zones for tactical command map overlay.
    """
    return SosService.get_risk_zones(district_id=district, db=db)


@router.post("/alerts", tags=["SOS & Rescue Fleet"])
def dispatch_emergency_alert(
    payload: Dict[str, Any],
    db: Session = Depends(get_db)
):
    """
    Broadcast responder emergency alert to field units or public console.
    """
    return SosService.create_alert(payload=payload, db=db)


# ==========================================
# Safety Broadcast & Participant Endpoints
# ==========================================

@router.post("/participants", response_model=ParticipantOut, tags=["Safety Broadcasts & Registry"])
def register_participant(
    payload: ParticipantRegisterRequest,
    db: Session = Depends(get_db)
):
    """
    Register or update a participant identity and handset.
    Supports arbitrary number of participants with persistent database records.
    """
    return SafetyBroadcastService.register_participant(req=payload, db=db)


@router.get("/participants", response_model=List[ParticipantOut], tags=["Safety Broadcasts & Registry"])
def list_participants(
    district: Optional[str] = Query(default=None, description="Optional Kerala district filter"),
    db: Session = Depends(get_db)
):
    """
    List all registered disaster safety check participants.
    """
    return SafetyBroadcastService.get_participants(district_id=district, db=db)


@router.post("/broadcasts", response_model=SafetyBroadcastOut, tags=["Safety Broadcasts & Registry"])
def create_safety_broadcast(
    payload: SafetyBroadcastCreateRequest,
    db: Session = Depends(get_db)
):
    """
    Initiate a multi-device safety check broadcast with target recipients and response deadline.
    """
    try:
        return SafetyBroadcastService.create_broadcast(req=payload, db=db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/broadcasts", response_model=List[SafetyBroadcastOut], tags=["Safety Broadcasts & Registry"])
def list_safety_broadcasts(
    district: Optional[str] = Query(default=None, description="Optional Kerala district filter"),
    db: Session = Depends(get_db)
):
    """
    Retrieve history of safety check broadcasts and current recipient states.
    """
    return SafetyBroadcastService.get_broadcasts(db=db, district_id=district)


@router.get("/broadcasts/active", response_model=Optional[SafetyBroadcastOut], tags=["Safety Broadcasts & Registry"])
def get_active_safety_broadcast(
    participant_id: Optional[str] = Query(default=None, description="Participant ID polling for active broadcast"),
    device_id: Optional[str] = Query(default=None, description="Device ID polling"),
    district: Optional[str] = Query(default=None, description="District filter"),
    db: Session = Depends(get_db)
):
    """
    Device polling endpoint: checks if there is an active, unexpired safety broadcast targeting this participant/device.
    Automatically acknowledges delivery to device upon fetch.
    """
    return SafetyBroadcastService.get_active_broadcast_for_device(
        participant_id=participant_id,
        device_id=device_id,
        district_id=district,
        db=db
    )


@router.get("/broadcasts/{broadcast_id}", response_model=SafetyBroadcastOut, tags=["Safety Broadcasts & Registry"])
def get_safety_broadcast(
    broadcast_id: str,
    db: Session = Depends(get_db)
):
    """
    Fetch specific safety check broadcast with real-time recipient status and aggregated tallies.
    """
    bc = SafetyBroadcastService.get_broadcast(broadcast_id=broadcast_id, db=db)
    if not bc:
        raise HTTPException(status_code=404, detail="Safety broadcast not found")
    return bc


@router.post("/broadcasts/{broadcast_id}/respond", response_model=RecipientStateOut, tags=["Safety Broadcasts & Registry"])
def respond_to_safety_broadcast(
    broadcast_id: str,
    payload: SafetyResponseRequest,
    db: Session = Depends(get_db)
):
    """
    Citizen handset submits safety response: SAFE CONFIRMED or HELP REQUESTED.
    Automatically creates/links an SOS incident if HELP REQUESTED.
    """
    try:
        return SafetyBroadcastService.record_safety_response(broadcast_id=broadcast_id, req=payload, db=db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/broadcasts/{broadcast_id}/escalate/{participant_id}", response_model=RecipientStateOut, tags=["Safety Broadcasts & Registry"])
def escalate_participant_welfare(
    broadcast_id: str,
    participant_id: str,
    payload: Optional[ManualEscalationRequest] = None,
    db: Session = Depends(get_db)
):
    """
    Responder command center manually escalates an unanswered or at-risk participant to a full rescue SOS case.
    """
    if payload is None:
        payload = ManualEscalationRequest(participant_id=participant_id)
    else:
        payload.participant_id = participant_id

    try:
        return SafetyBroadcastService.manual_escalate(broadcast_id=broadcast_id, req=payload, db=db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/sos/relay", response_model=SosIncidentOut, status_code=201, tags=["SOS & Rescue Fleet"])
def ingest_relay_sos(
    payload: SosRelayRequest,
    db: Session = Depends(get_db)
):
    """
    Ingest peer mesh or nearby node relayed distress beacon.
    Preserves original incident coordinates and records relay node identity and hop count.
    """
    try:
        return SafetyBroadcastService.ingest_relay_sos(req=payload, db=db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))



