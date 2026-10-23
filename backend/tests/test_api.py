import pytest
from fastapi.testclient import TestClient
from backend.app.main import app

@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c

def test_health_endpoint(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "online"
    assert "bantwal" in data["supported_locations"]

def test_locations_endpoint(client):
    response = client.get("/api/locations")
    assert response.status_code == 200
    locs = response.json()
    assert len(locs) >= 14
    loc_ids = [l["id"] for l in locs]
    # Check Kerala active districts
    assert "ernakulam" in loc_ids
    assert "wayanad" in loc_ids
    assert "idukki" in loc_ids
    assert "alappuzha" in loc_ids
    # Check archived Karnataka stations are accessible
    assert "mangaluru_urban" in loc_ids
    assert "bantwal" in loc_ids

    # Check regional filter
    res_kerala = client.get("/api/locations?region=kerala")
    assert res_kerala.status_code == 200
    assert len(res_kerala.json()) == 14

    res_kar = client.get("/api/locations?region=karnataka_archive")
    assert res_kar.status_code == 200
    assert len(res_kar.json()) == 5

def test_weather_endpoint(client):
    response = client.get("/api/weather/bantwal")
    assert response.status_code == 200
    w = response.json()
    assert w["location_id"] == "bantwal"
    assert "current_temperature_c" in w
    assert "forecast_next_24h_precip_mm" in w
    assert len(w["hourly_trend"]) > 0

def test_weather_unknown_location(client):
    response = client.get("/api/weather/non_existent_loc")
    assert response.status_code == 404

def test_predict_endpoint(client):
    response = client.post("/api/predict", json={"location_id": "bantwal"})
    assert response.status_code == 200
    pred = response.json()
    assert pred["location_id"] == "bantwal"
    assert pred["horizon_hours"] == 24
    assert "calibrated_risk_probability" in pred
    assert pred["risk_level"] in ["LOW", "MODERATE_ALERT", "HIGH_WARNING"]
    assert len(pred["key_factors"]) >= 3
    assert pred["is_experimental"] is True

def test_predict_manual_extreme_override(client):
    # Test that extreme forecast override triggers high risk warning
    response = client.post("/api/predict", json={
        "location_id": "bantwal",
        "manual_forecast_override_mm": 210.0
    })
    assert response.status_code == 200
    pred = response.json()
    assert pred["risk_level"] in ["MODERATE_ALERT", "HIGH_WARNING"]
    assert pred["input_feature_snapshot"]["forecast_precip_24h_mm"] == 210.0

def test_test_alert_endpoint(client):
    response = client.post("/api/alerts/test", json={
        "location_id": "mangaluru_urban",
        "severity": "WARNING",
        "title": "Automated Test Inundation Alert",
        "message": "Testing alert generation and SQLite persistence"
    })
    assert response.status_code == 200
    data = response.json()
    assert data["is_test"] is True
    assert data["title"] == "Automated Test Inundation Alert"

def test_get_alerts_and_predictions_history(client):
    res_alerts = client.get("/api/alerts")
    assert res_alerts.status_code == 200
    assert isinstance(res_alerts.json(), list)

    res_preds = client.get("/api/predictions")
    assert res_preds.status_code == 200
    assert isinstance(res_preds.json(), list)
