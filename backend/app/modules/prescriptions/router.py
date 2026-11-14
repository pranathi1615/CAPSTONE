"""Prescription endpoints for digital signing, retrieval, QR code display, and single-use dispense."""

from typing import List, Optional
from fastapi import APIRouter, Depends, Query, Response, status

from app.core.dependencies import get_current_user, require_roles
from app.modules.identity.models import User, UserRole
from app.modules.prescriptions.crypto import generate_qr_png_bytes
from app.modules.prescriptions.schemas import (
    PrescriptionCreateRequest,
    PrescriptionDispenseRequest,
    PrescriptionDispenseResponse,
    PrescriptionResponse
)
from app.modules.prescriptions.service import (
    create_signed_prescription,
    dispense_prescription_atomic,
    get_prescription_by_id,
    list_prescriptions_for_patient
)

router = APIRouter(prefix="/prescriptions", tags=["prescriptions"])


@router.post("", response_model=PrescriptionResponse, status_code=status.HTTP_201_CREATED)
async def create_prescription_endpoint(
    data: PrescriptionCreateRequest,
    current_user: User = Depends(require_roles(UserRole.DOCTOR))
):
    """Doctor creates and digitally signs a new prescription with Ed25519."""
    return await create_signed_prescription(doctor=current_user, data=data)


@router.get("/{prescription_id}", response_model=PrescriptionResponse)
async def get_prescription_endpoint(
    prescription_id: str,
    current_user: User = Depends(get_current_user)
):
    """Fetch prescription details and verify Ed25519 signature."""
    return await get_prescription_by_id(prescription_id)


@router.get("/{prescription_id}/qr")
async def get_prescription_qr_endpoint(
    prescription_id: str,
    current_user: User = Depends(get_current_user)
):
    """Generate high-contrast QR code image (PNG) for pharmacy scanning."""
    prescription = await get_prescription_by_id(prescription_id)
    png_bytes = generate_qr_png_bytes(prescription.qr_payload)
    return Response(content=png_bytes, media_type="image/png")


@router.get("/patient/{patient_id}", response_model=List[PrescriptionResponse])
async def list_patient_prescriptions_endpoint(
    patient_id: str,
    current_user: User = Depends(get_current_user)
):
    """List all prescriptions issued for a specific patient."""
    return await list_prescriptions_for_patient(patient_id)


@router.post("/{prescription_id}/dispense", response_model=PrescriptionDispenseResponse)
async def dispense_prescription_endpoint(
    prescription_id: str,
    data: Optional[PrescriptionDispenseRequest] = None,
    current_user: User = Depends(require_roles(UserRole.PHARMACY, UserRole.ADMIN))
):
    """Atomic single-use dispense.

    Restricted to PHARMACY role. Fails with HTTP 409 if already dispensed.
    """
    notes = data.notes if data else None
    return await dispense_prescription_atomic(
        prescription_id=prescription_id,
        pharmacy_user=current_user,
        notes=notes
    )
