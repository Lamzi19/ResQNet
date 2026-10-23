import os
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from backend.app.geography_kerala import (
    KERALA_DISTRICTS, 
    KERALA_RIVER_BASINS, 
    KERALA_COASTAL_STATIONS, 
    KERALA_DISTRICT_BOUNDS
)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORKSPACE_ROOT = os.path.dirname(BASE_DIR)

class LocationConfig(BaseModel):
    id: str
    name: str
    malayalam_name: Optional[str] = None
    latitude: float
    longitude: float
    elevation_m: float
    basin: str
    vulnerability_notes: str
    terrain_type: str = "MIDLAND"
    is_coastal: bool = False
    region: str = "kerala"  # "kerala" or "karnataka_archive"
    data_coverage_status: str = "FULL_MULTI_FACTOR"
    river_warning_threshold_m3s: Optional[float] = None
    river_danger_threshold_m3s: Optional[float] = None
    cwc_gauge_reference: Optional[str] = None


# 1. Primary Active Geography: All 14 Districts of Kerala
KERALA_LOCATIONS: Dict[str, LocationConfig] = {
    d_id: LocationConfig(
        id=d.id,
        name=d.name,
        malayalam_name=d.malayalam_name,
        latitude=d.latitude,
        longitude=d.longitude,
        elevation_m=d.elevation_m,
        basin=", ".join([b.capitalize() for b in d.primary_river_basins]),
        vulnerability_notes=d.historical_vulnerability,
        terrain_type=d.terrain_type,
        is_coastal=d.is_coastal,
        region="kerala",
        data_coverage_status=d.data_coverage_status,
        river_warning_threshold_m3s=d.river_warning_threshold_m3s,
        river_danger_threshold_m3s=d.river_danger_threshold_m3s,
        cwc_gauge_reference=d.cwc_gauge_reference
    )
    for d_id, d in KERALA_DISTRICTS.items()
}

# 2. Preserved Archived Karnataka Stations (for backward reproducibility & legacy artifact testing)
KARNATAKA_ARCHIVE_LOCATIONS: Dict[str, LocationConfig] = {
    "mangaluru_urban": LocationConfig(
        id="mangaluru_urban",
        name="Mangaluru Urban (Archived)",
        latitude=12.9141,
        longitude=74.8560,
        elevation_m=22.0,
        basin="Gurupura / Coastal Drainage",
        vulnerability_notes="Archived coastal Karnataka station for v1/v2 benchmark reproducibility.",
        region="karnataka_archive",
        is_coastal=True,
        data_coverage_status="FULL_MULTI_FACTOR",
        river_warning_threshold_m3s=400.0,
        river_danger_threshold_m3s=600.0
    ),
    "bantwal": LocationConfig(
        id="bantwal",
        name="Bantwal Netravati Gauge (Archived)",
        latitude=12.8942,
        longitude=75.0345,
        elevation_m=35.0,
        basin="Netravati River Mainstream",
        vulnerability_notes="Archived CWC Netravati river gauge benchmark station.",
        region="karnataka_archive",
        is_coastal=False,
        data_coverage_status="FULL_MULTI_FACTOR",
        river_warning_threshold_m3s=650.0,
        river_danger_threshold_m3s=1000.0
    ),
    "belthangady": LocationConfig(
        id="belthangady",
        name="Belthangady (Archived)",
        latitude=13.0033,
        longitude=75.2974,
        elevation_m=120.0,
        basin="Netravati-Kumaradhara Headwaters",
        vulnerability_notes="Archived Western Ghats foothill station.",
        region="karnataka_archive",
        is_coastal=False,
        data_coverage_status="RIVERINE_AND_WEATHER",
        river_warning_threshold_m3s=450.0,
        river_danger_threshold_m3s=750.0
    ),
    "ullal": LocationConfig(
        id="ullal",
        name="Ullal Estuary (Archived)",
        latitude=12.8055,
        longitude=74.8529,
        elevation_m=8.0,
        basin="Netravati River Mouth / Arabian Sea",
        vulnerability_notes="Archived coastal compound backwater benchmark.",
        region="karnataka_archive",
        is_coastal=True,
        data_coverage_status="FULL_MULTI_FACTOR",
        river_warning_threshold_m3s=700.0,
        river_danger_threshold_m3s=1100.0
    ),
    "udupi": LocationConfig(
        id="udupi",
        name="Udupi / Manipal (Archived)",
        latitude=13.3409,
        longitude=74.7421,
        elevation_m=39.0,
        basin="Swarna River Basin",
        vulnerability_notes="Archived northern coastal twin zone station.",
        region="karnataka_archive",
        is_coastal=True,
        data_coverage_status="RIVERINE_AND_WEATHER",
        river_warning_threshold_m3s=320.0,
        river_danger_threshold_m3s=500.0
    )
}

