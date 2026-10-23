import os
from pydantic import BaseModel
from typing import List, Dict, Any

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORKSPACE_ROOT = os.path.dirname(BASE_DIR)

class LocationConfig(BaseModel):
    id: str
    name: str
    latitude: float
    longitude: float
    elevation_m: float
    basin: str
    vulnerability_notes: str

SUPPORTED_LOCATIONS: Dict[str, LocationConfig] = {
    "mangaluru_urban": LocationConfig(
        id="mangaluru_urban",
        name="Mangaluru Urban (Kottara/Pumpwell)",
        latitude=12.9141,
        longitude=74.8560,
        elevation_m=22.0,
        basin="Gurupura / Coastal Drainage",
        vulnerability_notes="Dense urban catchment vulnerable to drainage bottlenecking and tidal backflow at Kottara Chowki & Pumpwell."
    ),
    "bantwal": LocationConfig(
        id="bantwal",
        name="Bantwal (Netravati Gauge)",
        latitude=12.8942,
        longitude=75.0345,
        elevation_m=35.0,
        basin="Netravati River Mainstream",
        vulnerability_notes="Primary hydrologic gauge for Dakshina Kannada. Overtopping danger mark at 8.5m; critical flood corridor."
    ),
    "belthangady": LocationConfig(
        id="belthangady",
        name="Belthangady (Western Ghats Confluence)",
        latitude=13.0033,
        longitude=75.2974,
        elevation_m=120.0,
        basin="Netravati-Kumaradhara Headwaters",
        vulnerability_notes="Steep foothill topography prone to sudden mountain flash-runoff, high antecedent soil saturation, and landslide surge."
    ),
    "ullal": LocationConfig(
        id="ullal",
        name="Ullal (Netravati Estuary)",
        latitude=12.8055,
        longitude=74.8529,
        elevation_m=8.0,
        basin="Netravati River Mouth / Arabian Sea",
        vulnerability_notes="Low-lying coastal estuary where river discharge meets astronomical high tides; severe marine storm-surge risk."
    ),
    "udupi": LocationConfig(
        id="udupi",
        name="Udupi / Manipal (Swarna Basin)",
        latitude=13.3409,
        longitude=74.7421,
        elevation_m=39.0,
        basin="Swarna River Basin",
        vulnerability_notes="Northern coastal twin zone vulnerable to Baje dam discharge and seasonal swelling of the Swarna river."
    )
}

class Settings:
    PROJECT_NAME: str = "ResQNet AI Flood Prediction System"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api"
    
    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", f"sqlite:///{os.path.join(WORKSPACE_ROOT, 'resqnet.db')}")
    
    # Model artifact paths
    MODEL_V1_ARTIFACT_PATH: str = os.path.join(WORKSPACE_ROOT, "ml", "artifacts", "flood_model_pipeline_v1.joblib")
    MODEL_V2_ARTIFACT_PATH: str = os.path.join(WORKSPACE_ROOT, "ml", "artifacts", "flood_model_pipeline_v2_coastal.joblib")
    DEFAULT_MODEL_VERSION: str = "2.0.0"
    
    # Weather & Marine APIs
    OPEN_METEO_FORECAST_URL: str = "https://api.open-meteo.com/v1/forecast"
    OPEN_METEO_FLOOD_URL: str = "https://flood-api.open-meteo.com/v1/flood"
    OPEN_METEO_MARINE_URL: str = "https://marine-api.open-meteo.com/v1/marine"
    WEATHER_CACHE_TTL_SECONDS: int = 900  # 15 minutes
    
    # Decision Thresholds (Calibrated Probability)
    THRESHOLD_MODERATE_ADVISORY: float = 0.03
    THRESHOLD_HIGH_WARNING: float = 0.12
    
    # Physical Hydrometeorological Thresholds (KSNDMC Criteria)
    KSNDMC_HEAVY_RAIN_MM: float = 64.5
    KSNDMC_VERY_HEAVY_RAIN_MM: float = 115.6
    KSNDMC_EXTREME_RAIN_MM: float = 204.4
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
