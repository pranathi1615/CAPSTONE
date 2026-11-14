"""Offline Synchronization Engine Router.

Exposes:
- POST /sync: Batch synchronization with atomic receipts, idempotency, and server-wins conflict detection.
- POST /sync/push: Legacy push endpoint for backward compatibility.
- GET /sync/pull: Incremental multi-device pull.
"""

from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, Query, status

from app.core.dependencies import get_current_user
from app.modules.identity.models import User
from app.modules.sync.schemas import (
    SyncBatchRequest,
    SyncBatchResponse,
    SyncPullResponse,
    SyncPushRequest,
    SyncPushResponse,
)
from app.modules.sync.service import (
    execute_sync_batch,
    execute_sync_pull,
    execute_sync_push,
)

router = APIRouter(tags=["Synchronization"])


@router.post("/sync", response_model=SyncBatchResponse, status_code=status.HTTP_200_OK)
async def sync_batch_endpoint(
    req: SyncBatchRequest,
    current_user: User = Depends(get_current_user)
):
    """Drain client outbox batch mutations with atomic idempotency and conflict resolution."""
    return await execute_sync_batch(actor=current_user, req=req)


@router.post("/sync/push", response_model=SyncPushResponse, status_code=status.HTTP_200_OK)
async def sync_push_endpoint(
    req: SyncPushRequest,
    current_user: User = Depends(get_current_user)
):
    """Backward-compatible push endpoint for clinical records."""
    return await execute_sync_push(actor=current_user, req=req)


@router.get("/sync/pull", response_model=SyncPullResponse)
async def sync_pull_endpoint(
    patient_id: str = Query(..., description="Target patient UUID"),
    since: Optional[datetime] = Query(None, description="ISO timestamp to fetch records updated after"),
    current_user: User = Depends(get_current_user)
):
    """Fetch incremental records updated after given timestamp."""
    return await execute_sync_pull(actor=current_user, patient_id=patient_id, since=since)