# Unified location registry: Supports both Kerala and archived Karnataka lookup
SUPPORTED_LOCATIONS: Dict[str, LocationConfig] = {
    **KERALA_LOCATIONS,
    **KARNATAKA_ARCHIVE_LOCATIONS
}

DEFAULT_LOCATION_ID = "ernakulam"


class Settings:
    PROJECT_NAME: str = "ResQNet Kerala Flood Intelligence & Early Warning System"
    VERSION: str = "2.1.0"
    API_V1_STR: str = "/api"
    
    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", f"sqlite:///{os.path.join(WORKSPACE_ROOT, 'resqnet.db')}")
    
    # Model artifact paths
    # Kerala model artifact (Separate and non-overwriting)
    MODEL_KERALA_V1_PATH: str = os.path.join(WORKSPACE_ROOT, "ml", "artifacts", "flood_model_kerala_v1.joblib")
    
    # Preserved Karnataka model artifacts
    MODEL_KARNATAKA_V1_PATH: str = os.path.join(WORKSPACE_ROOT, "ml", "artifacts", "flood_model_pipeline_v1.joblib")
    MODEL_KARNATAKA_V2_PATH: str = os.path.join(WORKSPACE_ROOT, "ml", "artifacts", "flood_model_pipeline_v2_coastal.joblib")
    
    # Backward compatibility aliases
    MODEL_V1_ARTIFACT_PATH: str = MODEL_KARNATAKA_V1_PATH
    MODEL_V2_ARTIFACT_PATH: str = MODEL_KARNATAKA_V2_PATH
    
    DEFAULT_MODEL_VERSION: str = "kerala_v1"
    
    # Weather & Marine APIs
    OPEN_METEO_FORECAST_URL: str = "https://api.open-meteo.com/v1/forecast"
    OPEN_METEO_FLOOD_URL: str = "https://flood-api.open-meteo.com/v1/flood"
    OPEN_METEO_MARINE_URL: str = "https://marine-api.open-meteo.com/v1/marine"
    WEATHER_CACHE_TTL_SECONDS: int = 900  # 15 minutes
    
    # Decision Thresholds (Calibrated Probability)
    THRESHOLD_MODERATE_ADVISORY: float = 0.03
    THRESHOLD_HIGH_WARNING: float = 0.12
    
    # Physical Hydrometeorological Thresholds (IMD & KSDMA Criteria)
    IMD_HEAVY_RAIN_MM: float = 64.5        # 64.5 - 115.5 mm (Yellow/Orange)
    IMD_VERY_HEAVY_RAIN_MM: float = 115.6   # 115.6 - 204.4 mm (Orange/Red)
    IMD_EXTREMELY_HEAVY_RAIN_MM: float = 204.5 # > 204.4 mm (Red Alert)
    
    # Backward compatibility aliases for legacy services & warning rules
    KSNDMC_HEAVY_RAIN_MM: float = IMD_HEAVY_RAIN_MM
    KSNDMC_VERY_HEAVY_RAIN_MM: float = IMD_VERY_HEAVY_RAIN_MM
    KSNDMC_EXTREME_RAIN_MM: float = IMD_EXTREMELY_HEAVY_RAIN_MM
    
    SOIL_SATURATION_CRITICAL_RATIO: float = 0.38
    
    # Warning suppression cooldown (seconds)
    WARNING_COOLDOWN_SECONDS: int = 10800  # 3 hours
    
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000"
    ]

settings = Settings()
