"""Audit Log API router.

Provides endpoints for administrators to inspect the tamper-evident audit trail
and run the cryptographic chain verification algorithm.
"""

from typing import Any, Dict, List
from fastapi import APIRouter, Depends, Query

from app.core.dependencies import require_roles
from app.modules.audit.models import AuditLog
from app.modules.audit.service import verify_chain
from app.modules.identity.models import UserRole

router = APIRouter(prefix="/audit", tags=["Audit Log"])


@router.get(
    "",
    response_model=List[Dict[str, Any]],
    dependencies=[Depends(require_roles(UserRole.ADMIN))]
)
async def list_audit_logs_endpoint(
    limit: int = Query(default=100, ge=1, le=500),
    skip: int = Query(default=0, ge=0)
):
    """Admin-only: Retrieve recent audit log entries ordered descending by sequence."""
    logs = await AuditLog.find().sort("-seq").skip(skip).limit(limit).to_list()
    return [
        {
            "seq": log.seq,
            "prev_hash": log.prev_hash,
            "hash": log.hash,
            "timestamp": log.timestamp.isoformat(),
            "event_type": log.event_type,
            "actor_id": log.actor_id,
            "actor_role": log.actor_role,
            "target_id": log.target_id,
            "payload": log.payload
        }
        for log in logs
    ]


@router.get(
    "/verify",
    dependencies=[Depends(require_roles(UserRole.ADMIN))]
)
async def verify_audit_chain_endpoint():
    """Admin-only: Verify SHA-256 cryptographic chain integrity across all audit documents."""
    return await verify_chain()
