"""REST API Router for Asynchronous Telemedicine Consultations."""

from typing import List
from fastapi import APIRouter, Depends, status

from app.core.dependencies import get_current_user, require_roles
from app.modules.async_consults.schemas import (
    AsyncConsultResponse,
    CreateAsyncConsultRequest,
    ReplyAsyncConsultRequest,
)
from app.modules.async_consults.service import (
    create_async_consult,
    get_async_consult_by_id,
    list_doctor_inbox,
    list_patient_consults,
    reply_async_consult,
)
from app.modules.identity.models import User, UserRole

router = APIRouter(prefix="/async-consults", tags=["Asynchronous Consultations"])


@router.post("", response_model=AsyncConsultResponse, status_code=status.HTTP_201_CREATED)
async def submit_async_consult_endpoint(
    data: CreateAsyncConsultRequest,
    current_user: User = Depends(get_current_user)
):
    """Submit an asynchronous consultation with symptoms, vitals, photos, and voice notes."""
    return await create_async_consult(data, current_user)


@router.get("/doctor/inbox", response_model=List[AsyncConsultResponse])
async def get_doctor_inbox_endpoint(doctor: User = Depends(require_roles(UserRole.DOCTOR))):
    """Doctor retrieves inbox of asynchronous consults with overdue highlighting."""
    return await list_doctor_inbox(doctor)


@router.get("/patient/my", response_model=List[AsyncConsultResponse])
async def get_patient_consults_endpoint(current_user: User = Depends(get_current_user)):
    """Patient retrieves submitted asynchronous consults."""
    return await list_patient_consults(current_user)


@router.get("/{consult_id}", response_model=AsyncConsultResponse)
async def get_consult_endpoint(
    consult_id: str,
    _: User = Depends(get_current_user)
):
    """Retrieve detailed asynchronous consult record."""
    return await get_async_consult_by_id(consult_id)


@router.post("/{consult_id}/reply", response_model=AsyncConsultResponse)
async def reply_consult_endpoint(
    consult_id: str,
    data: ReplyAsyncConsultRequest,
    doctor: User = Depends(require_roles(UserRole.DOCTOR))
):
    """Doctor replies to consult with notes/voice note and optional prescription."""
    return await reply_async_consult(consult_id, data, doctor)
