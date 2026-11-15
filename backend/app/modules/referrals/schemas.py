"""Pydantic schemas for Clinical Referral Notes."""

from datetime import datetime
from typing import Any, Dict, Optional
from pydantic import BaseModel, Field


class CreateReferralRequest(BaseModel):
    patient_id: str
    facility_id: str
    urgency: str = Field(default="emergency", description="emergency | urgent | routine")
    clinical_summary: str = Field(..., min_length=5)
    vitals: Dict[str, Any] = Field(default_factory=dict)
    red_flags_identified: Optional[str] = None
    transport_mode: Optional[str] = "Ambulance 108 (MOCK)"


class ReferralResponse(BaseModel):
    referral_id: str
    patient_id: str
    patient_name: str
    patient_phone: Optional[str] = None
    referred_by_name: str
    referred_by_role: str
    facility_name: str
    facility_address: str
    facility_phone: str
    urgency: str
    clinical_summary: str
    vitals: Dict[str, Any]
    transport_mode: Optional[str] = None
    download_pdf_url: str
    created_at: datetime
