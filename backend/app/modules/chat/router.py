"""WebSocket and REST Router for Chat, Network Modes, and Voice Notes.

Phase 3 Features:
- Authenticated /ws endpoint with JWT and room multiplexing.
- Message history retrieval and gap replay (/chat/rooms/{room_id}/messages).
- Voice note upload (/chat/voice-notes/upload) with metadata and delivery receipts.
- Consultation mode events (/chat/mode-events) audit log.
"""

import asyncio
from datetime import datetime, timezone
import logging
import os
from typing import Any, Dict, List, Optional
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, WebSocket, WebSocketDisconnect, status
from pydantic import BaseModel, Field

from app.core.dependencies import get_current_user
from app.modules.chat.models import ChatMessage, ConsultationModeEvent, VoiceNote
from app.modules.chat.websocket_manager import ws_manager
from app.modules.identity.models import User

logger = logging.getLogger("carebridge.websocket")

router = APIRouter(prefix="", tags=["Real-Time WebSockets & Chat"])

# Ensure uploads directory for voice notes exists
UPLOAD_DIR = os.path.join(os.getcwd(), "uploads", "voice_notes")
os.makedirs(UPLOAD_DIR, exist_ok=True)


class ModeEventCreate(BaseModel):
    consultation_id: str
    from_mode: str
    to_mode: str
    reason: str
    stats_snapshot: Optional[Dict[str, Any]] = None


# ---------------------------------------------------------------------------
# WebSocket Endpoint
# ---------------------------------------------------------------------------

@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str = Query(..., description="JWT Bearer access token"),
    room: str = Query(default="global", description="Consultation room ID or doctor queue ID")
):
    """Authenticated WebSocket endpoint with reconnect gap replay and mode sync."""
    user = await ws_manager.authenticate_token(token)
    if not user:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    connection_id = await ws_manager.connect(websocket, room, user)

    try:
        while True:
            raw_text = await websocket.receive_text()
            await ws_manager.handle_incoming_message(
                room_id=room,
                connection_id=connection_id,
                user=user,
                raw_text=raw_text
            )
    except WebSocketDisconnect:
        await ws_manager.disconnect(room, connection_id)
    except Exception as exc:
        logger.error("WebSocket unhandled exception: %s", exc)
        await ws_manager.disconnect(room, connection_id)


# ---------------------------------------------------------------------------
# REST Endpoints for Chat & Reconnection Gap Sync
# ---------------------------------------------------------------------------

@router.get("/chat/rooms/{room_id}/messages")
async def get_room_messages(
    room_id: str,
    after_seq: int = Query(0, description="Return messages strictly after this sequence number for gap replay"),
    limit: int = Query(100, ge=1, le=500),
    current_user: User = Depends(get_current_user)
):
    """Retrieve chat message history for consultation room with sequence gap replay."""
    query = ChatMessage.find(
        ChatMessage.room == room_id,
        ChatMessage.sequence > after_seq
    ).sort("sequence").limit(limit)

    messages = await query.to_list()
    return {
        "room_id": room_id,
        "after_seq": after_seq,
        "count": len(messages),
        "messages": [
            {
                "message_id": m.message_id,
                "sequence": m.sequence,
                "sender_id": m.sender_id,
                "sender_name": m.sender_name,
                "sender_role": m.sender_role,
                "content": m.content,
                "msg_type": m.msg_type,
                "metadata": m.metadata,
                "delivered_to": m.delivered_to,
                "timestamp": m.timestamp.isoformat()
            }
            for m in messages
        ]
    }


# ---------------------------------------------------------------------------
# Push-to-Record Voice Notes Upload & Delivery
# ---------------------------------------------------------------------------

