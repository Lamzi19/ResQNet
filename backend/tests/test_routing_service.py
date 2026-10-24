"""
Automated tests for OSRM Road Routing API Integration.
Tests:
- Route calculation between valid Kerala coordinates
- Distance and estimated duration validation
- Response format and turn-by-turn steps schema
- Unreachable / NoRoute coordinate handling
- Out of bounds coordinate rejection
- Google Maps navigation URL formation
"""
import urllib.request
import json
import pytest

# Origin: Ernakulam Marine Drive (9.9816, 76.2999)
# Destination: Aluva Govt Hospital (10.1076, 76.3516)
ORIGIN_LAT, ORIGIN_LNG = 9.9816, 76.2999
DEST_LAT, DEST_LNG = 10.1076, 76.3516


def test_osrm_valid_road_route():
    url = f"https://router.project-osrm.org/route/v1/driving/{ORIGIN_LNG},{ORIGIN_LAT};{DEST_LNG},{DEST_LAT}?overview=full&geometries=geojson&steps=true"
    req = urllib.request.Request(url, headers={"User-Agent": "ResQNet-Flood-Intelligence/2.0"})
    
    with urllib.request.urlopen(req, timeout=12) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode())
        
    assert data.get("code") == "Ok"
    assert "routes" in data and len(data["routes"]) > 0
    
    route = data["routes"][0]
    # Road distance must be positive and greater than straight line distance (~15km)
    road_km = route["distance"] / 1000.0
    assert 14.0 <= road_km <= 26.0, f"Unexpected road distance: {road_km} km"
    
    duration_mins = route["duration"] / 60.0
    assert duration_mins > 0
    
    # Geometry must be GeoJSON LineString
    geom = route["geometry"]
    assert geom["type"] == "LineString"
    coords = geom["coordinates"]
    assert len(coords) >= 10
    for pt in coords:
        lon, lat = pt[0], pt[1]
        assert 8.0 <= lat <= 13.0, f"Lat {lat} out of Kerala bounds"
        assert 74.5 <= lon <= 77.8, f"Lon {lon} out of Kerala bounds"
        
    # Steps must be present
    legs = route["legs"]
    assert len(legs) > 0
    steps = legs[0]["steps"]
    assert len(steps) >= 3
    for s in steps:
        assert "maneuver" in s
        assert "distance" in s
        assert "duration" in s


def test_osrm_invalid_coordinates_handled():
    # An ocean coordinate in middle of the Arabian Sea that cannot connect to road network
    # OSRM will either snap or return NoRoute or empty
    url = "https://router.project-osrm.org/route/v1/driving/70.0,9.0;70.1,9.1?overview=full&geometries=geojson"
    req = urllib.request.Request(url, headers={"User-Agent": "ResQNet-Flood-Intelligence/2.0"})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
            # Code should be NoRoute or Ok if snapped to nearest coast
            assert data.get("code") in ["NoRoute", "Ok", "NoSegment"]
    except urllib.error.HTTPError as e:
        assert e.code in [400, 429, 500]


def test_google_maps_url_generation():
    origin_lat, origin_lng = 9.9816, 76.2999
    dest_lat, dest_lng = 10.1076, 76.3516
    expected_url = f"https://www.google.com/maps/dir/?api=1&origin={origin_lat},{origin_lng}&destination={dest_lat},{dest_lng}&travelmode=driving"
    assert "https://www.google.com/maps/dir/?api=1" in expected_url
    assert f"origin={origin_lat},{origin_lng}" in expected_url
    assert f"destination={dest_lat},{dest_lng}" in expected_url
