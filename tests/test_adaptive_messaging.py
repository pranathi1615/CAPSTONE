"""Tests for Phase 3: Reliable Messaging, Deduplication, Reconnection Gap Replay,
Mode Transition Audit Events, and Voice Note Uploads.
"""

import io
import pytest
from httpx import AsyncClient
from app.modules.identity.models import User, UserRole
from app.modules.chat.models import ChatMessage, ConsultationModeEvent, VoiceNote, RoomCounter
from app.modules.chat.websocket_manager import ws_manager


@pytest.mark.asyncio
async def test_atomic_room_sequence_increment():
    """Verify monotonic sequence allocation using atomic increment."""
    test_room = "test-atomic-seq-room"
    
    # Sequence should start at 1 and monotonically increment
    seq1 = await ws_manager.allocate_room_sequence(test_room)
    seq2 = await ws_manager.allocate_room_sequence(test_room)
    seq3 = await ws_manager.allocate_room_sequence(test_room)

    assert seq1 >= 1
    assert seq2 == seq1 + 1
    assert seq3 == seq2 + 1


@pytest.mark.asyncio
async def test_message_deduplication_by_id():
    """Verify unique message_id prevents duplicates on client retry."""
    test_room = "test-dedup-room"
    msg_id = "test-msg-unique-uuid-12345"

    user_data = {
        "user_id": "user-test-1",
        "email": "user@test.local",
        "full_name": "Test User",
        "role": "patient"
    }

    raw_json = f'{{"type": "chat_message", "payload": {{"message_id": "{msg_id}", "content": "Hello World"}}}}'

    # Send first time
    await ws_manager.handle_incoming_message(
        room_id=test_room,
        connection_id="conn-1",
        user=user_data,
        raw_text=raw_json
    )

    # Check exactly 1 message exists
    count = await ChatMessage.find(ChatMessage.message_id == msg_id).count()
    assert count == 1

    # Send identical message_id again (simulating network retry/duplicate)
    await ws_manager.handle_incoming_message(
        room_id=test_room,
        connection_id="conn-1",
        user=user_data,
        raw_text=raw_json
    )

    # Must still be exactly 1 message
    count_after = await ChatMessage.find(ChatMessage.message_id == msg_id).count()
    assert count_after == 1


@pytest.mark.asyncio
async def test_chat_message_history_gap_replay(client: AsyncClient):
    """Verify GET /chat/rooms/{room_id}/messages?after_seq=X returns only missing gap."""
    # Register and log in a patient
    await client.post("/auth/register", json={
        "email": "replay.patient@carebridge.local",
        "password": "Password@123",
        "full_name": "Replay Patient",
        "role": "patient"
    })
    login_resp = await client.post("/auth/login", json={
        "email": "replay.patient@carebridge.local",
        "password": "Password@123"
    })
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    user = await User.find_one(User.email == "replay.patient@carebridge.local")
    test_room = "test-replay-gap-room"

    # Insert 5 sequential messages
    for i in range(1, 6):
        doc = ChatMessage(
            message_id=f"gap-msg-{i}",
            room=test_room,
            sequence=i,
            sender_id=user.user_id,
            sender_name=user.full_name,
            sender_role=user.role.value,
            content=f"Message {i}"
        )
        await doc.insert()

    # Request with after_seq=3 (should return messages 4 and 5)
    response = await client.get(
        f"/chat/rooms/{test_room}/messages?after_seq=3",
        headers=headers
    )

    assert response.status_code == 200
    data = response.json()
    assert data["count"] == 2
    assert [m["sequence"] for m in data["messages"]] == [4, 5]


@pytest.mark.asyncio
async def test_consultation_mode_event_recording(client: AsyncClient):
    """Verify POST /chat/mode-events records audit events and GET retrieves them."""
    # Register and log in a doctor
    await client.post("/auth/register", json={
        "email": "mode.doctor@carebridge.local",
        "password": "Password@123",
        "full_name": "Mode Doctor",
        "role": "doctor",
        "registration_number": "MCI-MODE-01",
        "specialty": "General Medicine"
    })
    login_resp = await client.post("/auth/login", json={
        "email": "mode.doctor@carebridge.local",
        "password": "Password@123"
    })
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    consultation_id = "test-mode-audit-consultation"

    # Record step-down event
    payload = {
        "consultation_id": consultation_id,
        "from_mode": "VIDEO",
        "to_mode": "AUDIO_ONLY",
        "reason": "Packet loss exceeded 8% (12.5%) for 3 consecutive samples",
        "stats_snapshot": {
            "packetLoss": 12.5,
            "rtt": 450,
            "bitrate": 180000
        }
    }

    resp = await client.post("/chat/mode-events", json=payload, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["from_mode"] == "VIDEO"
    assert data["to_mode"] == "AUDIO_ONLY"

    # List mode events
    list_resp = await client.get(f"/chat/mode-events/{consultation_id}", headers=headers)
    assert list_resp.status_code == 200
    list_data = list_resp.json()
    assert list_data["count"] >= 1
    assert list_data["events"][-1]["to_mode"] == "AUDIO_ONLY"


@pytest.mark.asyncio
async def test_voice_note_upload(client: AsyncClient):
    """Verify POST /chat/voice-notes/upload stores audio and registers ChatMessage."""
    # Register and log in a patient
    await client.post("/auth/register", json={
        "email": "vn.patient@carebridge.local",
        "password": "Password@123",
        "full_name": "VN Patient",
        "role": "patient"
    })
    login_resp = await client.post("/auth/login", json={
        "email": "vn.patient@carebridge.local",
        "password": "Password@123"
    })
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    room_id = "test-voice-note-room"
    dummy_audio = io.BytesIO(b"RIFF\x24\x00\x00\x00WAVEfmt \x10\x00\x00\x00data\x00\x00\x00\x00")

    files = {"file": ("test_voice.webm", dummy_audio, "audio/webm")}
    data = {"room_id": room_id, "duration_seconds": "3.5"}

    response = await client.post(
        "/chat/voice-notes/upload",
        files=files,
        data=data,
        headers=headers
    )

    assert response.status_code == 200
    result = response.json()
    assert result["status"] == "success"
    assert "voice_note_id" in result
    assert result["duration_seconds"] == 3.5

    # Verify VoiceNote was persisted in DB
    vn = await VoiceNote.find_one(VoiceNote.voice_note_id == result["voice_note_id"])
    assert vn is not None
    assert vn.room_id == room_id

    # Verify ChatMessage with msg_type='voice_note' was created
    msg = await ChatMessage.find_one(ChatMessage.message_id == result["message_id"])
    assert msg is not None
    assert msg.msg_type == "voice_note"
    assert msg.metadata["voice_note_id"] == result["voice_note_id"]
