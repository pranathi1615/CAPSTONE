"""Consent service for granting, listing, and revoking telehealth consent.

Enforces rules:
- A patient can grant consent for themselves.
- A Community Health Worker (CHW) can record consent on behalf of a patient.
- Other roles cannot grant consent.
- All consent modifications are immutably logged to the audit chain.
"""

from datetime import datetime, timezone
import logging
from typing import List, Optional
from fastapi import HTTPException, status

from app.modules.audit.service import append_audit_log
from app.modules.consent.models import Consent
from app.modules.consent.schemas import ConsentGrantRequest, ConsentResponse
from app.modules.identity.models import User, UserRole

logger = logging.getLogger(__name__)


def consent_to_response(consent: Consent) -> ConsentResponse:
    """Map Consent Beanie document to ConsentResponse schema."""
    return ConsentResponse(
        consent_id=consent.consent_id,
        patient_id=consent.patient_id,
        purpose=consent.purpose,
        granted_by=consent.granted_by,
        granted_by_role=consent.granted_by_role,
        granted_at=consent.granted_at,
        revoked_at=consent.revoked_at,
        is_active=(consent.revoked_at is None)
    )


async def grant_consent(data: ConsentGrantRequest, actor: User) -> ConsentResponse:
    """Grant or record patient consent.

    Permissions:
    - Patient can only grant for their own user_id.
    - CHW can record consent on behalf of any patient.
    - Other roles are rejected with 403 Forbidden.
    """
    if actor.role == UserRole.PATIENT:
        if actor.user_id != data.patient_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Patients are only authorized to grant consent for their own account."
            )
    elif actor.role == UserRole.CHW:
        # Verify the target patient exists in MongoDB
        target_patient = await User.find_one(User.user_id == data.patient_id)
        if not target_patient or target_patient.role != UserRole.PATIENT:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Target patient does not exist."
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Role '{actor.role.value}' is not permitted to grant or record consent."
        )

    now = datetime.now(timezone.utc)
    consent = Consent(
        patient_id=data.patient_id,
        purpose=data.purpose,
        granted_by=actor.user_id,
        granted_by_role=actor.role.value,
        granted_at=now,
        revoked_at=None
    )
    await consent.insert()

    # Immutable audit trail
    await append_audit_log(
        event_type="CONSENT_GRANTED",
        actor_id=actor.user_id,
        actor_role=actor.role.value,
        target_id=data.patient_id,
        payload={
            "consent_id": consent.consent_id,
            "purpose": consent.purpose,
            "granted_by_role": consent.granted_by_role
        }
    )

    return consent_to_response(consent)


async def list_consents_for_patient(patient_id: str, actor: User) -> List[ConsentResponse]:
    """List all consents granted for a specific patient.

    Allowed: the patient themselves, CHW, Doctor, Admin.
    """
    if actor.role == UserRole.PATIENT and actor.user_id != patient_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot view consents belonging to another patient."
        )

    consents = await Consent.find(Consent.patient_id == patient_id).sort("-granted_at").to_list()
    return [consent_to_response(c) for c in consents]


async def revoke_consent(consent_id: str, actor: User) -> ConsentResponse:
    """Revoke an existing active consent.

    Allowed: the patient who owns it, the CHW who recorded it, or an Admin.
    """
    consent = await Consent.find_one(Consent.consent_id == consent_id)
    if not consent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Consent record not found."
        )

    if consent.revoked_at is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Consent has already been revoked."
        )

    # Permission check: patient owning the record, grantor CHW, or admin
    is_owner = (actor.role == UserRole.PATIENT and actor.user_id == consent.patient_id)
    is_grantor = (actor.user_id == consent.granted_by)
    is_admin = (actor.role == UserRole.ADMIN)

    if not (is_owner or is_grantor or is_admin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to revoke this consent."
        )

    now = datetime.now(timezone.utc)
    consent.revoked_at = now
    await consent.save()

    # Immutable audit trail
    await append_audit_log(
        event_type="CONSENT_REVOKED",
        actor_id=actor.user_id,
        actor_role=actor.role.value,
        target_id=consent.patient_id,
        payload={
            "consent_id": consent.consent_id,
            "purpose": consent.purpose,
            "revoked_at": now.isoformat()
        }
    )

    return consent_to_response(consent)
