import pytest
import uuid
import time
from datetime import datetime, timedelta
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.database.connection import SessionLocal
from backend.app.database.models import SafetyBroadcastRecord, BroadcastRecipientRecord, SosIncidentRecord, ParticipantRecord

@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c

def test_participant_registration_scalable(client):
    """Verify arbitrary number of participants can register without limits."""
    participants = []
    for i in range(10):  # More than 3 phones
        p_id = f"test-part-{i}-{uuid.uuid4().hex[:6]}"
        dev_id = f"device-{i}-{uuid.uuid4().hex[:6]}"
        payload = {
            "id": p_id,
            "name": f"Citizen {i}",
            "phoneNumber": f"+91987654321{i}",
            "districtId": "ernakulam",
            "deviceId": dev_id,
            "latitude": 9.9816 + (i * 0.001),
            "longitude": 76.2999 + (i * 0.001),
            "accuracyM": 5.0
        }
        res = client.post("/api/participants", json=payload)
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["id"] == p_id
        assert data["name"] == f"Citizen {i}"
        assert data["device_id"] == dev_id
        assert data["last_latitude"] is not None
        participants.append(data)

    # Fetch list
    res_list = client.get("/api/participants?district=ernakulam")
    assert res_list.status_code == 200
    all_parts = res_list.json()
    assert len(all_parts) >= 10


def test_broadcast_creation_and_device_polling(client):
    """Test safety broadcast creation, recipient assignment, and device poll with delivery ack."""
    # 1. Register 4 distinct participants
    p_ids = []
    for i in range(4):
        p_id = f"poll-part-{i}-{uuid.uuid4().hex[:6]}"
        dev_id = f"poll-dev-{i}-{uuid.uuid4().hex[:6]}"
        client.post("/api/participants", json={
            "id": p_id,
            "name": f"Polling Citizen {i}",
            "phoneNumber": "+919000000000",
            "districtId": "alappuzha",
            "deviceId": dev_id,
            "latitude": 9.4981,
            "longitude": 76.3388
        })
        p_ids.append((p_id, dev_id))

    # 2. Create safety broadcast for Alappuzha with 15s deadline
    create_payload = {
        "title": "Flash Flood Evacuation Alert - Alappuzha Ward 4",
        "message": "Water levels rising. Please report your safety status immediately.",
        "severity": "CRITICAL",
        "districtId": "alappuzha",
        "deadlineSeconds": 15,
        "createdBy": "Alappuzha Incident Command"
    }
    res_bc = client.post("/api/broadcasts", json=create_payload)
    assert res_bc.status_code == 200
    bc_data = res_bc.json()
    broadcast_id = bc_data["id"]
    assert bc_data["total_recipients"] >= 4
    assert bc_data["awaiting_count"] >= 4

    # 3. Handset 0 polls for active broadcast
    p0_id, dev0_id = p_ids[0]
    poll_res = client.get(f"/api/broadcasts/active?participant_id={p0_id}&device_id={dev0_id}")
    assert poll_res.status_code == 200
    active_bc = poll_res.json()
    assert active_bc is not None
    assert active_bc["id"] == broadcast_id

    # 4. Check broadcast details: recipient 0 should have delivery_status = DELIVERED_TO_DEVICE
    detail_res = client.get(f"/api/broadcasts/{broadcast_id}")
    assert detail_res.status_code == 200
    detail = detail_res.json()
    recip_0 = next(r for r in detail["recipients"] if r["participant_id"] == p0_id)
    assert recip_0["delivery_status"] == "DELIVERED_TO_DEVICE"
    assert recip_0["safety_status"] == "AWAITING RESPONSE"


def test_safety_responses_safe_and_help_linkage(client):
    """Test I AM SAFE and I NEED HELP responses, verifying auto SOS creation."""
    # Register 2 participants
    p1_id = f"resp-part-1-{uuid.uuid4().hex[:6]}"
    p2_id = f"resp-part-2-{uuid.uuid4().hex[:6]}"
    client.post("/api/participants", json={
        "id": p1_id,
        "name": "Ananya Nair",
        "districtId": "thrissur",
        "deviceId": f"dev-{p1_id}",
        "latitude": 10.5276,
        "longitude": 76.2144
    })
    client.post("/api/participants", json={
        "id": p2_id,
        "name": "Karthik Menon",
        "districtId": "thrissur",
        "deviceId": f"dev-{p2_id}",
        "latitude": 10.5300,
        "longitude": 76.2200
    })

    # Create broadcast targeting these 2
    res_bc = client.post("/api/broadcasts", json={
        "title": "Chalakudy River Swell Alert",
        "message": "Heavy discharge from dams. Confirm safety.",
        "districtId": "thrissur",
        "targetParticipantIds": [p1_id, p2_id],
        "deadlineSeconds": 60
    })
    assert res_bc.status_code == 200
    bc_id = res_bc.json()["id"]

    # 1. P1 confirms SAFE
    res_safe = client.post(f"/api/broadcasts/{bc_id}/respond", json={
        "participantId": p1_id,
        "deviceId": f"dev-{p1_id}",
        "safetyStatus": "SAFE CONFIRMED",
        "latitude": 10.5278,
        "longitude": 76.2146,
        "note": "We are on the second floor, safe."
    })
    assert res_safe.status_code == 200
    safe_data = res_safe.json()
    assert safe_data["safety_status"] == "SAFE CONFIRMED"
    assert safe_data["linked_sos_id"] is None

    # 2. P2 requests HELP
    res_help = client.post(f"/api/broadcasts/{bc_id}/respond", json={
        "participantId": p2_id,
        "deviceId": f"dev-{p2_id}",
        "safetyStatus": "HELP REQUESTED",
        "latitude": 10.5305,
        "longitude": 76.2205,
        "peopleCount": 3,
        "hasVulnerable": True,
        "note": "Water entering living room, power cut, 1 infant."
    })
    assert res_help.status_code == 200
    help_data = res_help.json()
    assert help_data["safety_status"] == "HELP REQUESTED"
    linked_sos_id = help_data["linked_sos_id"]
    assert linked_sos_id is not None

    # 3. Verify the linked SOS exists in distress queue with participant_id & broadcast_id
    res_sos_list = client.get("/api/sos?district=thrissur")
    assert res_sos_list.status_code == 200
    incidents = res_sos_list.json()
    linked_inc = next((x for x in incidents if x["id"] == linked_sos_id), None)
    assert linked_inc is not None
    assert linked_inc["participant_id"] == p2_id
    assert linked_inc["broadcast_id"] == bc_id
    assert linked_inc["priority_score"] >= 70

    # 4. Check tallies in broadcast
    detail = client.get(f"/api/broadcasts/{bc_id}").json()
    assert detail["safe_count"] == 1
    assert detail["help_requested_count"] == 1
    assert detail["awaiting_count"] == 0


