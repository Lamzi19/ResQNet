import pytest
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.services.weather_service import WeatherService, calculate_astronomical_tide
from backend.app.services.predictor_service import PredictorService
from datetime import datetime

@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c

def test_astronomical_tide_calculation():
    dt = datetime(2023, 7, 24, 12, 0, 0)
    max_tide, t_range, is_spring = calculate_astronomical_tide(dt)
    assert 0.80 <= max_tide <= 1.95  # Within known astronomical tidal range at Mangalore Port
    assert t_range > 0.0

def test_weather_includes_river_and_coastal(client):
    res = client.get("/api/weather/bantwal")
    assert res.status_code == 200
    data = res.json()
    assert "river" in data
    assert data["river"]["discharge_m3s"] >= 0
    assert data["river"]["warning_threshold_m3s"] > 0
    assert "coastal" in data
    assert data["coastal"]["tide_level_max_m"] > 0

def test_predict_model_v1_and_v2_switching(client):
    # Test v1 (15 features)
    res_v1 = client.post("/api/predict", json={"location_id": "bantwal", "model_version": "1.0.0"})
    assert res_v1.status_code == 200
    p1 = res_v1.json()
    assert p1["model_version"] == "1.0.0"
    assert p1["features_used_count"] == 15

    # Test v2 (20 features)
    res_v2 = client.post("/api/predict", json={"location_id": "bantwal", "model_version": "2.0.0"})
    assert res_v2.status_code == 200
    p2 = res_v2.json()
    assert p2["model_version"] == "2.0.0"
    assert p2["features_used_count"] == 20
    assert "primary_flood_mechanism" in p2

def test_model_comparison_endpoint(client):
    res = client.get("/api/models")
    assert res.status_code == 200
    data = res.json()
    assert "models_compared" in data
    assert "model_v1_rainfall_soil" in data["models_compared"]
    assert "model_v2_coastal_riverine" in data["models_compared"]
    assert data["key_takeaways"]["operational_recall_v2"] > data["key_takeaways"]["operational_recall_v1"]

def test_coastal_compound_mechanism_ullal(client):
    # Ullal is estuarine; with high forecast rain it should flag coastal compound
    res = client.post("/api/predict", json={
        "location_id": "ullal",
        "model_version": "2.0.0",
        "manual_forecast_override_mm": 180.0
    })
    assert res.status_code == 200
    p = res.json()
    assert p["primary_flood_mechanism"] == "COASTAL_COMPOUND"
    assert p["risk_level"] in ["MODERATE_ALERT", "HIGH_WARNING"]
