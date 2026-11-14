"""Notifications and MOCK SMS models using Beanie.

Per Standing Rule 2:
'Only external providers (SMS, maps, hospital data) may be mocked,
and every mock must be labelled MOCK in code and in the UI.'
"""

from datetime import datetime, timezone
import uuid
from beanie import Document
from pydantic import Field
from pymongo import ASCENDING, DESCENDING, IndexModel


class MockSMS(Document):
    sms_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    recipient_phone: str
    recipient_name: str
    message_body: str
    event_type: str  # e.g., "BOOKING_CONFIRMED", "REMINDER_1HR", "QUEUE_JOINED"
    is_mock: bool = True  # MOCK: Explicitly labelled mock provider
    status: str = "DELIVERED_MOCK"
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "mock_sms_inbox"
        indexes = [
            IndexModel([("sms_id", ASCENDING)], unique=True),
            IndexModel([("recipient_phone", ASCENDING)]),
            IndexModel([("timestamp", DESCENDING)]),
        ]
