"""Beanie Document model for CHW Assisted Telehealth Visits."""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import uuid
from beanie import Document
from pydantic import Field
from pymongo import ASCENDING, IndexModel


class AssistedVisit(Document):
    visit_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    patient_id: str = Field(..., description="Target patient UUID")
    patient_name: str
    patient_phone: Optional[str] = None
    patient_age: Optional[int] = None
    patient_gender: Optional[str] = None
    chw_id: str = Field(..., description="CHW user UUID who facilitated visit")
    chw_name: str
    consent_id: str = Field(..., description="Mandatory patient consent UUID recorded before visit")
    status: str = Field(default="completed", description="completed | consult_requested | call_started | in_progress")
    vitals: Dict[str, Any] = Field(default_factory=dict)
    symptoms: List[str] = Field(default_factory=list)
    symptom_notes: Optional[str] = None
    transcript: Optional[str] = None
    voice_note_id: Optional[str] = None
    consultation_type: str = Field(default="async_consult", description="live_call | async_consult")
    async_consult_summary: Optional[str] = None
    is_out_of_range: bool = False
    out_of_range_flags: List[Dict[str, Any]] = Field(default_factory=list)
    client_id: str = Field(..., description="Client-side mutation tracking UUID")
    idempotency_key: Optional[str] = Field(None, description="Idempotency key for offline sync")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    synced_at: Optional[datetime] = None
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "assisted_visits"
        indexes = [
            IndexModel([("visit_id", ASCENDING)], unique=True),
            IndexModel([("patient_id", ASCENDING), ("created_at", ASCENDING)]),
            IndexModel([("chw_id", ASCENDING), ("created_at", ASCENDING)]),
            IndexModel([("status", ASCENDING)]),
        ]
