"""Service layer for Ed25519 signed digital prescriptions and atomic single-use dispensing."""

from datetime import datetime, timedelta, timezone
import json
import logging
from typing import List, Optional, Tuple
import uuid

from fastapi import HTTPException, status

from app.modules.audit.service import append_audit_log
from app.modules.identity.models import DoctorStatus, User, UserRole
from app.modules.prescriptions.crypto import (
    canonicalize_prescription_dict,
    compute_sha256_hash,
    generate_ed25519_keypair,
    sign_prescription_data,
    verify_prescription_signature
)
from app.modules.prescriptions.models import Prescription, PrescriptionItem, PrescriptionStatus
from app.modules.prescriptions.schemas import (
    PrescriptionCreateRequest,
    PrescriptionDispenseResponse,
    PrescriptionResponse
)

logger = logging.getLogger(__name__)


async def ensure_doctor_keys(doctor: User) -> Tuple[str, str]:
    """Ensure a doctor has an Ed25519 keypair for digital signing."""
    if doctor.signing_private_key and doctor.signing_public_key:
        return doctor.signing_private_key, doctor.signing_public_key

    priv_b64, pub_b64 = generate_ed25519_keypair()
    doctor.signing_private_key = priv_b64
    doctor.signing_public_key = pub_b64
    await doctor.save()
    logger.info("Generated new Ed25519 keypair for doctor %s (%s)", doctor.full_name, doctor.email)
    return priv_b64, pub_b64


async def create_signed_prescription(doctor: User, data: PrescriptionCreateRequest) -> PrescriptionResponse:
    """Create a tamper-proof digital prescription signed with the doctor's Ed25519 private key."""
    if doctor.role != UserRole.DOCTOR:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only doctors can create prescriptions")

    if doctor.doctor_status != DoctorStatus.APPROVED:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Doctor must be approved by medical administration before issuing prescriptions"
        )

    priv_key, pub_key = await ensure_doctor_keys(doctor)

    prescription_id = str(uuid.uuid4())
    issued_at = datetime.now(timezone.utc)
    expires_at = issued_at + timedelta(days=data.valid_days)

    items_models = [PrescriptionItem(**item.model_dump()) for item in data.items]

    # Canonical representation for digital signing
    canonical_dict = {
        "prescription_id": prescription_id,
        "patient_id": data.patient_id,
        "patient_name": data.patient_name.strip(),
        "doctor_id": doctor.user_id,
        "doctor_name": doctor.full_name,
        "doctor_registration_number": doctor.registration_number or "N/A",
        "items": [item.model_dump() for item in data.items],
        "issued_at": issued_at.isoformat(),
        "expires_at": expires_at.isoformat(),
    }
    canonical_str, canonical_bytes = canonicalize_prescription_dict(canonical_dict)
    signature = sign_prescription_data(priv_key, canonical_bytes)
    sha256_hash = compute_sha256_hash(canonical_bytes)

    qr_payload = json.dumps({
        "id": prescription_id,
        "doc": doctor.user_id,
        "sig": signature,
        "hash": sha256_hash
    }, separators=(",", ":"))

    prescription = Prescription(
        prescription_id=prescription_id,
        consultation_id=data.consultation_id,
        patient_id=data.patient_id,
        patient_name=data.patient_name.strip(),
        doctor_id=doctor.user_id,
        doctor_name=doctor.full_name,
        doctor_registration_number=doctor.registration_number or "N/A",
        doctor_public_key=pub_key,
        items=items_models,
        notes=data.notes.strip() if data.notes else None,
        canonical_json=canonical_str,
        signature=signature,
        qr_payload=qr_payload,
        status=PrescriptionStatus.ISSUED,
        issued_at=issued_at,
        expires_at=expires_at
    )
    await prescription.insert()

    # Append to tamper-evident audit log
    await append_audit_log(
        event_type="PRESCRIPTION_ISSUED",
        actor_id=doctor.user_id,
        actor_role=doctor.role.value,
        target_id=prescription_id,
        payload={
            "patient_id": data.patient_id,
            "drug_count": len(items_models),
            "sha256": sha256_hash
        }
    )

    return PrescriptionResponse(
        prescription_id=prescription.prescription_id,
        consultation_id=prescription.consultation_id,
        patient_id=prescription.patient_id,
        patient_name=prescription.patient_name,
        doctor_id=prescription.doctor_id,
        doctor_name=prescription.doctor_name,
        doctor_registration_number=prescription.doctor_registration_number,
        doctor_public_key=prescription.doctor_public_key,
        items=prescription.items,
        notes=prescription.notes,
        canonical_json=prescription.canonical_json,
        signature=prescription.signature,
        qr_payload=prescription.qr_payload,
        status=prescription.status,
        signature_valid=True,
        issued_at=prescription.issued_at,
        expires_at=prescription.expires_at,
        dispensed_at=prescription.dispensed_at,
        dispensed_by=prescription.dispensed_by,
        dispensed_by_name=prescription.dispensed_by_name
    )