def test_deadline_expiration_and_manual_escalation(client):
    """Test that expired unanswered participants become NO RESPONSE — VERIFY SAFETY and can be manually escalated."""
    p_unans_id = f"unans-part-{uuid.uuid4().hex[:6]}"
    client.post("/api/participants", json={
        "id": p_unans_id,
        "name": "Unresponsive Participant",
        "districtId": "wayanad",
        "deviceId": f"dev-{p_unans_id}",
        "latitude": 11.6854,
        "longitude": 76.1320
    })

    # Create broadcast with artificially passed deadline via database edit
    res_bc = client.post("/api/broadcasts", json={
        "title": "Meppadi Landslide Warning",
        "message": "Immediate evacuation warning.",
        "districtId": "wayanad",
        "targetParticipantIds": [p_unans_id],
        "deadlineSeconds": 10
    })
    bc_id = res_bc.json()["id"]

    # Force deadline to past in DB
    db = SessionLocal()
    bc_rec = db.query(SafetyBroadcastRecord).filter(SafetyBroadcastRecord.id == bc_id).first()
    bc_rec.expires_at = datetime.utcnow() - timedelta(seconds=5)
    db.commit()
    db.close()

    # Query broadcast - lazy expiry should mark status as NO RESPONSE — VERIFY SAFETY
    detail = client.get(f"/api/broadcasts/{bc_id}").json()
    recip = detail["recipients"][0]
    assert recip["safety_status"] == "NO RESPONSE — VERIFY SAFETY"
    assert detail["no_response_count"] == 1
    assert recip["last_known_latitude"] == 11.6854

    # Manual escalation by responder
    res_esc = client.post(f"/api/broadcasts/{bc_id}/escalate/{p_unans_id}", json={
        "reason": "Family unable to contact, elderly couple in landslide sector.",
        "escalatedBy": "Wayanad Collectorate EOC"
    })
    assert res_esc.status_code == 200
    esc_data = res_esc.json()
    assert esc_data["is_escalated"] is True
    assert esc_data["linked_sos_id"] is not None

    # Verify SOS incident created for welfare rescue
    res_sos = client.get("/api/sos?district=wayanad").json()
    welfare_inc = next((x for x in res_sos if x["id"] == esc_data["linked_sos_id"]), None)
    assert welfare_inc is not None
    assert "WELFARE CHECK" in welfare_inc["description"].upper() or "NO RESPONSE" in welfare_inc["description"].upper()


def test_peer_mesh_relay_ingestion(client):
    """Test ingestion of peer relayed SOS preserving original coordinates."""
    msg_id = f"relay-test-{uuid.uuid4().hex[:8]}"
    payload = {
        "messageId": msg_id,
        "originDeviceId": "citizen_phone_stranded_node",
        "participantId": "citizen_part_001",
        "districtId": "idukki",
        "originLatitude": 9.8500,
        "originLongitude": 76.9700,
        "locationAccuracyM": 8.0,
        "locationName": "Munnar Tea Estate Ward 2",
        "messageText": "Water level reaching roof, 5 people stranded, urgent rescue needed.",
        "peopleCount": 5,
        "hasVulnerable": True,
        "severity": "CRITICAL",
        "relayNodeId": "volunteer_relay_boat_node_99",
        "hopCount": 2
    }

    res = client.post("/api/sos/relay", json=payload)
    assert res.status_code == 201
    inc = res.json()
    assert inc["message_id"] == msg_id
    assert inc["origin_device_id"] == "citizen_phone_stranded_node"
    assert inc["participant_id"] == "citizen_part_001"
    assert inc["relay_node_id"] == "volunteer_relay_boat_node_99"
    assert inc["hop_count"] == 2
    assert inc["delivery_channel"] == "RELAYED_BLE_MESH"
    assert inc["latitude"] == 9.8500  # Preserved original location
    assert inc["longitude"] == 76.9700
    assert inc["priority_score"] >= 85
