"""Doctor Availability and Patient Booking Models using Beanie ODM.

Enforces:
- Booking status: booked, waiting, in_call, completed, cancelled, no_show.
- Partial unique index on (doctor_id, slot_start) for active statuses only
  preventing double-booking while permitting re-booking cancelled slots.
- Consultation room UUID for WebRTC signalling and chat isolation.
"""

from datetime import datetime, timezone
from enum import Enum
from typing import Optional
import uuid

from beanie import Document
from pydantic import Field
from pymongo import ASCENDING, IndexModel


class BookingStatus(str, Enum):
    BOOKED = "booked"
    WAITING = "waiting"
    IN_CALL = "in_call"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    NO_SHOW = "no_show"


class DoctorSlot(Document):
    """Doctor availability time slots."""
    slot_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    doctor_id: str
    doctor_name: str
    specialty: Optional[str] = None
    slot_start: datetime
    slot_end: datetime
    is_booked: bool = False

    class Settings:
        name = "doctor_slots"
        indexes = [
            IndexModel([("slot_id", ASCENDING)], unique=True),
            IndexModel([("doctor_id", ASCENDING), ("slot_start", ASCENDING)]),
            IndexModel([("is_booked", ASCENDING), ("slot_start", ASCENDING)]),
        ]


class Booking(Document):
    """Patient consultation appointment booking."""
    booking_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
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
    status: BookingStatus = BookingStatus.BOOKED
    consultation_room_id: str = Field(default_factory=lambda: str(uuid.uuid4()))

    # Queue ordering by arrival timestamp
    joined_waiting_at: Optional[datetime] = None
    call_started_at: Optional[datetime] = None
    call_ended_at: Optional[datetime] = None
    notes: Optional[str] = None

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "bookings"
        indexes = [
            IndexModel([("booking_id", ASCENDING)], unique=True),
            # Mandatory partial unique index: strictly prevents double booking for active visits
            IndexModel(
                [("doctor_id", ASCENDING), ("slot_start", ASCENDING)],
                unique=True,
                partialFilterExpression={
                    "status": {"$in": ["booked", "waiting", "in_call"]}
                }
            ),
            IndexModel([("consultation_room_id", ASCENDING)], unique=True),
            IndexModel([("patient_id", ASCENDING), ("status", ASCENDING)]),
            IndexModel([("doctor_id", ASCENDING), ("status", ASCENDING), ("joined_waiting_at", ASCENDING)]),
        ]
