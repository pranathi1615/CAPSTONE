"""Identity models using Beanie (Async ODM on MongoDB).

Defines User document with role-based attributes and unique indexes.
String UUID is used for boundary-crossing user_id to avoid exposing raw ObjectIds.
"""

from datetime import datetime, timezone
from enum import Enum
from typing import Optional
import uuid

from beanie import Document
from pydantic import Field
from pymongo import ASCENDING, IndexModel


class UserRole(str, Enum):
    PATIENT = "patient"
    DOCTOR = "doctor"
    CHW = "chw"
    PHARMACY = "pharmacy"
    ADMIN = "admin"


class DoctorStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class User(Document):
    # Boundary-safe string UUID
    user_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: str
    hashed_password: str
    full_name: str
    role: UserRole
    phone: Optional[str] = None
    is_active: bool = True

    # Doctor-specific verification fields
    # Notice: per Phase 1 rule 4, a doctor registers with a registration number
    # and starts in 'pending' status; only an admin can approve.
    registration_number: Optional[str] = None
    specialty: Optional[str] = None
    doctor_status: Optional[DoctorStatus] = None

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "users"
        indexes = [
            IndexModel([("email", ASCENDING)], unique=True),
            IndexModel([("user_id", ASCENDING)], unique=True),
            IndexModel([("role", ASCENDING)]),
            IndexModel([("doctor_status", ASCENDING)]),
        ]
