"""Appointments, Queue, and Consultation REST Router."""

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Query, status

from app.core.config import settings
from app.core.dependencies import get_current_user, require_roles
from app.modules.appointments.models import BookingStatus
from app.modules.appointments.schemas import (
    BookAppointmentRequest,
    BookingResponse,
    CompleteConsultationRequest,
    CreateRecurringSlotsRequest,
    CreateSlotRequest,
    DoctorSlotResponse,
    QueueItemResponse,
)
from app.modules.appointments.service import (
    book_appointment,
    booking_to_response,
    cancel_booking,
    complete_consultation_call,
    create_doctor_slot,
    create_recurring_doctor_slots,
    get_live_doctor_queue,
    join_waiting_room,
    list_approved_doctors,
    list_available_slots,
    list_user_bookings,
    start_consultation_call,
)
from app.modules.chat.models import ChatMessage
from app.modules.identity.models import User, UserRole

router = APIRouter(prefix="/appointments", tags=["Appointments & Consultations"])


@router.get("/doctors", response_model=List[Dict[str, Any]])
async def get_doctors_endpoint(
    specialty: Optional[str] = Query(None),
    _: User = Depends(get_current_user)
):
    """Retrieve only APPROVED doctors eligible for booking."""
    doctors = await list_approved_doctors(specialty=specialty)
    return [
        {
            "user_id": d.user_id,
            "full_name": d.full_name,
            "email": d.email,
            "specialty": d.specialty,
            "registration_number": d.registration_number,
            "doctor_status": d.doctor_status.value if d.doctor_status else None
        }
        for d in doctors
    ]


@router.post("/slots", response_model=DoctorSlotResponse, status_code=status.HTTP_201_CREATED)
async def create_slot_endpoint(
    data: CreateSlotRequest,
    doctor: User = Depends(require_roles(UserRole.DOCTOR))
):
    """Doctor creates an available consultation time slot."""
    return await create_doctor_slot(doctor, data)


@router.post("/slots/recurring", response_model=List[DoctorSlotResponse], status_code=status.HTTP_201_CREATED)
async def create_recurring_slots_endpoint(
    data: CreateRecurringSlotsRequest,
    doctor: User = Depends(require_roles(UserRole.DOCTOR))
):
    """Doctor defines weekly recurring consulting hours (e.g. Mon-Fri 09:00-13:00 for N weeks)."""
    return await create_recurring_doctor_slots(doctor, data)


@router.get("/slots", response_model=List[DoctorSlotResponse])
async def get_slots_endpoint(
    doctor_id: str = Query(...),
    _: User = Depends(get_current_user)
):
    """Get available unbooked slots for an approved doctor."""
    return await list_available_slots(doctor_id)


@router.post("/book", response_model=BookingResponse, status_code=status.HTTP_201_CREATED)
async def book_appointment_endpoint(
    data: BookAppointmentRequest,
    current_user: User = Depends(get_current_user)
):
    """Book a telehealth appointment with double-booking prevention and MOCK SMS reminder."""
    return await book_appointment(data, current_user)


@router.get("/my", response_model=List[BookingResponse])
async def get_my_bookings_endpoint(current_user: User = Depends(get_current_user)):
    """List appointments for the current user."""
    return await list_user_bookings(current_user)


@router.post("/{booking_id}/join", response_model=BookingResponse)
async def join_queue_endpoint(
    booking_id: str,
    current_user: User = Depends(get_current_user)
):
    """Patient taps Join: enters waiting queue and updates live doctor queue."""
    return await join_waiting_room(booking_id, current_user)


@router.get("/queue", response_model=List[QueueItemResponse])
async def get_queue_endpoint(doctor: User = Depends(require_roles(UserRole.DOCTOR))):
    """Doctor views live waiting queue, ordered strictly by arrival timestamp."""
    return await get_live_doctor_queue(doctor.user_id)


@router.post("/{booking_id}/call", response_model=BookingResponse)
async def start_call_endpoint(
    booking_id: str,
    doctor: User = Depends(require_roles(UserRole.DOCTOR))
):
    """Doctor taps Call to initiate WebRTC consultation."""
    return await start_consultation_call(booking_id, doctor)


@router.post("/{booking_id}/complete", response_model=BookingResponse)
async def complete_call_endpoint(
    booking_id: str,
    data: CompleteConsultationRequest,
    doctor: User = Depends(require_roles(UserRole.DOCTOR))
):
    """Doctor marks visit completed and submits consultation notes."""
    return await complete_consultation_call(booking_id, doctor, data.notes or "")


@router.post("/{booking_id}/cancel", response_model=BookingResponse)
async def cancel_booking_endpoint(
    booking_id: str,
    current_user: User = Depends(get_current_user)
):
    """Cancel booking and free up the doctor's time slot."""
    return await cancel_booking(booking_id, current_user)


@router.get("/config/ice-servers")
async def get_ice_servers_endpoint(_: User = Depends(get_current_user)):
    """Retrieve STUN and Coturn TURN ICE server configurations for WebRTC."""
    ice_servers = [
        {"urls": settings.STUN_SERVER_URL}
    ]
    if settings.TURN_SERVER_URL and settings.TURN_USERNAME:
        ice_servers.append({
            "urls": settings.TURN_SERVER_URL,
            "username": settings.TURN_USERNAME,
            "credential": settings.TURN_PASSWORD
        })
    return {"iceServers": ice_servers}


@router.get("/consultations/{room_id}/messages", response_model=List[Dict[str, Any]])
async def get_room_messages_endpoint(
    room_id: str,
    _: User = Depends(get_current_user)
):
    """Retrieve chat history for a consultation room, reloaded on rejoin."""
    messages = await ChatMessage.find(
        ChatMessage.room == room_id
    ).sort("+sequence").to_list()
    return [
        {
            "message_id": m.message_id,
            "room": m.room,
            "sequence": m.sequence,
            "sender_id": m.sender_id,
            "sender_name": m.sender_name,
            "sender_role": m.sender_role,
            "content": m.content,
            "timestamp": m.timestamp.isoformat()
        }
        for m in messages
    ]
