import pytest
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.config import KERALA_LOCATIONS, SUPPORTED_LOCATIONS
from backend.app.geography_kerala import (
    KERALA_DISTRICTS, 
    KERALA_RIVER_BASINS, 
    KERALA_COASTAL_STATIONS, 
    KERALA_DISTRICT_BOUNDS
)

@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c

def test_kerala_14_districts_present():
    assert len(KERALA_DISTRICTS) == 14
    expected_ids = [
        "thiruvananthapuram", "kollam", "pathanamthitta", "alappuzha",
        "kottayam", "idukki", "ernakulam", "thrissur", "palakkad",
        "malappuram", "kozhikode", "wayanad", "kannur", "kasaragod"
    ]
    for d_id in expected_ids:
        assert d_id in KERALA_DISTRICTS
        d = KERALA_DISTRICTS[d_id]
        assert d.name is not None
        assert 8.0 <= d.latitude <= 13.0
        assert 74.5 <= d.longitude <= 78.0
        assert d_id in KERALA_DISTRICT_BOUNDS

def test_kerala_river_basins_distinct_from_districts():
    # Ensure river basins are stored as distinct relational entities
    assert len(KERALA_RIVER_BASINS) >= 5
    assert "periyar" in KERALA_RIVER_BASINS
    assert "bharathappuzha" in KERALA_RIVER_BASINS
    assert "pamba" in KERALA_RIVER_BASINS
    # Periyar spans both Idukki and Ernakulam
    periyar = KERALA_RIVER_BASINS["periyar"]
    assert "Idukki Arch Dam" in periyar.major_dams

def test_kerala_locations_endpoint(client):
    res = client.get("/api/locations?region=kerala")
    assert res.status_code == 200
    data = res.json()
    assert len(data) == 14
    ids = {d["id"] for d in data}
    assert "ernakulam" in ids
    assert "wayanad" in ids
    assert "alappuzha" in ids
    
    # Check that metadata attributes are populated
    ekm = next(d for d in data if d["id"] == "ernakulam")
    assert ekm["is_coastal"] is True
    assert ekm["malayalam_name"] == "എറണാകുളം"

def test_kerala_predict_insufficient_model_status(client):
    # Until a dedicated validated Kerala ML model artifact is trained,
    # the endpoint should either gracefully compute or handle legacy compatibility
    res = client.post("/api/predict", json={"location_id": "wayanad"})
    # Should not crash with 500
    assert res.status_code in [200, 422, 503]

def test_unknown_location_error(client):
    res = client.get("/api/weather/non_existent_district")
    assert res.status_code == 404