@router.post("/chat/voice-notes/upload")
async def upload_voice_note(
    room_id: str = Form(...),
    duration_seconds: float = Form(0.0),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """Chunked/multipart upload for push-to-record voice notes.

    Saves audio file to disk volume, stores metadata in MongoDB, allocates
    an atomic sequence, and broadcasts a voice_note envelope to room.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing voice note file.")

    ext = os.path.splitext(file.filename)[1] or ".webm"
    vn_id = str(uuid.uuid4())
    safe_filename = f"{vn_id}{ext}"
    target_path = os.path.join(UPLOAD_DIR, safe_filename)

    # Save to disk volume using non-blocking thread
    try:
        content = await file.read()
        def _write_bytes():
            with open(target_path, "wb") as f_out:
                f_out.write(content)
        await asyncio.to_thread(_write_bytes)
        file_size = len(content)
    except Exception as exc:
        logger.error("Failed to write voice note file: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to store audio file.")

    file_url = f"/uploads/voice_notes/{safe_filename}"

    # Persist VoiceNote document
    vn_doc = VoiceNote(
        voice_note_id=vn_id,
        room_id=room_id,
        uploader_id=current_user.user_id,
        uploader_name=current_user.full_name,
        file_path=target_path,
        file_url=file_url,
        duration_seconds=duration_seconds,
        file_size_bytes=file_size,
        mime_type=file.content_type or "audio/webm",
        created_at=datetime.now(timezone.utc)
    )
    await vn_doc.insert()

    # Allocate atomic sequence and insert ChatMessage of msg_type="voice_note"
    seq = await ws_manager.allocate_room_sequence(room_id)
    chat_doc = ChatMessage(
        message_id=str(uuid.uuid4()),
        room=room_id,
        sequence=seq,
        sender_id=current_user.user_id,
        sender_name=current_user.full_name,
        sender_role=current_user.role.value,
        content="[Voice Note]",
        msg_type="voice_note",
        metadata={
            "voice_note_id": vn_id,
            "file_url": file_url,
            "duration_seconds": duration_seconds,
            "file_size_bytes": file_size,
            "mime_type": vn_doc.mime_type
        },
        delivered_to=[current_user.user_id],
        timestamp=datetime.now(timezone.utc)
    )
    await chat_doc.insert()

    msg_payload = {
        "message_id": chat_doc.message_id,
        "sequence": chat_doc.sequence,
        "sender_id": chat_doc.sender_id,
        "sender_name": chat_doc.sender_name,
        "sender_role": chat_doc.sender_role,
        "content": chat_doc.content,
        "msg_type": chat_doc.msg_type,
        "metadata": chat_doc.metadata,
        "delivered_to": chat_doc.delivered_to,
        "timestamp": chat_doc.timestamp.isoformat()
    }

    # Store in Redis Stream
    await ws_manager.push_to_redis_stream(room_id, msg_payload)

    # Broadcast via WebSocket
    await ws_manager.broadcast_envelope(
        room=room_id,
        msg_type="chat_message",
        payload=msg_payload,
        sender_connection_id=None
    )

    return {
        "status": "success",
        "voice_note_id": vn_id,
        "file_url": file_url,
        "message_id": chat_doc.message_id,
        "sequence": chat_doc.sequence,
        "duration_seconds": duration_seconds
    }


# ---------------------------------------------------------------------------
# Consultation Mode Events Audit
# ---------------------------------------------------------------------------

@router.post("/chat/mode-events")
async def record_mode_event(
    event_in: ModeEventCreate,
    current_user: User = Depends(get_current_user)
):
    """Record a consultation mode transition event (VIDEO, AUDIO_ONLY, VOICE_NOTE, TEXT)."""
    event = ConsultationModeEvent(
        consultation_id=event_in.consultation_id,
        from_mode=event_in.from_mode,
        to_mode=event_in.to_mode,
        reason=event_in.reason,
        stats_snapshot=event_in.stats_snapshot,
        timestamp=datetime.now(timezone.utc)
    )
    await event.insert()

    # Broadcast to room so both doctor and patient stay in sync
    await ws_manager.broadcast_envelope(
        room=event_in.consultation_id,
        msg_type="mode_change",
        payload={
            "event_id": event.event_id,
            "consultation_id": event.consultation_id,
            "from_mode": event.from_mode,
            "to_mode": event.to_mode,
            "reason": event.reason,
            "stats_snapshot": event.stats_snapshot,
            "triggered_by": current_user.full_name,
            "timestamp": event.timestamp.isoformat()
        }
    )

    return {
        "event_id": event.event_id,
        "consultation_id": event.consultation_id,
        "from_mode": event.from_mode,
        "to_mode": event.to_mode,
        "reason": event.reason,
        "timestamp": event.timestamp.isoformat()
    }


@router.get("/chat/mode-events/{consultation_id}")
async def list_mode_events(
    consultation_id: str,
    current_user: User = Depends(get_current_user)
):
    """List all mode transition events for a consultation session."""
    events = await ConsultationModeEvent.find(
        ConsultationModeEvent.consultation_id == consultation_id
    ).sort("timestamp").to_list()

    return {
        "consultation_id": consultation_id,
        "count": len(events),
        "events": [
            {
                "event_id": e.event_id,
                "from_mode": e.from_mode,
                "to_mode": e.to_mode,
                "reason": e.reason,
                "stats_snapshot": e.stats_snapshot,
                "timestamp": e.timestamp.isoformat()
            }
            for e in events
        ]
    }