async def get_prescription_by_id(prescription_id: str) -> PrescriptionResponse:
    """Fetch prescription and dynamically verify its Ed25519 signature."""
    prescription = await Prescription.find_one(Prescription.prescription_id == prescription_id)
    if not prescription:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prescription not found")

    is_valid = verify_prescription_signature(
        prescription.doctor_public_key,
        prescription.canonical_json.encode("utf-8"),
        prescription.signature
    )

    return PrescriptionResponse(
        prescription_id=prescription.prescription_id,
        consultation_id=prescription.consultation_id,
        patient_id=prescription.patient_id,
        patient_name=prescription.patient_name,
        doctor_id=prescription.doctor_id,
        doctor_name=prescription.doctor_name,
        doctor_registration_number=prescription.doctor_registration_number,
        doctor_public_key=prescription.doctor_public_key,
        items=prescription.items,
        notes=prescription.notes,
        canonical_json=prescription.canonical_json,
        signature=prescription.signature,
        qr_payload=prescription.qr_payload,
        status=prescription.status,
        signature_valid=is_valid,
        issued_at=prescription.issued_at,
        expires_at=prescription.expires_at,
        dispensed_at=prescription.dispensed_at,
        dispensed_by=prescription.dispensed_by,
        dispensed_by_name=prescription.dispensed_by_name
    )


async def list_prescriptions_for_patient(patient_id: str) -> List[PrescriptionResponse]:
    """List all prescriptions issued for a patient, ordered newest first."""
    docs = await Prescription.find(Prescription.patient_id == patient_id).sort("-issued_at").to_list()
    res = []
    for p in docs:
        is_valid = verify_prescription_signature(
            p.doctor_public_key,
            p.canonical_json.encode("utf-8"),
            p.signature
        )
        res.append(PrescriptionResponse(
            prescription_id=p.prescription_id,
            consultation_id=p.consultation_id,
            patient_id=p.patient_id,
            patient_name=p.patient_name,
            doctor_id=p.doctor_id,
            doctor_name=p.doctor_name,
            doctor_registration_number=p.doctor_registration_number,
            doctor_public_key=p.doctor_public_key,
            items=p.items,
            notes=p.notes,
            canonical_json=p.canonical_json,
            signature=p.signature,
            qr_payload=p.qr_payload,
            status=p.status,
            signature_valid=is_valid,
            issued_at=p.issued_at,
            expires_at=p.expires_at,
            dispensed_at=p.dispensed_at,
            dispensed_by=p.dispensed_by,
            dispensed_by_name=p.dispensed_by_name
        ))
    return res


async def dispense_prescription_atomic(
    prescription_id: str,
    pharmacy_user: User,
    notes: Optional[str] = None
) -> PrescriptionDispenseResponse:
    """Perform atomic single-use dispense on a prescription.

    Guarantees that a prescription can be dispensed EXACTLY ONCE.
    Uses conditional atomic MongoDB update on `status == "issued"`.
    Any subsequent or concurrent attempt will fail with HTTP 409 and
    show the exact timestamp and pharmacy where it was already dispensed.
    """
    if pharmacy_user.role not in [UserRole.PHARMACY, UserRole.ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only licensed pharmacies or admins can dispense prescriptions"
        )

    now = datetime.now(timezone.utc)
    collection = Prescription.get_motor_collection()

    # Conditional atomic update: must match status == 'issued'
    update_result = await collection.update_one(
        {
            "prescription_id": prescription_id,
            "status": PrescriptionStatus.ISSUED.value
        },
        {
            "$set": {
                "status": PrescriptionStatus.DISPENSED.value,
                "dispensed_at": now,
                "dispensed_by": pharmacy_user.user_id,
                "dispensed_by_name": pharmacy_user.full_name,
                "dispense_notes": notes
            }
        }
    )

    if update_result.modified_count == 0:
        # Atomic update failed - diagnose why to give clear feedback
        existing = await Prescription.find_one(Prescription.prescription_id == prescription_id)
        if not existing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Prescription '{prescription_id}' not found"
            )

        if existing.status == PrescriptionStatus.DISPENSED:
            dispensed_time = (
                existing.dispensed_at.strftime("%Y-%m-%d %H:%M:%S UTC")
                if existing.dispensed_at else "previously"
            )
            pharmacy_name = existing.dispensed_by_name or "another pharmacy"
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"ALREADY_DISPENSED: Prescription was already dispensed on {dispensed_time} at {pharmacy_name}."
            )
        elif existing.status == PrescriptionStatus.EXPIRED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"EXPIRED: Prescription expired on {existing.expires_at.strftime('%Y-%m-%d')}."
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Prescription cannot be dispensed (current status: {existing.status.value})"
            )

    # Append to audit log
    await append_audit_log(
        event_type="PRESCRIPTION_DISPENSED",
        actor_id=pharmacy_user.user_id,
        actor_role=pharmacy_user.role.value,
        target_id=prescription_id,
        payload={
            "dispensed_at": now.isoformat(),
            "pharmacy_name": pharmacy_user.full_name
        }
    )

    return PrescriptionDispenseResponse(
        success=True,
        prescription_id=prescription_id,
        status=PrescriptionStatus.DISPENSED,
        dispensed_at=now,
        dispensed_by_name=pharmacy_user.full_name,
        message="Prescription successfully dispensed and marked single-use complete."
    )
