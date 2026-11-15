"""Beanie models for Clinical Referral Notes (Phase 6)."""

from datetime import datetime, timezone
from typing import Any, Dict, Optional
import uuid
from beanie import Document
from pydantic import Field


class ReferralNote(Document):
    referral_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    patient_id: str
    patient_name: str
    patient_phone: Optional[str] = None
    patient_age: Optional[int] = None
    patient_gender: Optional[str] = None

    referred_by: str
    referred_by_name: str
    referred_by_role: str  # doctor or chw

    facility_id: str
    facility_name: str
    facility_address: str
    facility_phone: str
    urgency: str = "emergency"  # emergency | urgent | routine

    clinical_summary: str
    vitals: Dict[str, Any] = Field(default_factory=dict)
    red_flags_identified: Optional[str] = None
    transport_mode: Optional[str] = "Ambulance 108 (MOCK)"

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "referral_notes"
        indexes = [
            "referral_id",
            "patient_id",
            "facility_id",
            "created_at",
        ]
