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
