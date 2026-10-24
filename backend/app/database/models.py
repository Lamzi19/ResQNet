from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Text, JSON
from backend.app.database.connection import Base

class PredictionRecord(Base):
    __tablename__ = "prediction_records"

    id = Column(Integer, primary_key=True, index=True)
    location_id = Column(String(50), index=True, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    weather_observed_at = Column(String(50), nullable=True)
    
    # Risk predictions
    risk_probability = Column(Float, nullable=False)  # Calibrated probability
    baseline_probability = Column(Float, nullable=True)
    risk_level = Column(String(20), nullable=False)    # LOW, MODERATE_ALERT, HIGH_WARNING
    risk_category_code = Column(Integer, default=0)    # 0, 1, 2
    
    # Input factors and explanations
    forecast_precip_24h_mm = Column(Float, nullable=True)
    past_72h_precip_mm = Column(Float, nullable=True)
    soil_saturation_index = Column(Float, nullable=True)
    top_factors = Column(JSON, nullable=True)
    input_features = Column(JSON, nullable=True)
    
    # Provenance
    model_version = Column(String(20), default="1.0.0")
    data_source = Column(String(100), default="Open-Meteo Forecast & Sensor Alignment")
    data_freshness_status = Column(String(20), default="LIVE")  # LIVE, CACHED, STALE, FALLBACK
    is_experimental = Column(Boolean, default=True)


class AlertEvent(Base):
    __tablename__ = "alert_events"

    id = Column(Integer, primary_key=True, index=True)
    location_id = Column(String(50), index=True, nullable=False)
    location_name = Column(String(100), nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    
    severity = Column(String(20), nullable=False)  # INFO, ADVISORY, WARNING, EMERGENCY
    title = Column(String(150), nullable=False)
    message = Column(Text, nullable=False)
    
    rule_triggered = Column(String(100), nullable=False)
    trigger_value = Column(Float, nullable=True)
    threshold_value = Column(Float, nullable=True)
    
    source = Column(String(50), default="ResQNet Warning Engine")
    is_official_override = Column(Boolean, default=False)
    is_test = Column(Boolean, default=False)
    
    # Suppression & deduplication
    suppressed_count = Column(Integer, default=0)
    acknowledged = Column(Boolean, default=False)


class OfficialAdvisory(Base):
    __tablename__ = "official_advisories"

    id = Column(Integer, primary_key=True, index=True)
    district = Column(String(50), index=True, default="Dakshina Kannada")
    alert_color = Column(String(20), default="GREEN")  # GREEN, YELLOW, ORANGE, RED
    issuing_agency = Column(String(100), default="India Meteorological Department (IMD) / KSNDMC")
    issued_at = Column(DateTime, default=datetime.utcnow)
    valid_until = Column(DateTime, nullable=True)
    description = Column(Text, nullable=False)
    is_active = Column(Boolean, default=True)


class ShelterOccupancy(Base):
    __tablename__ = "shelter_occupancies"

    id = Column(Integer, primary_key=True, index=True)
    shelter_id = Column(String(50), unique=True, index=True, nullable=False)
    district_id = Column(String(50), index=True, nullable=True)
    name = Column(String(150), nullable=True)
    is_operational = Column(Boolean, default=False, index=True)
    total_capacity = Column(Integer, nullable=True)  # Baseline registry capacity (unverified)
    verified_operational_capacity = Column(Integer, nullable=True)  # Actual staffed capacity confirmed by authorities
    occupied_count = Column(Integer, default=0, nullable=False)
    reserved_count = Column(Integer, default=0, nullable=False)
    is_simulated = Column(Boolean, default=False)
    verification_notes = Column(Text, nullable=True)
    updated_by = Column(String(100), default="SEOC Baseline Registry")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def calculate_status(self):
        if not self.is_operational or self.verified_operational_capacity is None:
            return "UNVERIFIED", 0, None

        cap = self.verified_operational_capacity
        available = max(0, cap - self.occupied_count - self.reserved_count)
        occupancy_ratio = (self.occupied_count + self.reserved_count) / max(1, cap)
        pct = min(100.0, round(occupancy_ratio * 100.0, 1))

        if available == 0 or pct >= 100.0:
            status = "FULL"
        elif pct >= 75.0 or available <= max(5, int(cap * 0.15)):
            status = "LIMITED"
        else:
            status = "AVAILABLE"

        return status, available, pct


class ShelterReservation(Base):
    __tablename__ = "shelter_reservations"

    id = Column(String(60), primary_key=True, index=True)  # e.g. "RES-xxxxxxxx"
    shelter_id = Column(String(50), index=True, nullable=False)
    group_size = Column(Integer, default=1, nullable=False)
    status = Column(String(20), default="ACTIVE", index=True)  # ACTIVE, CHECKED_IN, CANCELLED, EXPIRED
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    expires_at = Column(DateTime, nullable=False, index=True)
    checked_in_at = Column(DateTime, nullable=True)
    cancelled_at = Column(DateTime, nullable=True)
    citizen_contact = Column(String(100), nullable=True)
    notes = Column(Text, nullable=True)


class SosIncidentRecord(Base):
    __tablename__ = "sos_incidents"

    id = Column(String(64), primary_key=True, index=True)
    message_id = Column(String(64), unique=True, index=True, nullable=True)
    district_id = Column(String(50), index=True, nullable=False, default="ernakulam")
    district_name = Column(String(100), nullable=True, default="Ernakulam")
    location_name = Column(String(150), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    location_accuracy_m = Column(Float, nullable=True)
    category = Column(String(50), default="trapped")
    description = Column(Text, nullable=False)
    people_count = Column(Integer, default=1)
    vulnerability_flags = Column(JSON, default=list)
    priority_score = Column(Integer, default=70)
    priority_level = Column(String(20), default="HIGH")
    priority_reasons = Column(JSON, default=list)
    response_status = Column(String(30), default="unassigned", index=True)
    assigned_boat_id = Column(String(50), nullable=True)
    assigned_boat_name = Column(String(100), nullable=True)
    mission_phase = Column(String(30), nullable=True)
    delivery_status = Column(String(30), default="received")
    hop_count = Column(Integer, default=0)
    origin_device_id = Column(String(64), nullable=True)
    schema_version = Column(String(20), default="1.0.0")
    # Multi-node relay & safety-broadcast linkage
    participant_id = Column(String(64), nullable=True, index=True)
    broadcast_id = Column(String(64), nullable=True, index=True)
    relay_node_id = Column(String(64), nullable=True)
    relayed_at = Column(DateTime, nullable=True)
    delivery_channel = Column(String(30), default="INTERNET")  # INTERNET, BLE_RELAY, MESH
    # End-to-end acknowledgement tracking
    acknowledged_by_server_at = Column(DateTime, default=datetime.utcnow, nullable=True)
    acknowledged_by_rescuer_at = Column(DateTime, nullable=True)
    rescuer_name = Column(String(100), nullable=True)
    is_demo = Column(Boolean, default=False, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class IncidentMessageRecord(Base):
    __tablename__ = "incident_messages"

    id = Column(String(64), primary_key=True, index=True)
    incident_id = Column(String(64), index=True, nullable=False)
    sender_role = Column(String(20), nullable=False)  # "citizen" or "responder"
    sender_name = Column(String(100), nullable=True)
    message_text = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    delivery_status = Column(String(30), default="SAVED_ON_SERVER", index=True)
    # Honest delivery states:
    # "SAVED_ON_SERVER", "QUEUED_FOR_DELIVERY", "SENT_TO_DEVICE", "CONFIRMED_RECEIVED", "DELIVERY_FAILED", "UNKNOWN"
    delivery_channel = Column(String(30), default="INTERNET")  # "INTERNET", "BLE_STORE_FORWARD", "RELAY"
    delivered_at = Column(DateTime, nullable=True)
    acknowledged_at = Column(DateTime, nullable=True)


class ParticipantRecord(Base):
    __tablename__ = "registered_participants"

    id = Column(String(64), primary_key=True, index=True)  # unique participant id (e.g. part_xxxx)
    name = Column(String(100), nullable=False)
    phone_number = Column(String(25), nullable=True)
    district_id = Column(String(50), index=True, nullable=False, default="ernakulam")
    device_id = Column(String(64), index=True, nullable=False)
    registered_at = Column(DateTime, default=datetime.utcnow, index=True)
    last_active_at = Column(DateTime, default=datetime.utcnow, index=True)
    last_latitude = Column(Float, nullable=True)
    last_longitude = Column(Float, nullable=True)
    last_location_accuracy_m = Column(Float, nullable=True)
    last_location_timestamp = Column(DateTime, nullable=True)


class SafetyBroadcastRecord(Base):
    __tablename__ = "safety_broadcasts"

    id = Column(String(64), primary_key=True, index=True)  # e.g. BC-KL-xxxx
    title = Column(String(150), nullable=False)
    message = Column(Text, nullable=False)
    severity = Column(String(20), default="WARNING")
    district_id = Column(String(50), index=True, nullable=True)  # null = all districts
    target_participant_ids = Column(JSON, default=list)  # empty = all in district
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    deadline_seconds = Column(Integer, default=60)
    expires_at = Column(DateTime, nullable=False, index=True)
    created_by = Column(String(100), default="Incident Command")
    status = Column(String(20), default="ACTIVE", index=True)  # ACTIVE, EXPIRED, CLOSED


class BroadcastRecipientRecord(Base):
    __tablename__ = "broadcast_recipients"

    id = Column(String(130), primary_key=True, index=True)  # {broadcast_id}_{participant_id}
    broadcast_id = Column(String(64), index=True, nullable=False)
    participant_id = Column(String(64), index=True, nullable=False)
    participant_name = Column(String(100), nullable=True)
    district_id = Column(String(50), index=True, nullable=False, default="ernakulam")
    
    # Delivery tracking (separate from safety response)
    delivery_status = Column(String(30), default="PENDING", index=True)  # PENDING, DELIVERED_TO_DEVICE, DELIVERY_FAILED, ACKNOWLEDGED
    delivered_at = Column(DateTime, nullable=True)
    delivery_channel = Column(String(30), default="POLL")  # POLL, PUSH, BLE_RELAY
    
    # Safety response tracking
    safety_status = Column(String(35), default="AWAITING RESPONSE", index=True)
    # States: AWAITING RESPONSE, SAFE CONFIRMED, HELP REQUESTED, NO RESPONSE — VERIFY SAFETY, DELIVERY FAILED, EXPIRED
    responded_at = Column(DateTime, nullable=True)
    response_message = Column(Text, nullable=True)
    
    # Location reported with response (or last known)
    reported_latitude = Column(Float, nullable=True)
    reported_longitude = Column(Float, nullable=True)
    reported_accuracy_m = Column(Float, nullable=True)
    location_status = Column(String(30), default="AVAILABLE")  # AVAILABLE, LOCATION UNAVAILABLE, LAST_KNOWN
    
    # Human escalation tracking
    is_escalated = Column(Boolean, default=False, index=True)
    escalated_incident_id = Column(String(64), nullable=True)
    escalated_at = Column(DateTime, nullable=True)
    escalated_by = Column(String(100), nullable=True)
    escalation_reason = Column(Text, nullable=True)
    
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)



class RescueVessel(Base):
    __tablename__ = "rescue_vessels"

    id = Column(String(50), primary_key=True, index=True)
    district_id = Column(String(50), index=True, nullable=False)
    district_name = Column(String(100), nullable=False)
    name = Column(String(150), nullable=False)
    agency = Column(String(150), nullable=False)
    type = Column(String(100), default="Motorized Rescue Boat")
    capacity = Column(Integer, default=8)
    commander = Column(String(100), nullable=True)
    crew_count = Column(Integer, default=3)
    contact = Column(String(100), nullable=True)
    base_name = Column(String(150), nullable=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    status = Column(String(30), default="available", index=True)
    assigned_incident_id = Column(String(64), nullable=True)
    assigned_incident_location = Column(String(150), nullable=True)
    mission_phase = Column(String(30), default="standby")
    fuel_percent = Column(Integer, default=100)
    rescues_completed = Column(Integer, default=0)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

