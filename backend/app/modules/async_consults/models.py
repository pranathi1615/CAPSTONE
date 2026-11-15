"""Beanie models for Asynchronous Consultations (Phase 6)."""

from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any, Dict, List, Optional
import uuid
from beanie import Document
from pydantic import Field


class AsyncConsultStatus(str, Enum):
    SUBMITTED = "submitted"
    UNDER_REVIEW = "under_review"
    REPLIED = "replied"
    CLOSED = "closed"


class AsyncConsult(Document):
    consult_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    patient_id: str
    patient_name: str
    patient_phone: Optional[str] = None
    submitted_by: str
    submitted_by_role: str

    assigned_doctor_id: Optional[str] = None
    doctor_name: Optional[str] = None
    specialty: str = "General Medicine"
    urgency: str = "soon"  # routine | soon | urgent | emergency

    symptoms: List[str] = Field(default_factory=list)
    symptom_text: Optional[str] = None
    vitals: Dict[str, Any] = Field(default_factory=dict)
    photos: List[str] = Field(default_factory=list)
    voice_notes: List[str] = Field(default_factory=list)

    status: AsyncConsultStatus = AsyncConsultStatus.SUBMITTED
    response_window_hours: int = 24
    deadline_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc) + timedelta(hours=24)
    )

    # Doctor Response
    doctor_reply_text: Optional[str] = None
    doctor_reply_voice_note_url: Optional[str] = None
    prescription_id: Optional[str] = None
    replied_at: Optional[datetime] = None
    replied_by: Optional[str] = None
    replied_by_name: Optional[str] = None

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @property
    def is_overdue(self) -> bool:
        if self.status in [AsyncConsultStatus.REPLIED, AsyncConsultStatus.CLOSED]:
            return False
        now = datetime.now(timezone.utc)
        deadline = self.deadline_at if self.deadline_at.tzinfo else self.deadline_at.replace(tzinfo=timezone.utc)
        return now > deadline

    class Settings:
        name = "async_consults"
        indexes = [
            "consult_id",
            "patient_id",
            "assigned_doctor_id",
            "status",
            "deadline_at",
            "created_at",
        ]
