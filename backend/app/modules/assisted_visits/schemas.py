"""Pydantic request and response schemas for CHW Assisted Visits."""

from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class AssistedVisitCreateRequest(BaseModel):
    visit_id: Optional[str] = None
    patient_id: str
    patient_name: str
    patient_phone: Optional[str] = None
    patient_age: Optional[int] = None
    patient_gender: Optional[str] = None
    consent_id: str = Field(..., description="Consent MUST be recorded prior to visit data capture")
    vitals: Dict[str, Any] = Field(default_factory=dict)
    symptoms: List[str] = Field(default_factory=list)
    symptom_notes: Optional[str] = None
    transcript: Optional[str] = None
    voice_note_id: Optional[str] = None
    consultation_type: str = Field(default="async_consult", description="live_call | async_consult")
    async_consult_summary: Optional[str] = None
    client_id: Optional[str] = None
    idempotency_key: Optional[str] = None
    created_at: Optional[datetime] = None


class AssistedVisitResponse(BaseModel):
    visit_id: str
    patient_id: str
    patient_name: str
    patient_phone: Optional[str] = None
    patient_age: Optional[int] = None
    patient_gender: Optional[str] = None
    chw_id: str
    chw_name: str
    consent_id: str
    status: str
    vitals: Dict[str, Any]
    symptoms: List[str]
    symptom_notes: Optional[str] = None
    transcript: Optional[str] = None
    voice_note_id: Optional[str] = None
    consultation_type: str
    async_consult_summary: Optional[str] = None
    is_out_of_range: bool
    out_of_range_flags: List[Dict[str, Any]]
    client_id: str
    idempotency_key: Optional[str] = None
    created_at: datetime
    synced_at: Optional[datetime] = None
    updated_at: datetime
