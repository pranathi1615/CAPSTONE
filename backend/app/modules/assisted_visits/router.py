"""Router for CHW Assisted Visits."""

from typing import List, Optional
from fastapi import APIRouter, Depends, Query, status

from app.core.dependencies import get_current_user, require_roles
from app.modules.assisted_visits.schemas import AssistedVisitCreateRequest, AssistedVisitResponse
from app.modules.assisted_visits.service import (
    create_assisted_visit,
    get_assisted_visit_by_id,
    list_assisted_visits,
)
from app.modules.identity.models import User, UserRole

router = APIRouter(prefix="/assisted-visits", tags=["CHW Assisted Visits"])


@router.post("", response_model=AssistedVisitResponse, status_code=status.HTTP_201_CREATED)
async def create_visit_endpoint(
    req: AssistedVisitCreateRequest,
    current_user: User = Depends(require_roles(UserRole.CHW, UserRole.ADMIN, UserRole.DOCTOR))
):
    """Create a new assisted telehealth visit (or sync an offline visit)."""
    return await create_assisted_visit(actor=current_user, req=req)


@router.get("", response_model=List[AssistedVisitResponse])
async def list_visits_endpoint(
    patient_id: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user)
):
    """List assisted visits."""
    return await list_assisted_visits(actor=current_user, patient_id=patient_id, limit=limit)


@router.get("/{visit_id}", response_model=AssistedVisitResponse)
async def get_visit_endpoint(
    visit_id: str,
    _: User = Depends(get_current_user)
):
    """Fetch an assisted visit by its UUID."""
    return await get_assisted_visit_by_id(visit_id)
