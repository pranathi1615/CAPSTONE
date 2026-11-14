"""Consent models using Beanie.

Represents explicit patient consent for telehealth consultations and record sharing.
Patients can grant for themselves; Community Health Workers (CHWs) can grant on behalf of patients.
"""

from datetime import datetime, timezone
from typing import Optional
import uuid

from beanie import Document
from pydantic import Field
from pymongo import ASCENDING, IndexModel


class Consent(Document):
    consent_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    patient_id: str
    purpose: str  # e.g., "teleconsultation", "medical_record_sharing", "emergency_care"
    granted_by: str  # user_id of the granting actor (patient self or CHW)
    granted_by_role: str  # "patient" or "chw"
    granted_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    revoked_at: Optional[datetime] = None

    class Settings:
        name = "consents"
        indexes = [
            IndexModel([("consent_id", ASCENDING)], unique=True),
            IndexModel([("patient_id", ASCENDING)]),
            IndexModel([("patient_id", ASCENDING), ("revoked_at", ASCENDING)]),
        ]
