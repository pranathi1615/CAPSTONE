"""Doctor Availability, Booking, Queue, and Consultation Lifecycle Service.

Enforces:
- Patients can only book APPROVED doctors; pending doctors cannot be booked.
- Database partial unique index on (doctor_id, slot_start) strictly prevents double booking.
- Arrival-ordered waiting queue with live second-by-second updates.
- Reminders and queue alerts dispatched via MOCK SMS provider.
"""

from datetime import datetime, timezone
import logging
from typing import List, Optional
from fastapi import HTTPException, status
import pymongo.errors

from app.modules.appointments.models import Booking, BookingStatus, DoctorSlot
from app.modules.appointments.schemas import (
    BookAppointmentRequest,
    BookingResponse,
    CreateSlotRequest,
    DoctorSlotResponse,
    QueueItemResponse,
)
from app.modules.audit.service import append_audit_log
from app.modules.chat.websocket_manager import ws_manager
from app.modules.identity.models import DoctorStatus, User, UserRole
from app.modules.notifications.service import MockSMSProvider

logger = logging.getLogger("carebridge.appointments")


def booking_to_response(b: Booking) -> BookingResponse:
    return BookingResponse(
        booking_id=b.booking_id,
        patient_id=b.patient_id,
        patient_name=b.patient_name,
        patient_phone=b.patient_phone,
        doctor_id=b.doctor_id,
        doctor_name=b.doctor_name,
        doctor_specialty=b.doctor_specialty,
        booked_by=b.booked_by,
        booked_by_role=b.booked_by_role,
        slot_start=b.slot_start,
        slot_end=b.slot_end,
        status=b.status,
        consultation_room_id=b.consultation_room_id,
        joined_waiting_at=b.joined_waiting_at,
        call_started_at=b.call_started_at,
        call_ended_at=b.call_ended_at,
        notes=b.notes,
        created_at=b.created_at,
    )


async def list_approved_doctors(specialty: Optional[str] = None) -> List[User]:
    """Retrieve only APPROVED doctors. Pending doctors cannot be booked."""
    query = [
        User.role == UserRole.DOCTOR,
        User.doctor_status == DoctorStatus.APPROVED,
    ]
    if specialty and specialty.strip() and specialty.strip().lower() != "all specialties":
        import re
        query.append({"specialty": {"$regex": f"^{re.escape(specialty.strip())}$", "$options": "i"}})
    return await User.find(*query).to_list()


async def create_doctor_slot(doctor: User, data: CreateSlotRequest) -> DoctorSlotResponse:
    """Doctor creates an available consultation slot."""
    if doctor.role != UserRole.DOCTOR:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only doctors can create slots.")

    if doctor.doctor_status != DoctorStatus.APPROVED:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your medical registration is pending approval. You cannot set availability slots yet."
        )

    slot = DoctorSlot(
        doctor_id=doctor.user_id,
        doctor_name=doctor.full_name,
        specialty=doctor.specialty,
        slot_start=data.slot_start,
        slot_end=data.slot_end,
        is_booked=False,
    )
    await slot.insert()
    return DoctorSlotResponse(
        slot_id=slot.slot_id,
        doctor_id=slot.doctor_id,
        doctor_name=slot.doctor_name,
        specialty=slot.specialty,
        slot_start=slot.slot_start,
        slot_end=slot.slot_end,
        is_booked=slot.is_booked,
    )


async def list_available_slots(doctor_id: str) -> List[DoctorSlotResponse]:
    """List unbooked availability slots for a doctor."""
    slots = await DoctorSlot.find(
        DoctorSlot.doctor_id == doctor_id,
        DoctorSlot.is_booked == False
    ).sort("+slot_start").to_list()
    return [
        DoctorSlotResponse(
            slot_id=s.slot_id,
            doctor_id=s.doctor_id,
            doctor_name=s.doctor_name,
            specialty=s.specialty,
            slot_start=s.slot_start,
            slot_end=s.slot_end,
            is_booked=s.is_booked,
        )
        for s in slots
    ]


