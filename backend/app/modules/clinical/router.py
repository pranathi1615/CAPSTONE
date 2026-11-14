"""Clinical records REST endpoints."""

from typing import List, Optional
from fastapi import APIRouter, Depends, Query, status

from app.core.dependencies import get_current_user
from app.modules.clinical.schemas import (
    ClinicalRecordCreate,
    ClinicalRecordResponse,
    ClinicalRecordUpdate
)
from app.modules.clinical.service import (
    create_clinical_record,
    get_clinical_record_by_id,
    get_clinical_records_for_patient,
    soft_delete_clinical_record,
    update_clinical_record
)
from app.modules.identity.models import User

router = APIRouter(prefix="/clinical/records", tags=["clinical"])


@router.post("", response_model=ClinicalRecordResponse, status_code=status.HTTP_201_CREATED)
async def create_record_endpoint(
    req: ClinicalRecordCreate,
    current_user: User = Depends(get_current_user)
):
    """Create a new clinical record with FHIR validation."""
    return await create_clinical_record(actor=current_user, req=req)


@router.get("", response_model=List[ClinicalRecordResponse])
async def list_records_endpoint(
    patient_id: str = Query(..., description="Target patient UUID"),
    record_type: Optional[str] = Query(None, description="Optional filter by record type (condition, observation, allergy)"),
    include_deleted: bool = Query(False, description="Whether to include soft-deleted records"),
    current_user: User = Depends(get_current_user)
):
    """List clinical records for a patient ordered by newest first."""
    return await get_clinical_records_for_patient(
        patient_id=patient_id,
        record_type=record_type,
        include_deleted=include_deleted
    )


@router.get("/{record_id}", response_model=ClinicalRecordResponse)
async def get_record_endpoint(
    record_id: str,
    current_user: User = Depends(get_current_user)
):
    """Fetch a single clinical record by UUID."""
    return await get_clinical_record_by_id(record_id)


@router.put("/{record_id}", response_model=ClinicalRecordResponse)
async def update_record_endpoint(
    record_id: str,
    req: ClinicalRecordUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update a clinical record with optimistic concurrency check."""
    return await update_clinical_record(record_id=record_id, actor=current_user, req=req)


@router.delete("/{record_id}", response_model=ClinicalRecordResponse)
async def delete_record_endpoint(
    record_id: str,
    current_user: User = Depends(get_current_user)
):
    """Soft delete a clinical record."""
    return await soft_delete_clinical_record(record_id=record_id, actor=current_user)
