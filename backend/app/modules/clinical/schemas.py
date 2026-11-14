"""Schemas for FHIR R4 clinical data subsets and CRUD payloads."""

from datetime import datetime
from typing import Any, Dict, Optional
from pydantic import BaseModel, Field

from app.modules.clinical.models import ClinicalRecordType


class FHIRConditionData(BaseModel):
    resourceType: str = "Condition"
    code: str = Field(..., min_length=1, description="Condition or diagnosis name, e.g. 'Type 2 Diabetes'")
    clinical_status: str = Field(default="active", description="active | recurrence | relapse | remission | resolved")
    verification_status: str = Field(default="confirmed", description="unconfirmed | provisional | differential | confirmed | refuted")
    severity: Optional[str] = Field(default="moderate", description="mild | moderate | severe")
    onset_datetime: Optional[str] = None
    notes: Optional[str] = None


class FHIRObservationData(BaseModel):
    resourceType: str = "Observation"
    category: str = "vital-signs"
    systolic_bp: Optional[float] = Field(None, ge=40, le=300, description="Systolic blood pressure (mmHg)")
    diastolic_bp: Optional[float] = Field(None, ge=20, le=200, description="Diastolic blood pressure (mmHg)")
    pulse: Optional[float] = Field(None, ge=20, le=300, description="Heart pulse rate (bpm)")
    temperature_c: Optional[float] = Field(None, ge=30.0, le=45.0, description="Body temperature in Celsius")
    spo2_percent: Optional[float] = Field(None, ge=50.0, le=100.0, description="Oxygen saturation SpO2 %")
    weight_kg: Optional[float] = Field(None, ge=1.0, le=500.0, description="Weight in kilograms")
    effective_datetime: Optional[str] = None
    notes: Optional[str] = None


class FHIRAllergyData(BaseModel):
    resourceType: str = "AllergyIntolerance"
    substance: str = Field(..., min_length=1, description="Allergen, e.g. 'Penicillin' or 'Peanuts'")
    clinical_status: str = Field(default="active", description="active | inactive | resolved")
    verification_status: str = Field(default="confirmed", description="unconfirmed | confirmed | refuted")
    criticality: str = Field(default="low", description="low | high | unable-to-assess")
    manifestation: Optional[str] = Field(None, description="Reaction symptoms, e.g. 'Skin rash', 'Urticaria'")
    recorded_date: Optional[str] = None
    notes: Optional[str] = None


class ClinicalRecordCreate(BaseModel):
    record_id: Optional[str] = None
    patient_id: str
    record_type: ClinicalRecordType
    data: Dict[str, Any]
    client_id: Optional[str] = None
    client_timestamp: Optional[datetime] = None


class ClinicalRecordUpdate(BaseModel):
    data: Dict[str, Any]
    version: int = Field(..., ge=1, description="Current known version for optimistic locking")
    client_id: Optional[str] = None


class ClinicalRecordResponse(BaseModel):
    record_id: str
    patient_id: str
    doctor_id: Optional[str] = None
    record_type: str
    data: Dict[str, Any]
    version: int
    client_id: str
    is_deleted: bool
    created_at: datetime
    updated_at: datetime
