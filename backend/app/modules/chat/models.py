"""In-call chat messages and Phase 3 network-adaptive consultation models using Beanie ODM.

Phase 3 Requirements:
1. 'consultation_mode_events collection: consultation_id, from, to, reason, timestamp, stats snapshot.'
2. 'Reliable messaging: every message has an id and a per-room sequence number
    (allocated atomically via Redis INCR or a MongoDB counters collection with $inc).'
3. 'Voice notes metadata in MongoDB, files on disk/volume, delivered with delivery receipts.'
4. 'De-duplicate by message id (unique index on message_id is final guard).'
"""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import uuid
from beanie import Document
from pydantic import Field
from pymongo import ASCENDING, IndexModel


class ConsultationModeEvent(Document):
    """Tracks network mode transitions during a consultation."""
    event_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    consultation_id: str
    from_mode: str  # VIDEO, AUDIO_ONLY, VOICE_NOTE, TEXT
    to_mode: str
    reason: str
    stats_snapshot: Optional[Dict[str, Any]] = None
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "consultation_mode_events"
        indexes = [
            IndexModel([("event_id", ASCENDING)], unique=True),
            IndexModel([("consultation_id", ASCENDING), ("timestamp", ASCENDING)]),
        ]


class VoiceNote(Document):
    """Metadata for uploaded push-to-record voice notes."""
    voice_note_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    room_id: str
    uploader_id: str
    uploader_name: str
    file_path: str
    file_url: str
    duration_seconds: float = 0.0
    file_size_bytes: int = 0
    mime_type: str = "audio/webm"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "voice_notes"
        indexes = [
            IndexModel([("voice_note_id", ASCENDING)], unique=True),
            IndexModel([("room_id", ASCENDING), ("created_at", ASCENDING)]),
        ]


class RoomCounter(Document):
    """Atomic monotonic sequence counter per consultation room.

    Guarantees monotonic sequence allocation using MongoDB atomic $inc
    even in environments without persistent Redis.
    """
    room_id: str
    current_seq: int = 0

    class Settings:
        name = "room_counters"
        indexes = [
            IndexModel([("room_id", ASCENDING)], unique=True),
        ]


class ChatMessage(Document):
    """Chat message in a consultation room.

    Unique index on message_id prevents duplicates on reconnection/retry.
    """
    message_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    room: str
    sequence: int
    sender_id: str
    sender_name: str
    sender_role: str
    content: str
    msg_type: str = "text"  # "text", "voice_note", "system"
    metadata: Optional[Dict[str, Any]] = None
    delivered_to: List[str] = Field(default_factory=list)
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "messages"
        indexes = [
            IndexModel([("message_id", ASCENDING)], unique=True),
            IndexModel([("room", ASCENDING), ("sequence", ASCENDING)]),
            IndexModel([("room", ASCENDING), ("timestamp", ASCENDING)]),
        ]
