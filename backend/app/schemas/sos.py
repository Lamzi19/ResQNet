"""
Pydantic Schemas for Live SOS Distress Beacon Ingestion and Responder Fleet Tasking.
Supports bidirectional compatibility between:
1. Citizen Android App (Room SosEntity & BLE mesh contract)
2. ResQNet Rescuer Command Dashboard (RescueFleetDashboard)
3. Central FastAPI Early-Warning & Triage Engine
"""

from typing import List, Optional, Any
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict, model_validator


class SosSubmissionRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    # Support both Android camelCase / snake_case input
    incident_id: Optional[str] = Field(None, alias="incidentId", description="UUID of originating emergency")
    message_id: Optional[str] = Field(None, alias="messageId", description="Unique message UUID for deduplication")
    message: str = Field(..., alias="messageText", description="Emergency distress text")
    people_count: int = Field(default=1, alias="peopleCount", ge=1, le=100)
    has_vulnerable_people: bool = Field(default=False, alias="hasVulnerablePeople")
    severity: str = Field(default="MODERATE", description="CRITICAL, HIGH, MODERATE, LOW")
    category: Optional[str] = Field(default="general", description="trapped, injured, evacuation, supplies, safe, general")
    latitude: Optional[float] = Field(None, ge=-90.0, le=90.0)
    longitude: Optional[float] = Field(None, ge=-180.0, le=180.0)
    accuracy_m: Optional[float] = Field(None, alias="locationAccuracyM")
    district_id: Optional[str] = Field(None, description="Optional target district (e.g. ernakulam, wayanad)")
    location_name: Optional[str] = Field(None, description="Landmark or place description")
    origin_device_id: Optional[str] = Field(None, alias="originDeviceId")
    hop_count: int = Field(default=0, alias="hopCount")
    schema_version: str = Field(default="1.0.0", alias="schemaVersion")
    is_demo: bool = Field(default=False, alias="isDemo")


class SosStatusUpdateRequest(BaseModel):
    status: str = Field(..., description="unassigned, assigned, en_route, on_site, rescued, closed")
    assigned_boat_id: Optional[str] = None
    assigned_boat_name: Optional[str] = None
    mission_phase: Optional[str] = Field(default=None, description="standby, en_route, on_site, returning, completed")
    notes: Optional[str] = None
    priority_override_level: Optional[str] = None
    priority_override_score: Optional[int] = None
    priority_override_reason: Optional[str] = None


class SosIncidentOut(BaseModel):
    id: str
    message_id: Optional[str] = None
    district_id: str
    district_name: str
    location_name: str
    created_at: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    location_accuracy_m: Optional[float] = None
    category: str
    description: str
    people_count: int
    vulnerability_flags: List[str]
    priority_score: int
    priority_level: str
    priority_reasons: List[str]
    response_status: str
    assigned_boat_id: Optional[str] = None
    assigned_boat_name: Optional[str] = None
    mission_phase: Optional[str] = None
    delivery_status: str
    hop_count: int
    origin_device_id: Optional[str] = None
    schema_version: str
    participant_id: Optional[str] = None
    broadcast_id: Optional[str] = None
    relay_node_id: Optional[str] = None
    delivery_channel: Optional[str] = "INTERNET"
    acknowledged_by_server_at: Optional[str] = None
    acknowledged_by_rescuer_at: Optional[str] = None
    rescuer_name: Optional[str] = None
    is_demo: bool = False


class BleBeaconIngestRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    message_id: str = Field(..., alias="messageId")
    incident_id: Optional[str] = Field(None, alias="incidentId")
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    location_accuracy_m: Optional[float] = Field(None, alias="locationAccuracyM")
    severity: str = "MODERATE"
    people_count: int = Field(default=1, alias="peopleCount")
    has_vulnerable_people: bool = Field(default=False, alias="hasVulnerablePeople")
    category: str = "general"
    message_text: Optional[str] = Field(default=None, alias="messageText")
    hop_count: int = Field(default=0, alias="hopCount")
    rssi: Optional[int] = None
    raw_beacon_hex: Optional[str] = Field(None, alias="rawBeaconHex")
    source_mac: Optional[str] = Field(None, alias="sourceMac")
    is_demo: bool = Field(default=False, alias="isDemo")


class RescuerAckRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    rescuer_name: str = Field(default="First Responder Unit", alias="rescuerName")
    notes: Optional[str] = None
    mission_phase: Optional[str] = Field(default="en_route", alias="missionPhase")
    assigned_boat_id: Optional[str] = Field(default=None, alias="assignedBoatId")


class StopForwardingResponse(BaseModel):
    confirmed_message_ids: List[str]
    timestamp: str
    count: int


class BoatStatusUpdateRequest(BaseModel):
    status: str = Field(..., description="available, deployed, maintenance")
    mission_phase: Optional[str] = Field(default="standby", description="standby, en_route, on_site, returning")


class RescueBoatOut(BaseModel):
    id: str
    district_id: str
    district_name: str
    name: str
    agency: str
    type: str
    capacity: int
    commander: Optional[str] = None
    crew_count: int
    contact: Optional[str] = None
    base_name: Optional[str] = None
    latitude: float
    longitude: float
    status: str
    assigned_incident_id: Optional[str] = None
    assigned_incident_location: Optional[str] = None
    mission_phase: str
    fuel_percent: int
    rescues_completed: int
    updated_at: str


class RiskZoneOut(BaseModel):
    id: str
    district_id: str
    name: str
    latitude: float
    longitude: float
    radius_m: int
    risk_score: float
    risk_level: str
    source: str


# ==========================================
# Safety Broadcast & Participant Schemas
# ==========================================

class ParticipantRegisterRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: Optional[str] = Field(None, description="Optional custom participant ID; auto-assigned if omitted")
    name: str = Field(..., min_length=1, max_length=100)
    phone_number: Optional[str] = Field(None, alias="phoneNumber")
    district_id: str = Field(default="ernakulam", alias="districtId")
    device_id: str = Field(..., alias="deviceId")
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    accuracy_m: Optional[float] = Field(None, alias="accuracyM")


class ParticipantOut(BaseModel):
    id: str
    name: str
    phone_number: Optional[str] = None
    district_id: str
    device_id: str
    registered_at: str
    last_active_at: str
    last_latitude: Optional[float] = None
    last_longitude: Optional[float] = None
    last_location_accuracy_m: Optional[float] = None
    last_location_timestamp: Optional[str] = None


class SafetyBroadcastCreateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    title: str = Field(..., min_length=3, max_length=150)
    message: str = Field(..., min_length=3)
    severity: str = Field(default="WARNING")
    district_id: Optional[str] = Field(None, alias="districtId", description="Target district, or null for all")
    target_participant_ids: List[str] = Field(default_factory=list, alias="targetParticipantIds")
    deadline_seconds: int = Field(default=60, alias="deadlineSeconds", ge=10, le=86400)
    created_by: str = Field(default="Incident Command", alias="createdBy")


class SafetyResponseRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    participant_id: str = Field(..., alias="participantId")
    status: str = Field(..., alias="safetyStatus")
    message: Optional[str] = Field(None, alias="note")
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    accuracy_m: Optional[float] = Field(None, alias="accuracyM")
    people_count: int = Field(default=1, alias="peopleCount")
    has_vulnerable_people: bool = Field(default=False, alias="hasVulnerable")
    severity: str = Field(default="CRITICAL")


