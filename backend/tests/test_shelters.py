"""
Unit and integration tests for the Kerala Relief Facilities Service & Endpoint.
"""
from fastapi.testclient import TestClient
from backend.app.main import app

client = TestClient(app)


def test_shelters_endpoint_returns_data_and_provenance():
    resp = client.get("/api/shelters?limit=10")
    assert resp.status_code == 200
    data = resp.json()
    assert "total_facilities_in_registry" in data
    assert data["total_facilities_in_registry"] == 6377
    assert data["mapped_facilities_count"] == 6001
    assert data["unmapped_facilities_count"] == 376
    assert "2020-08-05" in data["source_compilation_date"]
    assert "disclaimer" in data
    assert len(data["facilities"]) == 10
    
    # Check facility schema & provenance
    fac = data["facilities"][0]
    assert "id" in fac
    assert "name" in fac
    assert "district_id" in fac
    assert "latitude" in fac
    assert "longitude" in fac
    assert fac["latitude"] is not None
    assert fac["longitude"] is not None
    assert fac["is_verified_operational_2026"] is False
    assert "SEOC" in fac["status_notice"] or "1077" in fac["status_notice"]


def test_shelters_endpoint_district_filter():
    resp = client.get("/api/shelters?district_id=ernakulam&limit=50")
    assert resp.status_code == 200
    data = resp.json()
    assert data["district_filter"] == "ernakulam"
    assert data["filtered_count"] == 544
    for fac in data["facilities"]:
        assert fac["district_id"] == "ernakulam"


def test_shelters_endpoint_search_query():
    resp = client.get("/api/shelters?query=School&limit=20")
    assert resp.status_code == 200
    data = resp.json()
    assert data["filtered_count"] > 0
    for fac in data["facilities"]:
        name_or_place = (fac["name"] or "") + (fac["village"] or "") + (fac["lsg"] or "")
        assert "school" in name_or_place.lower()


def test_shelters_coordinate_bounds_integrity():
    resp = client.get("/api/shelters?limit=500")
    assert resp.status_code == 200
    data = resp.json()
    for fac in data["facilities"]:
        lat = fac["latitude"]
        lng = fac["longitude"]
        assert 8.0 <= lat <= 13.0, f"Lat {lat} out of Kerala bounds"
        assert 74.5 <= lng <= 77.8, f"Lng {lng} out of Kerala bounds"
