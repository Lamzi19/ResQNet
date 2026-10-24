from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Any
from datetime import datetime

class LocationOut(BaseModel):
    id: str
    name: str
    latitude: float
    longitude: float
    elevation_m: float
    basin: str
    vulnerability_notes: str
    malayalam_name: Optional[str] = None
    is_coastal: bool = False
    region: str = "kerala"
    data_coverage_status: str = "FULL_MULTI_FACTOR"
    terrain_type: Optional[str] = None

class HourlyForecastPoint(BaseModel):
    time: str
    precipitation_mm: float
    rain_mm: float
    temperature_2m: float
    soil_moisture: float
    is_forecast: bool = False

class RiverTelemetry(BaseModel):
    discharge_m3s: float
    warning_threshold_m3s: float
    danger_threshold_m3s: float
    is_warning: bool
    discharge_ratio: float
    status: str  # NORMAL, WATCH, DANGER, UNAVAILABLE
    source: str

class CoastalTideTelemetry(BaseModel):
    is_coastal_station: bool
    tide_level_max_m: float
    tidal_range_m: float
    is_spring_tide: bool
    wave_height_m: Optional[float] = None
    compound_backwater_risk: float  # index 0 to 3+
    source: str

class WeatherResponse(BaseModel):
    location_id: str
    location_name: str
    latitude: float
    longitude: float
    observed_time: str
    current_temperature_c: float
    current_humidity_pct: float
    current_wind_speed_kmh: float
    current_surface_pressure_hpa: float
    past_24h_precip_mm: float
    past_72h_precip_mm: float
    past_120h_precip_mm: float
    forecast_next_24h_precip_mm: float
    current_surface_soil_moisture: float
    current_deep_soil_moisture: float
    data_source: str
    freshness: str  # LIVE, CACHED, STALE, FALLBACK
    cache_age_seconds: int = 0
    river: Optional[RiverTelemetry] = None
    coastal: Optional[CoastalTideTelemetry] = None
    hourly_trend: List[HourlyForecastPoint] = []

class FactorContribution(BaseModel):
    feature: str
    label: str
    value: float
    unit: str
    baseline_normal: float
    deviation_ratio: float
    impact_level: str  # LOW, MODERATE, HIGH, CRITICAL
    description: str

class PredictionRequest(BaseModel):
    location_id: str
    model_version: str = "2.0.0"  # "1.0.0" (Rain+Soil) or "2.0.0" (Multi-Factor Coastal)
    use_cached_weather: bool = True
    manual_forecast_override_mm: Optional[float] = None
    simulation_scenario: Optional[str] = Field(
        None,
        pattern="^(NORMAL|HEAVY_RAINFALL|EXTREME_RAINFALL)?$",
        description="Optional synthetic scenario: 'NORMAL', 'HEAVY_RAINFALL', or 'EXTREME_RAINFALL'"
    )

class PredictionResponse(BaseModel):
    location_id: str
    location_name: str
    prediction_timestamp: str
    weather_observed_at: str
    horizon_hours: int = 24
    
    # Probabilities & categories
    calibrated_risk_probability: float
    baseline_risk_probability: float
    risk_level: str  # LOW, MODERATE_ALERT, HIGH_WARNING
    risk_level_code: int  # 0, 1, 2
    primary_flood_mechanism: str = "LOW_RISK"  # RIVERINE_OVERFLOW, URBAN_PLUVIAL, COASTAL_COMPOUND, LOW_RISK
    
    # Feature explanations
    key_factors: List[FactorContribution]
    input_feature_snapshot: Dict[str, Any]
    
    # Metadata & honest transparency
    model_version: str = "2.0.0"
    model_name: str = "ResQNet Flood Prediction Pipeline"
    features_used_count: int = 20
    data_source: str
    data_freshness: str
    is_rule_based: bool = False
    risk_estimate_type: str = "Calibrated ML probability"
    is_experimental: bool = True
    is_simulation: bool = False
    simulation_scenario: Optional[str] = None
    rule_vs_model_reason: Optional[str] = None
    disclaimer: str

class AlertOut(BaseModel):
    id: int
    location_id: str
    location_name: str
    timestamp: str
    severity: str
    title: str
    message: str
    rule_triggered: str
    is_official_override: bool
    is_test: bool
    suppressed_count: int

class TestAlertRequest(BaseModel):
    location_id: str = "bantwal"
    severity: str = "WARNING"
    title: str = "[TEST] Manual In-App Flood Warning Trigger"
    message: str = "This is a verified test alert triggered from the ResQNet control dashboard to test early warning routing."

class OfficialAdvisoryOut(BaseModel):
    district: str
    alert_color: str
    issuing_agency: str
    issued_at: str
    description: str
    is_active: bool

class ModelComparisonSummary(BaseModel):
    v1_version: str
    v2_version: str
    v1_features: List[str]
    v2_features: List[str]
    metrics_comparison: Dict[str, Any]
    performance_by_mechanism: Dict[str, Any]
