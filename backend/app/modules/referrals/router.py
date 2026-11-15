"""REST API Router for Clinical Referral Notes and PDF Generation (Phase 6)."""

from typing import List
from fastapi import APIRouter, Depends, Response, status

from app.core.dependencies import get_current_user, require_roles
from app.modules.identity.models import User, UserRole
from app.modules.referrals.models import ReferralNote
from app.modules.referrals.schemas import CreateReferralRequest, ReferralResponse
from app.modules.referrals.service import (
    create_referral_note,
    generate_referral_pdf,
    referral_to_response,
)

router = APIRouter(prefix="/referrals", tags=["Clinical Referral Notes"])


@router.post("/generate", response_model=ReferralResponse, status_code=status.HTTP_201_CREATED)
async def generate_referral_endpoint(
    data: CreateReferralRequest,
    current_user: User = Depends(require_roles(UserRole.DOCTOR, UserRole.CHW, UserRole.ADMIN))
):
    """CHW or Doctor generates a clinical referral note to a suitable hospital."""
    return await create_referral_note(data, current_user)


@router.get("/{referral_id}/pdf")
async def download_referral_pdf_endpoint(
    referral_id: str,
    _: User = Depends(get_current_user)
):
    """Download generated clinical referral note as a PDF document."""
    referral = await ReferralNote.find_one(ReferralNote.referral_id == referral_id)
    if not referral:
        from fastapi import HTTPException
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Referral note not found.")

    pdf_bytes = generate_referral_pdf(referral)
    filename = f"CareBridge_Referral_{referral.patient_name.replace(' ', '_')}_{referral.referral_id[:8]}.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=\"{filename}\""}
    )


@router.get("/patient/{patient_id}", response_model=List[ReferralResponse])
async def get_patient_referrals_endpoint(
    patient_id: str,
    _: User = Depends(get_current_user)
):
    """Retrieve historical referral notes for a patient."""
    notes = await ReferralNote.find(ReferralNote.patient_id == patient_id).sort("-created_at").to_list()
    return [referral_to_response(n) for n in notes]
