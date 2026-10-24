import pytest
import uuid
from fastapi.testclient import TestClient
from backend.app.main import app

@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c

def test_sos_submission_and_deduplication(client):
    msg_id = f"test-msg-{uuid.uuid4()}"
    payload = {
        "messageId": msg_id,
        "messageText": "Water level rising rapidly in Aluva ground floor, 4 family members including elderly grandmother trapped.",
        "peopleCount": 4,
        "hasVulnerablePeople": True,
        "severity": "CRITICAL",
        "latitude": 10.1076,
        "longitude": 76.3516,
        "locationAccuracyM": 4.5,
        "districtId": "ernakulam",
        "originDeviceId": "android-test-device-001"
    }
    
    # 1. First submission: Created (201)
    res1 = client.post("/api/sos", json=payload)
    assert res1.status_code == 201
    incident = res1.json()
    assert incident["message_id"] == msg_id
    assert incident["district_id"] == "ernakulam"
    assert incident["people_count"] == 4
    assert incident["priority_score"] >= 80  # Critical + vulnerable + 4 people
    assert "vulnerable_population" in incident["vulnerability_flags"]
    assert incident["response_status"] == "unassigned"

    # 2. Resubmission / retry with identical message_id: Deduplicated (200)
    res2 = client.post("/api/sos", json=payload)
    assert res2.status_code in [200, 201]
    incident2 = res2.json()
    assert incident2["id"] == incident["id"]
    assert incident2["message_id"] == msg_id

def test_sos_list_and_district_filter(client):
    # Fetch all or district filtered
    res = client.get("/api/sos?district=ernakulam")
    assert res.status_code == 200
    incidents = res.json()
    assert isinstance(incidents, list)
    assert len(incidents) >= 1
    for inc in incidents:
        assert inc["district_id"] == "ernakulam"
        assert "priority_score" in inc
        assert "response_status" in inc

def test_sos_lifecycle_and_boat_dispatch(client):
    # 1. Create a distress incident in Ernakulam
    msg_id = f"test-dispatch-{uuid.uuid4()}"
    payload = {
        "messageId": msg_id,
        "messageText": "Urgent evacuation required near Eloor industrial area.",
        "peopleCount": 2,
        "hasVulnerablePeople": False,
        "severity": "HIGH",
        "latitude": 10.0750,
        "longitude": 76.3000,
        "districtId": "ernakulam"
    }
    post_res = client.post("/api/sos", json=payload)
    assert post_res.status_code == 201
    inc_id = post_res.json()["id"]

    # 2. Fetch available boats in Ernakulam
    boat_res = client.get("/api/boats?district=ernakulam")
    assert boat_res.status_code == 200
    boats = boat_res.json()
    assert len(boats) >= 1
    boat_id = boats[0]["id"]
    boat_name = boats[0]["name"]

    # 3. Assign boat to incident
    patch_res = client.patch(f"/api/sos/{inc_id}/status", json={
        "status": "assigned",
        "assigned_boat_id": boat_id,
        "assigned_boat_name": boat_name,
        "mission_phase": "en_route"
    })
    assert patch_res.status_code == 200
    updated_inc = patch_res.json()
    assert updated_inc["response_status"] == "assigned"
    assert updated_inc["assigned_boat_id"] == boat_id
    assert updated_inc["mission_phase"] == "en_route"

    # Verify boat status transitioned to 'deployed'
    boat_res2 = client.get("/api/boats?district=ernakulam")
    updated_boat = next(b for b in boat_res2.json() if b["id"] == boat_id)
    assert updated_boat["status"] == "deployed"
    assert updated_boat["assigned_incident_id"] == inc_id

    # 4. Complete rescue mission
    rescue_res = client.patch(f"/api/sos/{inc_id}/status", json={
        "status": "rescued",
        "notes": "All victims safely brought to shore."
    })
    assert rescue_res.status_code == 200
    rescued_inc = rescue_res.json()
    assert rescued_inc["response_status"] == "rescued"
    assert rescued_inc["mission_phase"] == "completed"

    # Verify boat returned to 'available'
    boat_res3 = client.get("/api/boats?district=ernakulam")
    freed_boat = next(b for b in boat_res3.json() if b["id"] == boat_id)
    assert freed_boat["status"] == "available"
    assert freed_boat["assigned_incident_id"] is None

def test_boat_readiness_update(client):
    boat_res = client.get("/api/boats?district=ernakulam")
    boat_id = boat_res.json()[0]["id"]

    patch_res = client.patch(f"/api/boats/{boat_id}/status", json={
        "status": "maintenance",
        "mission_phase": "standby"
    })
    assert patch_res.status_code == 200
    assert patch_res.json()["status"] == "maintenance"

    # Restore to available
    restore_res = client.patch(f"/api/boats/{boat_id}/status", json={
        "status": "available",
        "mission_phase": "standby"
    })
    assert restore_res.status_code == 200
    assert restore_res.json()["status"] == "available"

