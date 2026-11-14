"""Service layer for bidirectional offline sync engine with version-based conflict detection."""

from datetime import datetime, timezone
import logging
from typing import List, Optional

from app.modules.audit.service import append_audit_log
from app.modules.clinical.models import ClinicalRecord
from app.modules.clinical.service import record_to_response, validate_fhir_payload
from app.modules.identity.models import User
from app.modules.sync.schemas import (
    SyncMutationResult,
    SyncPullResponse,
    SyncPushRequest,
    SyncPushResponse
)

logger = logging.getLogger(__name__)


async def execute_sync_push(actor: User, req: SyncPushRequest) -> SyncPushResponse:
    """Drain client outbox mutations with deterministic ordering and version-based conflict detection."""
    now = datetime.now(timezone.utc)
    results: List[SyncMutationResult] = []
    applied_count = 0
    conflict_count = 0

    # Process mutations sorted chronologically by local client timestamp
    sorted_mutations = sorted(req.mutations, key=lambda m: m.client_timestamp)

    for mutation in sorted_mutations:
        try:
            existing = await ClinicalRecord.find_one(ClinicalRecord.record_id == mutation.record_id)

            if not existing:
                # 1. Brand new record created offline
                validated_data = validate_fhir_payload(mutation.record_type, mutation.data)
                new_rec = ClinicalRecord(
                    record_id=mutation.record_id,
                    patient_id=mutation.patient_id,
                    doctor_id=mutation.doctor_id,
                    record_type=mutation.record_type,
                    data=validated_data,
                    version=1,
                    client_id=mutation.client_id,
                    is_deleted=mutation.is_deleted,
                    client_timestamp=mutation.client_timestamp,
                    created_at=now,
                    updated_at=now
                )
                await new_rec.insert()
                applied_count += 1
                results.append(SyncMutationResult(
                    record_id=mutation.record_id,
                    client_id=mutation.client_id,
                    status="applied",
                    server_version=1,
                    message="New record inserted from offline sync"
                ))
            else:
                # 2. Existing record - check for version conflict
                if mutation.client_version < existing.version:
                    # CONFLICT: Server has advanced past client base version!
                    conflict_count += 1
                    results.append(SyncMutationResult(
                        record_id=mutation.record_id,
                        client_id=mutation.client_id,
                        status="conflict",
                        server_version=existing.version,
                        server_document=record_to_response(existing).model_dump(mode="json"),
                        message=f"Conflict: server version is {existing.version}, but client mutation was based on version {mutation.client_version}"
                    ))
                else:
                    # No conflict: apply update
                    validated_data = validate_fhir_payload(existing.record_type, mutation.data)
                    existing.data = validated_data
                    existing.is_deleted = mutation.is_deleted
                    existing.version += 1
                    existing.client_id = mutation.client_id
                    existing.client_timestamp = mutation.client_timestamp
                    existing.updated_at = now
                    await existing.save()

                    applied_count += 1
                    results.append(SyncMutationResult(
                        record_id=mutation.record_id,
                        client_id=mutation.client_id,
                        status="applied",
                        server_version=existing.version,
                        message="Record updated from offline sync"
                    ))

        except Exception as exc:
            logger.error("Sync push error on record %s: %s", mutation.record_id, exc)
            results.append(SyncMutationResult(
                record_id=mutation.record_id,
                client_id=mutation.client_id,
                status="error",
                server_version=0,
                message=str(exc)
            ))

    # Log sync operation to audit trail
    if applied_count > 0 or conflict_count > 0:
        await append_audit_log(
            event_type="OFFLINE_SYNC_PUSH",
            actor_id=actor.user_id,
            actor_role=actor.role.value,
            target_id=actor.user_id,
            payload={
                "total_mutations": len(req.mutations),
                "applied": applied_count,
                "conflicts": conflict_count
            }
        )

    return SyncPushResponse(
        processed=len(req.mutations),
        applied=applied_count,
        conflicts=conflict_count,
        results=results,
        server_timestamp=now
    )


async def execute_sync_pull(
    patient_id: str,
    since: Optional[datetime] = None
) -> SyncPullResponse:
    """Pull records updated on server since a given timestamp for multi-device sync."""
    now = datetime.now(timezone.utc)
    query = [ClinicalRecord.patient_id == patient_id]
    if since:
        query.append(ClinicalRecord.updated_at > since)

    records = await ClinicalRecord.find(*query).sort("+updated_at").to_list()
    response_items = [record_to_response(r) for r in records]

    return SyncPullResponse(
        records=response_items,
        server_timestamp=now,
        count=len(response_items)
    )
