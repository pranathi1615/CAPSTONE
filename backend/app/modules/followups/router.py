"""REST API Router for Follow-up Planning (Phase 6)."""

from typing import List, Optional
from fastapi import APIRouter, Depends, status

from app.core.dependencies import get_current_user, require_roles
from app.modules.followups.schemas import (
    CreateFollowUpRequest,
    FollowUpResponse,
    ProcessRemindersRequest,
    ProcessRemindersResult,
)
from app.modules.followups.service import (
    complete_followup_status,
    create_followup,
    list_chw_followups_due_today,
    process_followup_reminders,
)
from app.modules.identity.models import User, UserRole

router = APIRouter(prefix="/followups", tags=["Follow-up Planning"])


@router.post("", response_model=FollowUpResponse, status_code=status.HTTP_201_CREATED)
async def create_followup_endpoint(
    data: CreateFollowUpRequest,
    doctor: User = Depends(require_roles(UserRole.DOCTOR))
):
    """Doctor schedules a post-visit follow-up."""
    return await create_followup(data, doctor)


@router.get("/chw/due-today", response_model=List[FollowUpResponse])
async def get_chw_followups_due_today_endpoint(
    _: User = Depends(require_roles(UserRole.CHW, UserRole.ADMIN, UserRole.DOCTOR))
):
    """Retrieve follow-ups due today for CHW community surveillance."""
    return await list_chw_followups_due_today()


@router.post("/process-reminders", response_model=ProcessRemindersResult)
async def process_reminders_endpoint(
    data: Optional[ProcessRemindersRequest] = None,
    _: User = Depends(get_current_user)
):
    """Trigger follow-up reminder scans with an optional injectable clock."""
    clock = data.current_time if data else None
    return await process_followup_reminders(clock)


@router.post("/{followup_id}/complete", response_model=FollowUpResponse)
async def complete_followup_endpoint(
    followup_id: str,
    current_user: User = Depends(get_current_user)
):
    """Mark a follow-up visit as completed."""
    return await complete_followup_status(followup_id, current_user)
