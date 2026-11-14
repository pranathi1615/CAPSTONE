"""Consent management API router."""

from typing import List
from fastapi import APIRouter, Depends, status

from app.core.dependencies import get_current_user
from app.modules.consent.schemas import ConsentGrantRequest, ConsentResponse
from app.modules.consent.service import (
    grant_consent,
    list_consents_for_patient,
    revoke_consent
)
from app.modules.identity.models import User

router = APIRouter(prefix="/consents", tags=["Consent Management"])


@router.post(
    "",
    response_model=ConsentResponse,
    status_code=status.HTTP_201_CREATED
)
async def grant_consent_endpoint(
    data: ConsentGrantRequest,
    current_user: User = Depends(get_current_user)
):
    """Grant telehealth consent. Patient grants for self; CHW records on behalf of patient."""
    return await grant_consent(data, current_user)


@router.get(
    "/patient/{patient_id}",
    response_model=List[ConsentResponse]
)
async def list_patient_consents_endpoint(
    patient_id: str,
    current_user: User = Depends(get_current_user)
):
    """Retrieve all consents for a specific patient."""
    return await list_consents_for_patient(patient_id, current_user)


@router.post(
    "/{consent_id}/revoke",
    response_model=ConsentResponse
)
async def revoke_consent_endpoint(
    consent_id: str,
    current_user: User = Depends(get_current_user)
):
    """Revoke an active consent record."""
    return await revoke_consent(consent_id, current_user)