class RecipientStateOut(BaseModel):
    broadcast_id: str
    participant_id: str
    participant_name: Optional[str] = None
    district_id: str
    delivery_status: str
    delivered_at: Optional[str] = None
    delivery_channel: str = "POLL"
    safety_status: str
    responded_at: Optional[str] = None
    response_message: Optional[str] = None
    reported_latitude: Optional[float] = None
    reported_longitude: Optional[float] = None
    reported_accuracy_m: Optional[float] = None
    last_known_latitude: Optional[float] = None
    last_known_longitude: Optional[float] = None
    last_known_location_timestamp: Optional[str] = None
    location_status: str = "AVAILABLE"
    is_escalated: bool = False
    escalated_incident_id: Optional[str] = None
    linked_sos_id: Optional[str] = None
    escalated_at: Optional[str] = None


class SafetyBroadcastOut(BaseModel):
    id: str
    title: str
    message: str
    severity: str
    district_id: Optional[str] = None
    created_at: str
    deadline_seconds: int
    expires_at: str
    created_by: str
    status: str
    total_recipients: int
    safe_count: int
    help_requested_count: int
    awaiting_count: int
    no_response_count: int
    escalated_count: int
    seconds_remaining: int
    recipients: Optional[List[RecipientStateOut]] = None


class ManualEscalationRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    participant_id: Optional[str] = Field(None, alias="participantId")
    reason: str = Field(default="No response to safety broadcast. Manual rescue check initiated.")
    escalated_by: str = Field(default="Incident Command", alias="escalatedBy")


class SosRelayRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    original_incident_id: Optional[str] = Field(None, alias="incidentId")
    original_message_id: str = Field(..., alias="messageId")
    message_text: str = Field(..., alias="messageText")
    people_count: int = Field(default=1, alias="peopleCount")
    has_vulnerable_people: bool = Field(default=False, alias="hasVulnerable")
    severity: str = Field(default="CRITICAL")
    category: Optional[str] = "trapped"
    original_latitude: Optional[float] = Field(None, alias="latitude")
    original_longitude: Optional[float] = Field(None, alias="longitude")
    original_accuracy_m: Optional[float] = Field(None, alias="locationAccuracyM")
    original_timestamp: Optional[str] = Field(None, alias="originalTimestamp")
    origin_device_id: str = Field(..., alias="originDeviceId")
    participant_id: Optional[str] = Field(None, alias="participantId")
    relay_node_id: str = Field(..., alias="relayNodeId")
    hop_count: int = Field(default=1, alias="hopCount")
    district_id: Optional[str] = Field(None, alias="districtId")

    @model_validator(mode="before")
    @classmethod
    def normalize_relay_coords(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "latitude" not in data:
                lat = data.get("originLatitude") or data.get("original_latitude") or data.get("origin_latitude")
                if lat is not None:
                    data["latitude"] = lat
            if "longitude" not in data:
                lon = data.get("originLongitude") or data.get("original_longitude") or data.get("origin_longitude")
                if lon is not None:
                    data["longitude"] = lon
            if "locationAccuracyM" not in data:
                acc = data.get("originAccuracyM") or data.get("original_accuracy_m") or data.get("accuracyM")
                if acc is not None:
                    data["locationAccuracyM"] = acc
        return data


class IncidentMessageCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    sender_role: str = Field(default="responder", alias="senderRole", description="'responder' or 'citizen'")
    sender_name: Optional[str] = Field(default="Incident Commander", alias="senderName")
    message_text: str = Field(..., alias="messageText", min_length=1, max_length=2000)
    delivery_channel: Optional[str] = Field(default="INTERNET", alias="deliveryChannel")


class MessageAckRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    status: str = Field(default="CONFIRMED_RECEIVED", description="CONFIRMED_RECEIVED, SENT_TO_DEVICE, DELIVERY_FAILED")
    acknowledged_by: Optional[str] = Field(None, alias="acknowledgedBy")


class IncidentMessageOut(BaseModel):
    id: str
    incident_id: str
    sender_role: str
    sender_name: Optional[str] = None
    message_text: str
    created_at: str
    delivery_status: str
    delivery_channel: Optional[str] = "INTERNET"
    delivered_at: Optional[str] = None
    acknowledged_at: Optional[str] = None

