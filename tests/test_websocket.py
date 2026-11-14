"""Tests for WebSocket Layer, WebRTC Signalling, Presence, and In-Call Chat."""

import json
import pytest
from httpx import AsyncClient

from app.core.security import create_access_token
from app.modules.chat.models import ChatMessage
from app.modules.chat.websocket_manager import ws_manager
from app.modules.identity.models import User, UserRole


class MockWebSocket:
    """Mock WebSocket for async unit and integration testing."""
    def __init__(self):
        self.is_accepted = False
        self.sent_messages = []

    async def accept(self):
        self.is_accepted = True

    async def send_text(self, text: str):
        self.sent_messages.append(text)


@pytest.mark.asyncio
async def test_websocket_token_authentication():
    """Test JWT validation for WebSocket connections."""
    invalid_auth = await ws_manager.authenticate_token("invalid.jwt.token")
    assert invalid_auth is None

    user = User(
        email="ws.auth@carebridge.local",
        hashed_password="pw",
        full_name="WS Authenticator",
        role=UserRole.DOCTOR
    )
    await user.insert()

    token = create_access_token({
        "sub": user.user_id,
        "email": user.email,
        "role": user.role.value,
        "full_name": user.full_name
    })

    auth_user = await ws_manager.authenticate_token(token)
    assert auth_user is not None
    assert auth_user["user_id"] == user.user_id
    assert auth_user["role"] == "doctor"
    assert auth_user["full_name"] == "WS Authenticator"


@pytest.mark.asyncio
async def test_websocket_room_lifecycle_and_presence():
    """Test client joining room, presence broadcasting, and clean disconnect."""
    user = {
        "user_id": "usr-123",
        "email": "user123@carebridge.local",
        "full_name": "Test User",
        "role": "patient"
    }
    room_id = "test-room-lifecycle"
    ws = MockWebSocket()

    # 1. Connect
    cid = await ws_manager.connect(ws, room_id, user)
    assert ws.is_accepted is True
    assert room_id in ws_manager.active_rooms
    assert cid in ws_manager.active_rooms[room_id]

    # Verify presence broadcast
    assert len(ws.sent_messages) >= 1
    presence_env = json.loads(ws.sent_messages[0])
    assert presence_env["type"] == "presence"
    assert presence_env["payload"]["status"] == "online"
    assert presence_env["payload"]["user_id"] == "usr-123"

    # 2. Disconnect
    await ws_manager.disconnect(room_id, cid)
    assert room_id not in ws_manager.active_rooms


@pytest.mark.asyncio
async def test_websocket_chat_persistence_and_rejoin(client: AsyncClient):
    """Test in-call chat message handling, MongoDB persistence with sequence numbers,

    and reloading history on rejoin.
    """
    # Create persistent patient user in MongoDB
    patient_user = User(
        email="pat111@carebridge.local",
        hashed_password="pw",
        full_name="Anita Devi",
        role=UserRole.PATIENT
    )
    await patient_user.insert()

    user_doctor = {
        "user_id": "doc-999",
        "email": "doc999@carebridge.local",
        "full_name": "Dr Rajesh",
        "role": "doctor"
    }
    user_patient = {
        "user_id": patient_user.user_id,
        "email": patient_user.email,
        "full_name": patient_user.full_name,
        "role": patient_user.role.value
    }
    room_id = "consultation-room-live"
    ws_doc = MockWebSocket()
    ws_pat = MockWebSocket()

    cid_doc = await ws_manager.connect(ws_doc, room_id, user_doctor)
    cid_pat = await ws_manager.connect(ws_pat, room_id, user_patient)

    # Patient sends chat message
    chat_payload = json.dumps({
        "type": "chat_message",
        "room": room_id,
        "payload": {
            "content": "Good morning Doctor Sharma"
        }
    })
    await ws_manager.handle_incoming_message(room_id, cid_pat, user_patient, chat_payload)

    # Verify MongoDB persistence
    messages = await ChatMessage.find(ChatMessage.room == room_id).to_list()
    assert len(messages) == 1
    assert messages[0].content == "Good morning Doctor Sharma"
    assert messages[0].sequence == 1
    assert messages[0].sender_name == "Anita Devi"

    # Verify reload endpoint
    token = create_access_token({
        "sub": patient_user.user_id,
        "email": patient_user.email,
        "role": patient_user.role.value,
        "full_name": patient_user.full_name
    })
    reload_res = await client.get(
        f"/appointments/consultations/{room_id}/messages",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert reload_res.status_code == 200
    history = reload_res.json()
    assert len(history) == 1
    assert history[0]["content"] == "Good morning Doctor Sharma"
    assert history[0]["sequence"] == 1

    # Cleanup
    await ws_manager.disconnect(room_id, cid_doc)
    await ws_manager.disconnect(room_id, cid_pat)


@pytest.mark.asyncio
async def test_webrtc_signalling_relay():
    """Test offer, answer, and ICE candidate signalling envelopes between peers."""
    peer_a = {"user_id": "peer-a", "email": "a@cb.local", "full_name": "Doctor", "role": "doctor"}
    peer_b = {"user_id": "peer-b", "email": "b@cb.local", "full_name": "Patient", "role": "patient"}
    room_id = "signalling-room-xyz"

    ws_a = MockWebSocket()
    ws_b = MockWebSocket()

    cid_a = await ws_manager.connect(ws_a, room_id, peer_a)
    cid_b = await ws_manager.connect(ws_b, room_id, peer_b)

    ws_b.sent_messages.clear()

    # Peer A sends WebRTC SDP Offer
    offer_env = json.dumps({
        "type": "signal_offer",
        "room": room_id,
        "payload": {
            "sdp": "v=0\r\no=- 12345 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n"
        }
    })
    await ws_manager.handle_incoming_message(room_id, cid_a, peer_a, offer_env)

    # Peer B must receive the signal_offer
    b_msgs = [json.loads(m) for m in ws_b.sent_messages]
    offer_received = next((m for m in b_msgs if m["type"] == "signal_offer"), None)
    assert offer_received is not None
    assert "127.0.0.1" in offer_received["payload"]["sdp"]
    assert offer_received["payload"]["sender_id"] == "peer-a"

    # Cleanup
    await ws_manager.disconnect(room_id, cid_a)
    await ws_manager.disconnect(room_id, cid_b)
