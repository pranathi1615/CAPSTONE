"""Service layer for clinical records management with FHIR R4 validation and optimistic concurrency."""

from datetime import datetime, timezone
import logging
from typing import Any, Dict, List, Optional
import uuid

from fastapi import HTTPException, status

from app.modules.audit.service import append_audit_log
from app.modules.clinical.models import ClinicalRecord, ClinicalRecordType
from app.modules.clinical.schemas import (
    ClinicalRecordCreate,
    ClinicalRecordResponse,
    ClinicalRecordUpdate,
    FHIRAllergyData,
    FHIRConditionData,
    FHIRObservationData
)
from app.modules.identity.models import User, UserRole

logger = logging.getLogger(__name__)


def validate_fhir_payload(record_type: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """Validate that clinical data conforms to the required FHIR R4 subset."""
    try:
        if record_type == ClinicalRecordType.CONDITION.value:
            validated = FHIRConditionData(**data)
            return validated.model_dump(exclude_none=True)
        elif record_type == ClinicalRecordType.OBSERVATION.value:
            validated = FHIRObservationData(**data)
            return validated.model_dump(exclude_none=True)
        elif record_type == ClinicalRecordType.ALLERGY.value:
            validated = FHIRAllergyData(**data)
            return validated.model_dump(exclude_none=True)
        else:
            return data
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid FHIR R4 data for type '{record_type}': {str(exc)}"
        )


def record_to_response(rec: ClinicalRecord) -> ClinicalRecordResponse:
    return ClinicalRecordResponse(
        record_id=rec.record_id,
        patient_id=rec.patient_id,
        doctor_id=rec.doctor_id,
        record_type=rec.record_type,
        data=rec.data,
        version=rec.version,
        client_id=rec.client_id,
        is_deleted=rec.is_deleted,
        created_at=rec.created_at,
        updated_at=rec.updated_at
    )


async def create_clinical_record(actor: User, req: ClinicalRecordCreate) -> ClinicalRecordResponse:
    """Create a new clinical record with FHIR validation and initial version 1."""
    # Enforce role permissions: patient, doctor, chw can create
    if actor.role not in [UserRole.PATIENT, UserRole.DOCTOR, UserRole.CHW, UserRole.ADMIN]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to create clinical records")

    validated_data = validate_fhir_payload(req.record_type.value, req.data)
    record_id = req.record_id or str(uuid.uuid4())
    client_id = req.client_id or str(uuid.uuid4())
    now = datetime.now(timezone.utc)

    # Check if record_id already exists (idempotency)
    existing = await ClinicalRecord.find_one(ClinicalRecord.record_id == record_id)
    if existing:
        return record_to_response(existing)

    doctor_id = actor.user_id if actor.role == UserRole.DOCTOR else None

    rec = ClinicalRecord(
        record_id=record_id,
        patient_id=req.patient_id,
        doctor_id=doctor_id,
        record_type=req.record_type.value,
        data=validated_data,
        version=1,
        client_id=client_id,
        is_deleted=False,
        client_timestamp=req.client_timestamp or now,
        created_at=now,
        updated_at=now
    )
    await rec.insert()

    await append_audit_log(
        event_type="CLINICAL_RECORD_CREATED",
        actor_id=actor.user_id,
        actor_role=actor.role.value,
        target_id=record_id,
        payload={"patient_id": req.patient_id, "record_type": req.record_type.value}
    )

    return record_to_response(rec)


async def get_clinical_records_for_patient(
    patient_id: str,
    record_type: Optional[str] = None,
    include_deleted: bool = False
) -> List[ClinicalRecordResponse]:
    """Retrieve all clinical records for a patient, ordered by created_at descending."""
    query = [ClinicalRecord.patient_id == patient_id]
    if not include_deleted:
        query.append(ClinicalRecord.is_deleted == False)
    if record_type:
        query.append(ClinicalRecord.record_type == record_type)

    records = await ClinicalRecord.find(*query).sort("-created_at").to_list()
    return [record_to_response(r) for r in records]


async def get_clinical_record_by_id(record_id: str) -> ClinicalRecordResponse:
    """Retrieve single clinical record by UUID."""
    rec = await ClinicalRecord.find_one(ClinicalRecord.record_id == record_id)
    if not rec or rec.is_deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clinical record not found")
    return record_to_response(rec)


async def update_clinical_record(
    record_id: str,
    actor: User,
    req: ClinicalRecordUpdate
) -> ClinicalRecordResponse:
    """Update clinical record with optimistic concurrency check.

    If req.version != existing.version, returns HTTP 409 CONFLICT.
    """
    rec = await ClinicalRecord.find_one(ClinicalRecord.record_id == record_id)
    if not rec or rec.is_deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clinical record not found")

    if rec.version != req.version:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"VERSION_CONFLICT: Record version on server is {rec.version}, but client submitted base version {req.version}"
        )

    validated_data = validate_fhir_payload(rec.record_type, req.data)
    now = datetime.now(timezone.utc)

    rec.data = validated_data
    rec.version += 1
    if req.client_id:
        rec.client_id = req.client_id
    rec.updated_at = now
    await rec.save()

    await append_audit_log(
        event_type="CLINICAL_RECORD_UPDATED",
        actor_id=actor.user_id,
        actor_role=actor.role.value,
        target_id=record_id,
        payload={"new_version": rec.version}
    )

    return record_to_response(rec)


async def soft_delete_clinical_record(record_id: str, actor: User) -> ClinicalRecordResponse:
    """Soft delete clinical record (mark is_deleted=True, increment version for sync tracking)."""
    rec = await ClinicalRecord.find_one(ClinicalRecord.record_id == record_id)
    if not rec:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clinical record not found")

    rec.is_deleted = True
    rec.version += 1
    rec.updated_at = datetime.now(timezone.utc)
    await rec.save()

    await append_audit_log(
        event_type="CLINICAL_RECORD_DELETED",
        actor_id=actor.user_id,
        actor_role=actor.role.value,
        target_id=record_id,
        payload={"new_version": rec.version}
    )

    return record_to_response(rec)
