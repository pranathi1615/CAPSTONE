"""Pydantic schemas for Doctor Slots, Appointments, and Queue Management."""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field
from app.modules.appointments.models import BookingStatus


class CreateSlotRequest(BaseModel):
    slot_start: datetime
    slot_end: datetime


class DoctorSlotResponse(BaseModel):
    slot_id: str
    doctor_id: str
    doctor_name: str
    specialty: Optional[str] = None
    slot_start: datetime
    slot_end: datetime
    is_booked: bool


class BookAppointmentRequest(BaseModel):
    doctor_id: str
    patient_id: Optional[str] = None  # Optional if patient books for self; required if CHW books
    slot_start: datetime
    slot_end: datetime


class BookingResponse(BaseModel):
    booking_id: str
    patient_id: str
    patient_name: str
    patient_phone: Optional[str] = None
    doctor_id: str
    doctor_name: str
    doctor_specialty: Optional[str] = None
    booked_by: str
    booked_by_role: str
    slot_start: datetime
    slot_end: datetime
    status: BookingStatus
    consultation_room_id: str
    joined_waiting_at: Optional[datetime] = None
    call_started_at: Optional[datetime] = None
    call_ended_at: Optional[datetime] = None
    notes: Optional[str] = None
    created_at: datetime


class QueueItemResponse(BaseModel):
    booking_id: str
    consultation_room_id: str
    patient_id: str
    patient_name: str
    status: BookingStatus
    joined_waiting_at: Optional[datetime]
    slot_start: datetime
    wait_seconds: int = 0


class CompleteConsultationRequest(BaseModel):
    notes: Optional[str] = Field(default="", description="Clinical notes recorded by doctor")
