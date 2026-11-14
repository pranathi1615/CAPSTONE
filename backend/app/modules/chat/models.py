"""In-call chat messages collection using Beanie ODM.

Requirement:
'stored in a messages collection (unique index on message id,
index on room and sequence), history reloaded on rejoin.'
"""

from datetime import datetime, timezone
import uuid
from beanie import Document
from pydantic import Field
from pymongo import ASCENDING, IndexModel


class ChatMessage(Document):
    message_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    room: str
    sequence: int
    sender_id: str
    sender_name: str
    sender_role: str
    content: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "messages"
        indexes = [
            IndexModel([("message_id", ASCENDING)], unique=True),
            IndexModel([("room", ASCENDING), ("sequence", ASCENDING)]),
            IndexModel([("room", ASCENDING), ("timestamp", ASCENDING)]),
        ]
