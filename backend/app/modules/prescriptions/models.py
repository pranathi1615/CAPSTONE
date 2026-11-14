"""Prescription Beanie ODM document models with Ed25519 signature fields.

Enforces:
- String UUIDs for boundary-safe identification.
- Immutable cryptographic audit fields (canonical_json, signature, doctor_public_key).
- Atomic single-use status tracking (issued -> dispensed).
"""

from datetime import datetime, timezone
from enum import Enum
from typing import List, Optional
import uuid

from beanie import Document
from pydantic import BaseModel, Field
from pymongo import ASCENDING, IndexModel


class PrescriptionStatus(str, Enum):
    ISSUED = "issued"
    DISPENSED = "dispensed"
    EXPIRED = "expired"


class PrescriptionItem(BaseModel):
    drug_name: str
    dose: str
    frequency: str
    duration: str
    instructions: Optional[str] = None


class Prescription(Document):
    # Boundary-safe string UUID
    prescription_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    consultation_id: Optional[str] = None
    patient_id: str
    patient_name: str
    doctor_id: str
    doctor_name: str
    doctor_registration_number: str
    doctor_public_key: str

    items: List[PrescriptionItem]
    notes: Optional[str] = None

    # Cryptographic integrity fields
    canonical_json: str
    signature: str
    qr_payload: str

    # Status & single-use dispense lifecycle
    status: PrescriptionStatus = PrescriptionStatus.ISSUED
    issued_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    expires_at: datetime
    dispensed_at: Optional[datetime] = None
    dispensed_by: Optional[str] = None          # Pharmacy User user_id
    dispensed_by_name: Optional[str] = None     # Pharmacy business name
    dispense_notes: Optional[str] = None

    class Settings:
        name = "prescriptions"
        indexes = [
            IndexModel([("prescription_id", ASCENDING)], unique=True),
            IndexModel([("patient_id", ASCENDING)]),
            IndexModel([("doctor_id", ASCENDING)]),
            IndexModel([("status", ASCENDING)]),
            IndexModel([("consultation_id", ASCENDING)]),
        ]
