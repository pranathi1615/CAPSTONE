"""Pydantic schemas for Follow-up Planning."""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field
from app.modules.followups.models import FollowUpStatus


class CreateFollowUpRequest(BaseModel):
    booking_id: Optional[str] = None
    patient_id: str
    due_date: datetime
    reason: str = Field(..., min_length=2)
    chw_id: Optional[str] = None


class FollowUpResponse(BaseModel):
    followup_id: str
    booking_id: Optional[str] = None
    patient_id: str
    patient_name: str
    patient_phone: Optional[str] = None
    doctor_id: str
    doctor_name: str
    due_date: datetime
    reason: str
    status: FollowUpStatus
    chw_id: Optional[str] = None
    reminder_sent_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: datetime


class ProcessRemindersRequest(BaseModel):
    current_time: Optional[datetime] = None  # Injectable clock for scheduler and test verification


class ProcessRemindersResult(BaseModel):
    reminded_count: int
    missed_count: int
    processed_at: datetime