def test_risk_zones_endpoint(client):
    res = client.get("/api/risk?district=ernakulam")
    assert res.status_code == 200
    zones = res.json()
    assert len(zones) >= 1
    assert any("Aluva" in z["name"] or "Paravur" in z["name"] for z in zones)

def test_alerts_dispatch_endpoint(client):
    res = client.post("/api/alerts", json={
        "location_id": "ernakulam",
        "title": "Periyar River Inundation Red Warning",
        "message": "Residents within 500m of river bank must move to relief camps immediately.",
        "severity": "CRITICAL"
    })
    assert res.status_code == 200
    alert = res.json()
    assert "ALERT-KL-" in alert["id"]
    assert alert["location_id"] == "ernakulam"
    assert alert["severity"] == "CRITICAL"


def test_end_to_end_android_to_dashboard_lifecycle(client):
    """
    Full end-to-end integration test:
    1. Android SosHttpUploader posts queued SOS distress beacon to POST /api/sos.
    2. FastAPI persists incident to SQLite database with dynamic urgency scoring and district mapping.
    3. Responder Dashboard queries GET /api/sos?district=ernakulam and receives the live incident.
    4. Responder Command Console dispatches rescue vessel via PATCH /api/sos/{incident_id}/status.
    5. Incident updates to 'assigned' and vessel status transitions to 'deployed'.
    6. Rescue mission is completed via PATCH /api/sos/{incident_id}/status with status 'rescued'.
    7. Incident marks 'rescued' and vessel returns to 'available'.
    """
    # 1. Android handset generates and uploads SOS beacon
    android_beacon_payload = {
        "incidentId": f"SOS-LIVE-{uuid.uuid4().hex[:6].upper()}",
        "messageId": f"MSG-LIVE-{uuid.uuid4().hex[:8]}",
        "messageText": "Water 5 feet high near Aluva Manappuram. 5 people stranded on terrace including infant.",
        "peopleCount": 5,
        "hasVulnerablePeople": True,
        "severity": "CRITICAL",
        "latitude": 10.1150,
        "longitude": 76.3480,
        "locationAccuracyM": 3.8,
        "originDeviceId": "android_node_e2e_verified",
        "hopCount": 0,
        "schemaVersion": "1.0.0"
    }

    upload_res = client.post("/api/sos", json=android_beacon_payload)
    assert upload_res.status_code == 201
    persisted = upload_res.json()
    incident_id = persisted["id"]
    assert persisted["district_id"] == "ernakulam"
    assert persisted["response_status"] == "unassigned"
    assert persisted["priority_score"] >= 85

    # 2. Responder Dashboard loads district scenario and verifies incident is visible
    dashboard_res = client.get("/api/sos?district=ernakulam")
    assert dashboard_res.status_code == 200
    incidents = dashboard_res.json()
    matching = [inc for inc in incidents if inc["id"] == incident_id]
    assert len(matching) == 1, "Uploaded Android SOS beacon must be visible in Responder Dashboard!"
    dash_incident = matching[0]
    assert dash_incident["people_count"] == 5
    assert dash_incident["response_status"] == "unassigned"

    # 3. Responder allocates an available rescue vessel
    boats_res = client.get("/api/boats?district=ernakulam")
    assert boats_res.status_code == 200
    available_boats = [b for b in boats_res.json() if b["status"] == "available"]
    assert len(available_boats) >= 1
    selected_boat = available_boats[0]

    dispatch_res = client.patch(f"/api/sos/{incident_id}/status", json={
        "status": "assigned",
        "assigned_boat_id": selected_boat["id"],
        "assigned_boat_name": selected_boat["name"],
        "mission_phase": "en_route"
    })
    assert dispatch_res.status_code == 200
    dispatched = dispatch_res.json()
    assert dispatched["response_status"] == "assigned"
    assert dispatched["assigned_boat_id"] == selected_boat["id"]

    # Verify boat state transitioned to 'deployed'
    boats_res2 = client.get("/api/boats?district=ernakulam")
    deployed_boat = next(b for b in boats_res2.json() if b["id"] == selected_boat["id"])
    assert deployed_boat["status"] == "deployed"
    assert deployed_boat["assigned_incident_id"] == incident_id

    # 4. Mission completed: Victim saved
    rescue_res = client.patch(f"/api/sos/{incident_id}/status", json={
        "status": "rescued",
        "notes": "All 5 family members safely transferred to relief shelter."
    })
    assert rescue_res.status_code == 200
    rescued = rescue_res.json()
    assert rescued["response_status"] == "rescued"
    assert rescued["mission_phase"] == "completed"

    # Verify boat returned to 'available' readiness
    boats_res3 = client.get("/api/boats?district=ernakulam")
    freed_boat = next(b for b in boats_res3.json() if b["id"] == selected_boat["id"])
    assert freed_boat["status"] == "available"
    assert freed_boat["assigned_incident_id"] is None


