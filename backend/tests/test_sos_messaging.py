import uuid
import pytest
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.schemas.sos import IncidentMessageCreate, MessageAckRequest


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def test_incident_messaging_lifecycle(client):
    # 1. Create a distress incident
    msg_id = f"test-msg-{uuid.uuid4()}"
    sos_payload = {
        "messageId": msg_id,
        "messageText": "Trapped on roof in Aluva, water rising rapidly",
        "peopleCount": 2,
        "hasVulnerablePeople": False,
        "districtId": "ernakulam"
    }
    create_res = client.post("/api/sos", json=sos_payload)
    assert create_res.status_code == 201
    incident = create_res.json()
    incident_id = incident["id"]

    # 2. Retrieve messages — initial distress should be present as first message
    get_res = client.get(f"/api/sos/{incident_id}/messages")
    assert get_res.status_code == 200
    msgs = get_res.json()
    assert len(msgs) >= 1
    assert msgs[0]["sender_role"] == "citizen"
    assert "Trapped on roof" in msgs[0]["message_text"]
    assert msgs[0]["delivery_status"] == "CONFIRMED_RECEIVED"

    # 3. Responder sends a reply
    resp_payload = {
        "senderRole": "responder",
        "senderName": "NDRF Ernakulam Unit",
        "messageText": "ResQNet: Your SOS has been received. A rescue team is being assigned. Please stay in a safe location if possible and keep your phone available.",
        "deliveryChannel": "INTERNET"
    }
    post_res = client.post(f"/api/sos/{incident_id}/messages", json=resp_payload)
    assert post_res.status_code == 201
    resp_msg = post_res.json()
    assert resp_msg["sender_role"] == "responder"
    assert resp_msg["sender_name"] == "NDRF Ernakulam Unit"
    # Must NOT falsely claim confirmed delivery at post time
    assert resp_msg["delivery_status"] == "SAVED_ON_SERVER"
    assert resp_msg["acknowledged_at"] is None
    responder_msg_id = resp_msg["id"]

    # 4. Device acknowledges receipt of the responder's message
    ack_payload = {
        "status": "CONFIRMED_RECEIVED",
        "acknowledgedBy": "citizen-device-ack"
    }
    ack_res = client.post(f"/api/sos/{incident_id}/messages/{responder_msg_id}/ack", json=ack_payload)
    assert ack_res.status_code == 200
    acked_msg = ack_res.json()
    assert acked_msg["delivery_status"] == "CONFIRMED_RECEIVED"
    assert acked_msg["acknowledged_at"] is not None

    # 5. Citizen sends a follow-up response
    citizen_reply = {
        "senderRole": "citizen",
        "senderName": "Citizen (Device)",
        "messageText": "Thank you, we are waving an orange cloth from the northern terrace."
    }
    cit_res = client.post(f"/api/sos/{incident_id}/messages", json=citizen_reply)
    assert cit_res.status_code == 201
    cit_msg = cit_res.json()
    assert cit_msg["sender_role"] == "citizen"
    assert "waving an orange cloth" in cit_msg["message_text"]

    # 6. Verify full message history has all 3 messages in order
    final_res = client.get(f"/api/sos/{incident_id}/messages")
    assert final_res.status_code == 200
    all_msgs = final_res.json()
    assert len(all_msgs) == 3
    assert all_msgs[0]["sender_role"] == "citizen"
    assert all_msgs[1]["sender_role"] == "responder"
    assert all_msgs[1]["delivery_status"] == "CONFIRMED_RECEIVED"
    assert all_msgs[2]["sender_role"] == "citizen"
