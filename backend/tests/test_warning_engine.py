import pytest
from datetime import datetime, timedelta
from backend.app.database.connection import SessionLocal
from backend.app.database.models import AlertEvent, OfficialAdvisory
from backend.app.schemas.prediction import PredictionResponse, TestAlertRequest, FactorContribution
from backend.app.services.warning_engine import WarningEngine

@pytest.fixture
def db():
    session = SessionLocal()
    session.query(AlertEvent).delete()
    session.query(OfficialAdvisory).delete()
    session.commit()
    yield session
    session.close()

def make_dummy_prediction(loc_id="bantwal", prob=0.005, forecast_rain=10.0, soil_sat=0.40):
    return PredictionResponse(
        location_id=loc_id,
        location_name="Bantwal (Netravati Gauge)",
        prediction_timestamp=datetime.utcnow().isoformat() + "Z",
        weather_observed_at=datetime.utcnow().isoformat(),
        horizon_hours=24,
        calibrated_risk_probability=prob,
        baseline_risk_probability=prob * 2,
        risk_level="LOW" if prob < 0.03 else ("MODERATE_ALERT" if prob < 0.12 else "HIGH_WARNING"),
        risk_level_code=0 if prob < 0.03 else (1 if prob < 0.12 else 2),
        key_factors=[
            FactorContribution(
                feature="forecast_precip_24h_mm",
                label="24h Forecast Rainfall",
                value=forecast_rain,
                unit="mm",
                baseline_normal=10.0,
                deviation_ratio=forecast_rain/10.0,
                impact_level="LOW" if forecast_rain < 25.0 else "HIGH",
                description="Test factor"
            )
        ],
        input_feature_snapshot={
            "forecast_precip_24h_mm": forecast_rain,
            "soil_saturation_index": soil_sat,
            "past_72h_precip_mm": 20.0
        },
        model_version="1.0.0",
        data_source="Test",
        data_freshness="LIVE",
        is_experimental=True,
        disclaimer="Test disclaimer"
    )

def test_warning_engine_normal_conditions(db):
    pred = make_dummy_prediction(prob=0.005, forecast_rain=5.0)
    # Ensure no official override is interfering for this test
    db.query(OfficialAdvisory).delete()
    db.commit()
    alert = WarningEngine.evaluate_and_notify(pred, db=db)
    assert alert is None

def test_warning_engine_high_risk_triggers_alert(db):
    pred = make_dummy_prediction(loc_id="belthangady", prob=0.18, forecast_rain=140.0)
    alert = WarningEngine.evaluate_and_notify(pred, db=db)
    assert alert is not None
    assert alert.severity == "WARNING"
    assert "belthangady" in alert.location_id

def test_warning_duplicate_suppression(db):
    pred = make_dummy_prediction(loc_id="ullal", prob=0.15, forecast_rain=120.0)
    # First alert triggers
    alert1 = WarningEngine.evaluate_and_notify(pred, db=db)
    assert alert1 is not None

    # Immediate second identical evaluation triggers suppression
    alert2 = WarningEngine.evaluate_and_notify(pred, db=db)
    assert alert2 is None  # Suppressed!

    # Check suppression counter incremented
    recent = db.query(AlertEvent).filter(AlertEvent.location_id == "ullal").order_by(AlertEvent.timestamp.desc()).first()
    assert recent.suppressed_count >= 1

def test_trigger_manual_test_alert(db):
    req = TestAlertRequest(
        location_id="udupi",
        severity="WARNING",
        title="Manual Test Flood Alert",
        message="Verification alert for frontend push demonstration"
    )
    alert = WarningEngine.trigger_test_alert(req, db=db)
    assert alert.is_test is True
    assert alert.location_id == "udupi"
    assert alert.title == "Manual Test Flood Alert"