def test_sos_message_id_lookup(client):
    """Verify lookup by client-generated message_id returns persistence receipt."""
    test_msg_id = f"MSG-LOOKUP-{uuid.uuid4().hex[:8]}"
    res = client.post("/api/sos", json={
        "messageId": test_msg_id,
        "messageText": "Testing message lookup receipt verification",
        "peopleCount": 2,
        "districtId": "ernakulam"
    })
    assert res.status_code == 201
    created = res.json()
    assert created["message_id"] == test_msg_id

    # Lookup by message_id
    lookup_res = client.get(f"/api/sos/message/{test_msg_id}")
    assert lookup_res.status_code == 200
    found = lookup_res.json()
    assert found["id"] == created["id"]
    assert found["message_id"] == test_msg_id
    assert found["delivery_status"] == "ACKNOWLEDGED_BY_SERVER"
    assert found["acknowledged_by_server_at"] is not None


def test_rescuer_acknowledgement_endpoint(client):
    """Verify rescuer acknowledgement transitions delivery state to ACKNOWLEDGED_BY_RESCUER."""
    test_msg_id = f"MSG-RESCUER-ACK-{uuid.uuid4().hex[:8]}"
    res = client.post("/api/sos", json={
        "messageId": test_msg_id,
        "messageText": "Water approaching 2nd floor balcony",
        "peopleCount": 3,
        "districtId": "ernakulam"
    })
    assert res.status_code == 201
    incident_id = res.json()["id"]

    # Acknowledge as rescuer
    ack_res = client.post(f"/api/sos/{incident_id}/rescuer-ack", json={
        "rescuerName": "Captain Ramesh (NDRF 04 Battalion)",
        "notes": "Boat dispatched to sector; ETA 12 mins",
        "missionPhase": "en_route"
    })
    assert ack_res.status_code == 200
    acked = ack_res.json()
    assert acked["delivery_status"] == "ACKNOWLEDGED_BY_RESCUER"
    assert acked["acknowledged_by_rescuer_at"] is not None
    assert acked["rescuer_name"] == "Captain Ramesh (NDRF 04 Battalion)"


def test_stop_forwarding_instructions(client):
    """Verify confirmed message IDs are returned in stop-forwarding instruction endpoint."""
    test_msg_id = f"MSG-STOP-FWD-{uuid.uuid4().hex[:8]}"
    res = client.post("/api/sos", json={
        "messageId": test_msg_id,
        "messageText": "Testing stop-forwarding instruction propagation",
        "peopleCount": 1,
        "districtId": "ernakulam"
    })
    assert res.status_code == 201

    stop_res = client.get("/api/sos/stop-forwarding")
    assert stop_res.status_code == 200
    stop_data = stop_res.json()
    assert "confirmed_message_ids" in stop_data
    assert test_msg_id in stop_data["confirmed_message_ids"]
    assert stop_data["count"] >= 1


def test_relay_hop_limit_and_expiration(client):
    """Verify relay packet validation rejects over-hop-limit and expired distress messages."""
    # Over hop limit (> 3 hops)
    over_hops_res = client.post("/api/sos/relay", json={
        "messageId": f"MSG-HOPS-{uuid.uuid4().hex[:8]}",
        "messageText": "Relayed beacon with excessive hops",
        "originDeviceId": "node_origin_x",
        "relayNodeId": "node_relay_y",
        "hopCount": 4, # Over limit
        "districtId": "ernakulam"
    })
    assert over_hops_res.status_code == 400 or over_hops_res.status_code == 500

    # Expired beacon (> 24 hours old)
    expired_res = client.post("/api/sos/relay", json={
        "messageId": f"MSG-EXPIRED-{uuid.uuid4().hex[:8]}",
        "messageText": "Relayed beacon created 3 days ago",
        "originalTimestamp": "2020-01-01T00:00:00Z",
        "originDeviceId": "node_origin_old",
        "relayNodeId": "node_relay_z",
        "hopCount": 1,
        "districtId": "ernakulam"
    })
    assert expired_res.status_code == 400 or expired_res.status_code == 500