async def book_appointment(data: BookAppointmentRequest, actor: User) -> BookingResponse:
    """Book a telehealth appointment.

    Enforces:
    - Doctor must exist and have APPROVED status (pending doctors cannot be booked).
    - Partial unique index on (doctor_id, slot_start) strictly prevents double-booking.
    - MOCK SMS reminder is logged and sent to patient.
    """
    # 1. Verify doctor status
    doctor = await User.find_one(User.user_id == data.doctor_id)
    if not doctor or doctor.role != UserRole.DOCTOR:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Doctor not found.")

    if doctor.doctor_status != DoctorStatus.APPROVED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Doctor is currently pending medical council verification and cannot be booked."
        )

    # 2. Determine target patient
    if actor.role == UserRole.PATIENT:
        patient = actor
    elif actor.role == UserRole.CHW:
        if not data.patient_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="patient_id is required when booking on behalf of a patient as a CHW."
            )
        patient = await User.find_one(User.user_id == data.patient_id)
        if not patient or patient.role != UserRole.PATIENT:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target patient not found.")
    else:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only patients or CHWs can book visits.")

    now = datetime.now(timezone.utc)
    booking = Booking(
        patient_id=patient.user_id,
        patient_name=patient.full_name,
        patient_phone=patient.phone,
        doctor_id=doctor.user_id,
        doctor_name=doctor.full_name,
        doctor_specialty=doctor.specialty,
        booked_by=actor.user_id,
        booked_by_role=actor.role.value,
        slot_start=data.slot_start,
        slot_end=data.slot_end,
        status=BookingStatus.BOOKED,
        created_at=now,
        updated_at=now,
    )

    try:
        await booking.insert()
    except pymongo.errors.DuplicateKeyError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This slot is already booked for this doctor. Please select another slot."
        )

    # Mark slot as booked if doctor defined explicit slot
    matching_slot = await DoctorSlot.find_one(
        DoctorSlot.doctor_id == doctor.user_id,
        DoctorSlot.slot_start == data.slot_start
    )
    if matching_slot:
        matching_slot.is_booked = True
        await matching_slot.save()

    # MOCK SMS Dispatch
    phone_to_notify = patient.phone or "+919800000000"
    sms_text = f"Your appointment with {doctor.full_name} is confirmed for {data.slot_start.strftime('%d %b %Y at %H:%M UTC')}."
    await MockSMSProvider.send_sms(
        recipient_phone=phone_to_notify,
        recipient_name=patient.full_name,
        message=sms_text,
        event_type="BOOKING_CONFIRMED"
    )

    # Append to audit chain
    await append_audit_log(
        event_type="APPOINTMENT_BOOKED",
        actor_id=actor.user_id,
        actor_role=actor.role.value,
        target_id=booking.booking_id,
        payload={
            "doctor_id": doctor.user_id,
            "patient_id": patient.user_id,
            "slot_start": data.slot_start.isoformat(),
            "consultation_room_id": booking.consultation_room_id
        }
    )

    return booking_to_response(booking)


async def list_user_bookings(user: User) -> List[BookingResponse]:
    """Retrieve appointments for the authenticated user (patient or doctor)."""
    if user.role == UserRole.PATIENT:
        bookings = await Booking.find(Booking.patient_id == user.user_id).sort("-slot_start").to_list()
    elif user.role == UserRole.DOCTOR:
        bookings = await Booking.find(Booking.doctor_id == user.user_id).sort("-slot_start").to_list()
    elif user.role in [UserRole.CHW, UserRole.ADMIN]:
        bookings = await Booking.find().sort("-slot_start").limit(100).to_list()
    else:
        bookings = []
    return [booking_to_response(b) for b in bookings]


async def join_waiting_room(booking_id: str, actor: User) -> BookingResponse:
    """Patient or CHW joins the live waiting room.

    Updates status to 'waiting', timestamps arrival, and broadcasts live queue update.
    """
    booking = await Booking.find_one(Booking.booking_id == booking_id)
    if not booking:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found.")

    if actor.role == UserRole.PATIENT and actor.user_id != booking.patient_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot join another patient's visit.")

    now = datetime.now(timezone.utc)
    booking.status = BookingStatus.WAITING
    booking.joined_waiting_at = now
    booking.updated_at = now
    await booking.save()

    # MOCK SMS Notification
    phone_to_notify = booking.patient_phone or "+919800000000"
    await MockSMSProvider.send_sms(
        recipient_phone=phone_to_notify,
        recipient_name=booking.patient_name,
        message=f"You have joined the waiting queue for Dr. {booking.doctor_name}. Please stay on this screen.",
        event_type="QUEUE_JOINED"
    )

    # Broadcast live queue update to doctor room
    await ws_manager.broadcast_envelope(
        room=f"doctor_queue_{booking.doctor_id}",
        msg_type="queue_update",
        payload={
            "booking_id": booking.booking_id,
            "patient_name": booking.patient_name,
            "status": "waiting",
            "joined_waiting_at": now.isoformat()
        }
    )

    return booking_to_response(booking)


