"""Pydantic schemas for Asynchronous Consultations."""

from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from app.modules.async_consults.models import AsyncConsultStatus


class CreateAsyncConsultRequest(BaseModel):
    patient_id: Optional[str] = None
    patient_name: Optional[str] = None
    patient_phone: Optional[str] = None
    assigned_doctor_id: Optional[str] = None
    specialty: str = "General Medicine"
    urgency: Optional[str] = "soon"
    symptoms: List[str] = Field(default_factory=list)
    symptom_text: Optional[str] = None
    vitals: Dict[str, Any] = Field(default_factory=dict)
    photos: List[str] = Field(default_factory=list)
    voice_notes: List[str] = Field(default_factory=list)
    response_window_hours: int = 24


class ReplyAsyncConsultRequest(BaseModel):
    reply_text: Optional[str] = None
    voice_note_url: Optional[str] = None
    prescription_id: Optional[str] = None


class AsyncConsultResponse(BaseModel):
    consult_id: str
    patient_id: str
    patient_name: str
    patient_phone: Optional[str] = None
    submitted_by: str
    submitted_by_role: str
    assigned_doctor_id: Optional[str] = None
    doctor_name: Optional[str] = None
    specialty: str
    urgency: str
    symptoms: List[str]
    symptom_text: Optional[str] = None
    vitals: Dict[str, Any]
    photos: List[str]
    voice_notes: List[str]
    status: AsyncConsultStatus
    response_window_hours: int
    deadline_at: datetime
    is_overdue: bool
    doctor_reply_text: Optional[str] = None
    doctor_reply_voice_note_url: Optional[str] = None
    prescription_id: Optional[str] = None
    replied_at: Optional[datetime] = None
    replied_by: Optional[str] = None
    replied_by_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime
