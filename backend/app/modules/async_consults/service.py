"""Service layer for Asynchronous Telemedicine Consultations (Phase 6)."""

from datetime import datetime, timedelta, timezone
import logging
from typing import List, Optional
from fastapi import HTTPException, status

from app.modules.async_consults.models import AsyncConsult, AsyncConsultStatus
from app.modules.async_consults.schemas import (
    AsyncConsultResponse,
    CreateAsyncConsultRequest,
    ReplyAsyncConsultRequest,
)
from app.modules.audit.service import append_audit_log
from app.modules.chat.websocket_manager import ws_manager
from app.modules.identity.models import User, UserRole
from app.modules.notifications.service import MockSMSProvider

logger = logging.getLogger("carebridge.async_consults")


def consult_to_response(c: AsyncConsult) -> AsyncConsultResponse:
    return AsyncConsultResponse(
        consult_id=c.consult_id,
        patient_id=c.patient_id,
        patient_name=c.patient_name,
        patient_phone=c.patient_phone,
        submitted_by=c.submitted_by,
        submitted_by_role=c.submitted_by_role,
        assigned_doctor_id=c.assigned_doctor_id,
        doctor_name=c.doctor_name,
        specialty=c.specialty,
        urgency=c.urgency,
        symptoms=c.symptoms,
        symptom_text=c.symptom_text,
        vitals=c.vitals,
        photos=c.photos,
        voice_notes=c.voice_notes,
        status=c.status,
        response_window_hours=c.response_window_hours,
        deadline_at=c.deadline_at,
        is_overdue=c.is_overdue,
        doctor_reply_text=c.doctor_reply_text,
        doctor_reply_voice_note_url=c.doctor_reply_voice_note_url,
        prescription_id=c.prescription_id,
        replied_at=c.replied_at,
        replied_by=c.replied_by,
        replied_by_name=c.replied_by_name,
        created_at=c.created_at,
        updated_at=c.updated_at,
    )


async def create_async_consult(data: CreateAsyncConsultRequest, actor: User) -> AsyncConsultResponse:
    now = datetime.now(timezone.utc)
    target_patient_id = data.patient_id or actor.user_id
    patient_name = data.patient_name
    patient_phone = data.patient_phone

    if not patient_name or not patient_phone:
        patient = await User.find_one(User.user_id == target_patient_id)
        if patient:
            patient_name = patient_name or patient.full_name
            patient_phone = patient_phone or patient.phone

    doctor_name = None
    if data.assigned_doctor_id:
        doc = await User.find_one(User.user_id == data.assigned_doctor_id)
        if doc:
            doctor_name = doc.full_name

    window_hours = data.response_window_hours or 24
    deadline = now + timedelta(hours=window_hours)

    consult = AsyncConsult(
        patient_id=target_patient_id,
        patient_name=patient_name or "Anonymous Patient",
        patient_phone=patient_phone,
        submitted_by=actor.user_id,
        submitted_by_role=actor.role.value,
        assigned_doctor_id=data.assigned_doctor_id,
        doctor_name=doctor_name,
        specialty=data.specialty,
        urgency=data.urgency or "soon",
        symptoms=data.symptoms,
        symptom_text=data.symptom_text,
        vitals=data.vitals,
        photos=data.photos,
        voice_notes=data.voice_notes,
        status=AsyncConsultStatus.SUBMITTED,
        response_window_hours=window_hours,
        deadline_at=deadline,
        created_at=now,
        updated_at=now
    )
    await consult.insert()

    # Append audit trail
    await append_audit_log(
        event_type="ASYNC_CONSULT_SUBMITTED",
        actor_id=actor.user_id,
        actor_role=actor.role.value,
        target_id=consult.consult_id,
        payload={
            "patient_id": consult.patient_id,
            "specialty": consult.specialty,
            "urgency": consult.urgency,
            "deadline_at": consult.deadline_at.isoformat(),
        }
    )

    # Notify doctor(s)
    await ws_manager.broadcast_to_role(
        role="doctor",
        message_type="async_consult_new",
        payload={
            "consult_id": consult.consult_id,
            "patient_name": consult.patient_name,
            "specialty": consult.specialty,
            "urgency": consult.urgency,
            "deadline_at": consult.deadline_at.isoformat(),
        }
    )

    return consult_to_response(consult)


async def list_doctor_inbox(doctor: User) -> List[AsyncConsultResponse]:
    """Retrieve async consults for doctor with overdue status & priority sorting."""
    # Match consults assigned directly to doctor, or unassigned matching doctor's specialty
    query = [
        {"$or": [
            {"assigned_doctor_id": doctor.user_id},
            {"assigned_doctor_id": None, "specialty": doctor.specialty},
            {"assigned_doctor_id": None, "specialty": "General Medicine"},
        ]}
    ]
    consults = await AsyncConsult.find(*query).sort("+deadline_at").to_list()

    # Sort: Overdue unreplied items first, then urgency, then earliest deadline
    URGENCY_RANK = {"emergency": 4, "urgent": 3, "soon": 2, "routine": 1}

    def inbox_sort_key(c: AsyncConsult):
        is_over = 1 if c.is_overdue else 0
        urg = URGENCY_RANK.get(c.urgency, 1)
        dead = c.deadline_at if c.deadline_at.tzinfo else c.deadline_at.replace(tzinfo=timezone.utc)
        return (-is_over, -urg, dead)

    sorted_consults = sorted(consults, key=inbox_sort_key)
    return [consult_to_response(c) for c in sorted_consults]


async def list_patient_consults(patient: User) -> List[AsyncConsultResponse]:
    consults = await AsyncConsult.find(AsyncConsult.patient_id == patient.user_id).sort("-created_at").to_list()
    return [consult_to_response(c) for c in consults]


async def get_async_consult_by_id(consult_id: str) -> AsyncConsultResponse:
    consult = await AsyncConsult.find_one(AsyncConsult.consult_id == consult_id)
    if not consult:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Async consult not found.")
    return consult_to_response(consult)


async def reply_async_consult(
    consult_id: str,
    data: ReplyAsyncConsultRequest,
    doctor: User
) -> AsyncConsultResponse:
    consult = await AsyncConsult.find_one(AsyncConsult.consult_id == consult_id)
    if not consult:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Async consult not found.")

    if not data.reply_text and not data.voice_note_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Doctor reply must contain either text notes or a voice note."
        )

    now = datetime.now(timezone.utc)
    consult.status = AsyncConsultStatus.REPLIED
    consult.doctor_reply_text = data.reply_text
    consult.doctor_reply_voice_note_url = data.voice_note_url
    consult.prescription_id = data.prescription_id
    consult.replied_at = now
    consult.replied_by = doctor.user_id
    consult.replied_by_name = doctor.full_name
    consult.updated_at = now
    await consult.save()

    # Audit trail
    await append_audit_log(
        event_type="ASYNC_CONSULT_REPLIED",
        actor_id=doctor.user_id,
        actor_role=doctor.role.value,
        target_id=consult.consult_id,
        payload={
            "patient_id": consult.patient_id,
            "has_prescription": bool(data.prescription_id),
            "replied_at": now.isoformat()
        }
    )

    # In-app WebSocket notification to patient
    await ws_manager.broadcast_envelope(
        room=f"patient_{consult.patient_id}",
        msg_type="async_consult_reply",
        payload={
            "consult_id": consult.consult_id,
            "doctor_name": doctor.full_name,
            "reply_text": data.reply_text,
            "prescription_id": data.prescription_id,
            "replied_at": now.isoformat()
        }
    )

    # MOCK SMS Notification
    if consult.patient_phone:
        sms_text = f"Dr. {doctor.full_name} has replied to your consult on CareBridge. Log in to review clinical advice and prescriptions."
        await MockSMSProvider.send_sms(
            recipient_phone=consult.patient_phone,
            recipient_name=consult.patient_name,
            message=sms_text,
            event_type="ASYNC_CONSULT_REPLY_SMS"
        )

    return consult_to_response(consult)