async def get_live_doctor_queue(doctor_user_id: str) -> List[QueueItemResponse]:
    """Retrieve doctor's waiting queue, strictly ordered by arrival timestamp."""
    active_bookings = await Booking.find(
        Booking.doctor_id == doctor_user_id,
        Booking.status == BookingStatus.WAITING
    ).sort("+joined_waiting_at").to_list()

    now = datetime.now(timezone.utc)
    queue = []
    for b in active_bookings:
        wait_sec = 0
        if b.joined_waiting_at:
            tz_joined = b.joined_waiting_at if b.joined_waiting_at.tzinfo else b.joined_waiting_at.replace(tzinfo=timezone.utc)
            wait_sec = max(0, int((now - tz_joined).total_seconds()))

        queue.append(
            QueueItemResponse(
                booking_id=b.booking_id,
                consultation_room_id=b.consultation_room_id,
                patient_id=b.patient_id,
                patient_name=b.patient_name,
                status=b.status,
                joined_waiting_at=b.joined_waiting_at,
                slot_start=b.slot_start,
                wait_seconds=wait_sec
            )
        )
    return queue


async def start_consultation_call(booking_id: str, doctor: User) -> BookingResponse:
    """Doctor clicks 'Call' to initiate WebRTC consultation."""
    booking = await Booking.find_one(Booking.booking_id == booking_id)
    if not booking or booking.doctor_id != doctor.user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found for this doctor.")

    now = datetime.now(timezone.utc)
    booking.status = BookingStatus.IN_CALL
    booking.call_started_at = now
    booking.updated_at = now
    await booking.save()

    # Broadcast to consultation room so patient browser transitions to call
    await ws_manager.broadcast_envelope(
        room=booking.consultation_room_id,
        msg_type="call_started",
        payload={
            "booking_id": booking.booking_id,
            "doctor_name": doctor.full_name,
            "consultation_room_id": booking.consultation_room_id
        }
    )

    return booking_to_response(booking)


async def complete_consultation_call(booking_id: str, doctor: User, notes: str = "") -> BookingResponse:
    """Doctor marks the visit completed and saves notes."""
    booking = await Booking.find_one(Booking.booking_id == booking_id)
    if not booking or booking.doctor_id != doctor.user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found for this doctor.")

    now = datetime.now(timezone.utc)
    booking.status = BookingStatus.COMPLETED
    booking.call_ended_at = now
    booking.notes = notes
    booking.updated_at = now
    await booking.save()

    # Notify consultation room
    await ws_manager.broadcast_envelope(
        room=booking.consultation_room_id,
        msg_type="call_ended",
        payload={
            "booking_id": booking.booking_id,
            "status": "completed",
            "notes": notes
        }
    )

    call_start = booking.call_started_at or now
    if call_start.tzinfo is None:
        call_start = call_start.replace(tzinfo=timezone.utc)
    duration_sec = max(0, int((now - call_start).total_seconds()))

    # Append to audit log
    await append_audit_log(
        event_type="CONSULTATION_COMPLETED",
        actor_id=doctor.user_id,
        actor_role=doctor.role.value,
        target_id=booking.booking_id,
        payload={
            "patient_id": booking.patient_id,
            "duration_seconds": duration_sec
        }
    )

    return booking_to_response(booking)


async def cancel_booking(booking_id: str, actor: User) -> BookingResponse:
    """Cancel booking. Deactivates active unique index filter, freeing up slot."""
    booking = await Booking.find_one(Booking.booking_id == booking_id)
    if not booking:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found.")

    is_patient = (actor.role == UserRole.PATIENT and actor.user_id == booking.patient_id)
    is_doctor = (actor.role == UserRole.DOCTOR and actor.user_id == booking.doctor_id)
    is_admin = (actor.role == UserRole.ADMIN)

    if not (is_patient or is_doctor or is_admin):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to cancel this booking.")

    now = datetime.now(timezone.utc)
    booking.status = BookingStatus.CANCELLED
    booking.updated_at = now
    await booking.save()

    return booking_to_response(booking)
