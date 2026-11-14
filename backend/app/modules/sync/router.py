"""Offline synchronization REST endpoints."""

from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, Query, status

from app.core.dependencies import get_current_user
from app.modules.identity.models import User
from app.modules.sync.schemas import SyncPullResponse, SyncPushRequest, SyncPushResponse
from app.modules.sync.service import execute_sync_pull, execute_sync_push

router = APIRouter(prefix="/sync", tags=["sync"])


@router.post("/push", response_model=SyncPushResponse, status_code=status.HTTP_200_OK)
async def push_sync_endpoint(
    req: SyncPushRequest,
    current_user: User = Depends(get_current_user)
):
    """Batch process queued offline mutations from client outbox.

    Detects version conflicts when client base version < current server version.
    """
    return await execute_sync_push(actor=current_user, req=req)


@router.get("/pull", response_model=SyncPullResponse)
async def pull_sync_endpoint(
    patient_id: str = Query(..., description="Target patient UUID"),
    since: Optional[datetime] = Query(None, description="ISO timestamp to filter records updated since"),
    current_user: User = Depends(get_current_user)
):
    """Pull records updated on server since a given timestamp."""
    return await execute_sync_pull(patient_id=patient_id, since=since)
