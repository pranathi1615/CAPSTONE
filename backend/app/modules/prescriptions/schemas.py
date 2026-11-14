"""Pydantic schemas for prescription creation, retrieval, cryptographic verification, and dispensing."""

from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field

from app.modules.prescriptions.models import PrescriptionItem, PrescriptionStatus


class PrescriptionItemCreate(BaseModel):
    drug_name: str = Field(..., min_length=1)
    dose: str = Field(..., min_length=1)
    frequency: str = Field(..., min_length=1)
    duration: str = Field(..., min_length=1)
    instructions: Optional[str] = None


class PrescriptionCreateRequest(BaseModel):
    patient_id: str
    patient_name: str
    consultation_id: Optional[str] = None
    items: List[PrescriptionItemCreate] = Field(..., min_length=1)
    notes: Optional[str] = None
    valid_days: int = Field(default=14, ge=1, le=90)


class PrescriptionResponse(BaseModel):
    prescription_id: str
    consultation_id: Optional[str] = None
    patient_id: str
    patient_name: str
    doctor_id: str
    doctor_name: str
    doctor_registration_number: str
    doctor_public_key: str
    items: List[PrescriptionItem]
    notes: Optional[str] = None
    canonical_json: str
    signature: str
    qr_payload: str
    status: PrescriptionStatus
    signature_valid: bool
    issued_at: datetime
    expires_at: datetime
    dispensed_at: Optional[datetime] = None
    dispensed_by: Optional[str] = None
    dispensed_by_name: Optional[str] = None


class PrescriptionDispenseRequest(BaseModel):
    notes: Optional[str] = None


class PrescriptionDispenseResponse(BaseModel):
    success: bool
    prescription_id: str
    status: PrescriptionStatus
    dispensed_at: datetime
    dispensed_by_name: str
    message: str
