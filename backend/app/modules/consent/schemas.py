"""Pydantic schemas for Patient Consent Management."""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class ConsentGrantRequest(BaseModel):
    patient_id: str = Field(..., description="Target patient UUID")
    purpose: str = Field(
        default="teleconsultation",
        description="Purpose of consent (e.g. teleconsultation, medical_record_sharing, emergency_triage)"
    )


class ConsentResponse(BaseModel):
    consent_id: str
    patient_id: str
    purpose: str
    granted_by: str
    granted_by_role: str
    granted_at: datetime
    revoked_at: Optional[datetime] = None
    is_active: bool
