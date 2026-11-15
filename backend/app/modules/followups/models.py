"""Beanie models for Patient Follow-up Planning & Reminders (Phase 6)."""

from datetime import datetime, timezone
from enum import Enum
from typing import Optional
import uuid
from beanie import Document
from pydantic import Field
from pymongo import ASCENDING, IndexModel


class FollowUpStatus(str, Enum):
    SCHEDULED = "scheduled"
    REMINDED = "reminded"
    COMPLETED = "completed"
    MISSED = "missed"
    CANCELLED = "cancelled"


class FollowUp(Document):
    followup_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    booking_id: Optional[str] = None
    patient_id: str
    patient_name: str
    patient_phone: Optional[str] = None
    doctor_id: str
    doctor_name: str
    due_date: datetime
    reason: str
    status: FollowUpStatus = FollowUpStatus.SCHEDULED
    chw_id: Optional[str] = None

    reminder_sent_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "followups"
        indexes = [
            IndexModel([("due_date", ASCENDING), ("status", ASCENDING)]),
            IndexModel([("followup_id", ASCENDING)], unique=True),
            IndexModel([("patient_id", ASCENDING), ("status", ASCENDING)]),
            IndexModel([("doctor_id", ASCENDING), ("due_date", ASCENDING)]),
        ]
