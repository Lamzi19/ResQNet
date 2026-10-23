from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from backend.app.config import settings, SUPPORTED_LOCATIONS
from backend.app.database.connection import get_db
from backend.app.database.models import PredictionRecord, AlertEvent, OfficialAdvisory
from backend.app.schemas.prediction import (
    LocationOut, WeatherResponse, PredictionRequest, PredictionResponse,
    AlertOut, TestAlertRequest, OfficialAdvisoryOut
)
from backend.app.services.weather_service import WeatherService
from backend.app.services.predictor_service import PredictorService
from backend.app.services.warning_engine import WarningEngine

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
