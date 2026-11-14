"""Pydantic schemas for Identity and Authentication."""

from datetime import datetime
import re
from typing import Optional
from pydantic import BaseModel, Field, field_validator, model_validator
from app.modules.identity.models import DoctorStatus, UserRole

EMAIL_REGEX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class RegisterRequest(BaseModel):
    email: str = Field(..., description="User email address")
    password: str = Field(..., min_length=6, description="Password must be at least 6 characters")
    full_name: str = Field(..., min_length=2)
    role: UserRole
    phone: Optional[str] = None
    registration_number: Optional[str] = Field(None, description="Mandatory for doctors (e.g., Medical Council Registration)")
    specialty: Optional[str] = None

    @field_validator("email")
    @classmethod
    def validate_email_pattern(cls, v: str) -> str:
        clean = v.strip().lower()
        if not EMAIL_REGEX.match(clean):
            raise ValueError("Invalid email address format.")
        return clean

    @model_validator(mode="after")
    def validate_doctor_registration(self):
        if self.role == UserRole.DOCTOR and not self.registration_number:
            raise ValueError("Registration number is mandatory for doctor accounts.")
        return self


class LoginRequest(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def validate_email_pattern(cls, v: str) -> str:
        clean = v.strip().lower()
        if not EMAIL_REGEX.match(clean):
            raise ValueError("Invalid email address format.")
        return clean


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class UserResponse(BaseModel):
    user_id: str
    email: str
    full_name: str
    role: UserRole
    phone: Optional[str] = None
    is_active: bool
    registration_number: Optional[str] = None
    specialty: Optional[str] = None
    doctor_status: Optional[DoctorStatus] = None
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserResponse


class DoctorApprovalAction(BaseModel):
    approved: bool = True
    rejection_reason: Optional[str] = None
