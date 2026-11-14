"""Clinical record Beanie ODM document models representing FHIR R4 clinical subsets.

Supports:
- Condition (diagnoses, acute/chronic conditions)
- Observation (vitals: systolic, diastolic, pulse, temp, SpO2, weight)
- AllergyIntolerance (substance, criticality, manifestation)
- Optimistic versioning, soft deletion, and offline client IDs.
"""

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, Optional
import uuid

from beanie import Document
from pydantic import Field
from pymongo import ASCENDING, IndexModel


class ClinicalRecordType(str, Enum):
    CONDITION = "condition"
    OBSERVATION = "observation"
    ALLERGY = "allergy"


class ClinicalRecord(Document):
    # Boundary-safe string UUID
    record_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    patient_id: str
    doctor_id: Optional[str] = None
    record_type: str    # "condition", "observation", "allergy"
    data: Dict[str, Any]

    # Concurrency and offline sync metadata
    version: int = 1
    client_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    is_deleted: bool = False
    client_timestamp: Optional[datetime] = None

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "clinical_records"
        indexes = [
            IndexModel([("record_id", ASCENDING)], unique=True),
            IndexModel([("patient_id", ASCENDING), ("record_type", ASCENDING)]),
            IndexModel([("patient_id", ASCENDING), ("updated_at", ASCENDING)]),
            IndexModel([("client_id", ASCENDING)]),
        ]
