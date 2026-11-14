"""Service layer for bidirectional offline sync engine with atomic idempotency receipts,
version conflict detection, and append-only clinical logs.

Enforces:
- Idempotency via sync_receipts collection with unique index on idempotency_key.
- MongoDB transactions when replica set is active; DuplicateKeyError means duplicate.
- Notes and vitals are strictly append-only.
- Shared record edits enforce server-wins on version conflict.
- Itemized batch result: applied | duplicate | conflict | rejected.
"""

from datetime import datetime, timezone
import logging
from typing import Any, Dict, List, Optional
import uuid
import pymongo.errors

from app.core.database import get_mongo_client
from app.modules.assisted_visits.models import AssistedVisit
from app.modules.assisted_visits.schemas import AssistedVisitCreateRequest
from app.modules.assisted_visits.service import create_assisted_visit, visit_to_response
from app.modules.audit.service import append_audit_log
from app.modules.clinical.models import ClinicalRecord
from app.modules.clinical.service import record_to_response, validate_fhir_payload
from app.modules.consent.models import Consent
from app.modules.identity.models import User
from app.modules.sync.models import SyncReceipt
from app.modules.sync.schemas import (
    SyncBatchItem,
    SyncBatchItemResult,
    SyncBatchRequest,
    SyncBatchResponse,
    SyncMutationResult,
    SyncPullResponse,
    SyncPushRequest,
    SyncPushResponse,
)

logger = logging.getLogger(__name__)


async def _apply_single_item(
    actor: User,
    item: SyncBatchItem,
    now: datetime,
    session: Optional[Any] = None
) -> SyncBatchItemResult:
    """Apply a single sync mutation item idempotently with server-wins conflict detection."""
    # 1. Idempotency Check via SyncReceipt
    existing_receipt = await SyncReceipt.find_one(
        SyncReceipt.idempotency_key == item.idempotency_key,
        session=session
    )
    if existing_receipt:
        return SyncBatchItemResult(
            idempotency_key=item.idempotency_key,
            item_id=item.item_id,
            item_type=item.item_type,
            status="duplicate",
            message="Duplicate mutation ignored: previously processed."
        )

    # 2. Dispatch by Item Type
    try:
        # A) CHW ASSISTED VISIT
        if item.item_type == "visit":
            visit_req = AssistedVisitCreateRequest(
                visit_id=item.item_id,
                patient_id=item.payload.get("patient_id"),
                patient_name=item.payload.get("patient_name", "Anonymous Patient"),
                patient_phone=item.payload.get("patient_phone"),
                patient_age=item.payload.get("patient_age"),
                patient_gender=item.payload.get("patient_gender"),
                consent_id=item.payload.get("consent_id", ""),
                vitals=item.payload.get("vitals", {}),
                symptoms=item.payload.get("symptoms", []),
                symptom_notes=item.payload.get("symptom_notes"),
                transcript=item.payload.get("transcript"),
                voice_note_id=item.payload.get("voice_note_id"),
                consultation_type=item.payload.get("consultation_type", "async_consult"),
                async_consult_summary=item.payload.get("async_consult_summary"),
                client_id=item.client_id,
                idempotency_key=item.idempotency_key,
                created_at=item.client_timestamp,
            )
            created_visit = await create_assisted_visit(actor=actor, req=visit_req)
            
            # Record receipt
            receipt = SyncReceipt(
                idempotency_key=item.idempotency_key,
                item_type=item.item_type,
                item_id=item.item_id,
                client_id=item.client_id,
                actor_id=actor.user_id,
                status="applied",
                payload_summary={"visit_id": item.item_id, "patient_id": visit_req.patient_id}
            )
            await receipt.insert(session=session)

            return SyncBatchItemResult(
                idempotency_key=item.idempotency_key,
                item_id=item.item_id,
                item_type=item.item_type,
                status="applied",
                server_document=created_visit.model_dump(mode="json"),
                message="Assisted visit synced successfully."
            )

        # B) CONSENT (Telehealth / Record Sharing)
        elif item.item_type == "consent":
            patient_id = item.payload.get("patient_id")
            purpose = item.payload.get("purpose", "teleconsultation")
            granted_by = item.payload.get("granted_by") or actor.user_id
            granted_by_role = item.payload.get("granted_by_role") or actor.role.value

            consent = await Consent.find_one(
                Consent.patient_id == patient_id,
                Consent.purpose == purpose,
                session=session
            )
            if not consent:
                consent = Consent(
                    consent_id=item.item_id or str(uuid.uuid4()),
                    patient_id=patient_id,
                    purpose=purpose,
                    granted_by=granted_by,
                    granted_by_role=granted_by_role,
                    granted_at=item.client_timestamp or now,
                )
                await consent.insert(session=session)

                await append_audit_log(
                    event_type="CONSENT_GRANTED_OFFLINE_SYNC",
                    actor_id=actor.user_id,
                    actor_role=actor.role.value,
                    target_id=patient_id,
                    payload={"consent_id": consent.consent_id, "purpose": purpose}
                )

            receipt = SyncReceipt(
                idempotency_key=item.idempotency_key,
                item_type=item.item_type,
                item_id=item.item_id,
                client_id=item.client_id,
                actor_id=actor.user_id,
                status="applied",
                payload_summary={"consent_id": consent.consent_id}
            )
            await receipt.insert(session=session)

            return SyncBatchItemResult(
                idempotency_key=item.idempotency_key,
                item_id=item.item_id,
                item_type=item.item_type,
                status="applied",
                server_document={
                    "consent_id": consent.consent_id,
                    "patient_id": consent.patient_id,
                    "purpose": consent.purpose,
                    "granted_at": consent.granted_at.isoformat()
                },
                message="Consent recorded from offline sync."
            )

        # C) VITALS & NOTES (STRICTLY APPEND-ONLY)
        elif item.item_type in ("vitals", "note"):
            patient_id = item.payload.get("patient_id")
            rec_type = "observation" if item.item_type == "vitals" else "condition"
            data = item.payload.get("data") or item.payload

            validated_data = validate_fhir_payload(rec_type, data)
            obs_rec = ClinicalRecord(
                record_id=item.item_id or str(uuid.uuid4()),
                patient_id=patient_id,
                doctor_id=None,
                record_type=rec_type,
                data=validated_data,
                version=1,
                client_id=item.client_id,
                is_deleted=False,
                client_timestamp=item.client_timestamp,
                created_at=now,
                updated_at=now,
            )
            await obs_rec.insert(session=session)

            receipt = SyncReceipt(
                idempotency_key=item.idempotency_key,
                item_type=item.item_type,
                item_id=item.item_id,
                client_id=item.client_id,
                actor_id=actor.user_id,
                status="applied",
                payload_summary={"record_id": obs_rec.record_id}
            )
            await receipt.insert(session=session)

            return SyncBatchItemResult(
                idempotency_key=item.idempotency_key,
                item_id=item.item_id,
                item_type=item.item_type,
                status="applied",
                server_version=1,
                server_document=record_to_response(obs_rec).model_dump(mode="json"),
                message=f"Append-only {item.item_type} recorded successfully."
            )

        # D) CLINICAL RECORDS (FHIR R4 WITH SERVER-WINS VERSION CONFLICT DETECTION)
        elif item.item_type == "clinical_record":
            record_id = item.item_id
            patient_id = item.payload.get("patient_id")
            rec_type = item.payload.get("record_type", "observation")
            data = item.payload.get("data", {})
            is_deleted = item.payload.get("is_deleted", False)

            existing = await ClinicalRecord.find_one(ClinicalRecord.record_id == record_id, session=session)
            if not existing:
                validated_data = validate_fhir_payload(rec_type, data)
                new_rec = ClinicalRecord(
                    record_id=record_id,
                    patient_id=patient_id,
                    doctor_id=None,
                    record_type=rec_type,
                    data=validated_data,
                    version=1,
                    client_id=item.client_id,
                    is_deleted=is_deleted,
                    client_timestamp=item.client_timestamp,
                    created_at=now,
                    updated_at=now,
                )
                await new_rec.insert(session=session)

                receipt = SyncReceipt(
                    idempotency_key=item.idempotency_key,
                    item_type=item.item_type,
                    item_id=item.item_id,
                    client_id=item.client_id,
                    actor_id=actor.user_id,
                    status="applied",
                    payload_summary={"record_id": new_rec.record_id}
                )
                await receipt.insert(session=session)

                return SyncBatchItemResult(
                    idempotency_key=item.idempotency_key,
                    item_id=item.item_id,
                    item_type=item.item_type,
                    status="applied",
                    server_version=1,
                    message="New clinical record created from offline sync."
                )
            else:
                # Version check (Server-Wins)
                if item.client_version < existing.version:
                    # CONFLICT!
                    receipt = SyncReceipt(
                        idempotency_key=item.idempotency_key,
                        item_type=item.item_type,
                        item_id=item.item_id,
                        client_id=item.client_id,
                        actor_id=actor.user_id,
                        status="conflict",
                        payload_summary={"record_id": existing.record_id, "server_version": existing.version}
                    )
                    await receipt.insert(session=session)

                    return SyncBatchItemResult(
                        idempotency_key=item.idempotency_key,
                        item_id=item.item_id,
                        item_type=item.item_type,
                        status="conflict",
                        server_version=existing.version,
                        server_document=record_to_response(existing).model_dump(mode="json"),
                        message=f"Conflict detected: server is at version {existing.version}; client mutation was version {item.client_version}."
                    )
                else:
                    validated_data = validate_fhir_payload(existing.record_type, data)
                    existing.data = validated_data
                    existing.is_deleted = is_deleted
                    existing.version += 1
                    existing.client_id = item.client_id
                    existing.client_timestamp = item.client_timestamp
                    existing.updated_at = now
                    await existing.save(session=session)

                    receipt = SyncReceipt(
                        idempotency_key=item.idempotency_key,
                        item_type=item.item_type,
                        item_id=item.item_id,
                        client_id=item.client_id,
                        actor_id=actor.user_id,
                        status="applied",
                        payload_summary={"record_id": existing.record_id, "version": existing.version}
                    )
                    await receipt.insert(session=session)

                    return SyncBatchItemResult(
                        idempotency_key=item.idempotency_key,
                        item_id=item.item_id,
                        item_type=item.item_type,
                        status="applied",
                        server_version=existing.version,
                        message="Record updated from offline sync."
                    )

        else:
            # Generic item type fallback
            receipt = SyncReceipt(
                idempotency_key=item.idempotency_key,
                item_type=item.item_type,
                item_id=item.item_id,
                client_id=item.client_id,
                actor_id=actor.user_id,
                status="applied",
                payload_summary={"raw_keys": list(item.payload.keys())}
            )
            await receipt.insert(session=session)

            return SyncBatchItemResult(
                idempotency_key=item.idempotency_key,
                item_id=item.item_id,
                item_type=item.item_type,
                status="applied",
                message=f"Item of type {item.item_type} processed."
            )

    except pymongo.errors.DuplicateKeyError:
        return SyncBatchItemResult(
            idempotency_key=item.idempotency_key,
            item_id=item.item_id,
            item_type=item.item_type,
            status="duplicate",
            message="Duplicate idempotency key detected: item already processed."
        )
    except Exception as exc:
        logger.error("Sync error processing item %s: %s", item.idempotency_key, exc)
        return SyncBatchItemResult(
            idempotency_key=item.idempotency_key,
            item_id=item.item_id,
            item_type=item.item_type,
            status="rejected",
            message=str(exc)
        )


async def execute_sync_batch(actor: User, req: SyncBatchRequest) -> SyncBatchResponse:
    """Process a batch of sync items using MongoDB transactions and atomic idempotency receipts."""
    now = datetime.now(timezone.utc)
    raw_items: List[SyncBatchItem] = []

    if req.batch:
        raw_items.extend(req.batch)
    elif req.mutations:
        for m in req.mutations:
            raw_items.append(SyncBatchItem(
                idempotency_key=m.idempotency_key or m.client_id,
                client_id=m.client_id,
                item_type=m.record_type if m.record_type in ("vitals", "note") else "clinical_record",
                item_id=m.record_id,
                payload={
                    "patient_id": m.patient_id,
                    "record_type": m.record_type,
                    "data": m.data,
                    "is_deleted": m.is_deleted,
                },
                client_version=m.client_version,
                client_timestamp=m.client_timestamp,
            ))

    # Sort deterministically by client timestamp
    sorted_items = sorted(raw_items, key=lambda it: it.client_timestamp)
    results: List[SyncBatchItemResult] = []
    applied_count = 0
    dup_count = 0
    conflict_count = 0
    rejected_count = 0

    client = get_mongo_client()

    for item in sorted_items:
        # Try running within an atomic session/transaction if client and replica set support it
        applied_result = None
        if client:
            try:
                async with await client.start_session() as session:
                    async with session.start_transaction():
                        applied_result = await _apply_single_item(actor, item, now, session=session)
            except pymongo.errors.OperationFailure:
                # Standalone test / environment without multi-document replica set transactions
                applied_result = await _apply_single_item(actor, item, now, session=None)
            except Exception as exc:
                logger.warning("Transaction error on item %s, retrying standalone: %s", item.idempotency_key, exc)
                applied_result = await _apply_single_item(actor, item, now, session=None)
        else:
            applied_result = await _apply_single_item(actor, item, now, session=None)

        results.append(applied_result)
        if applied_result.status == "applied":
            applied_count += 1
        elif applied_result.status == "duplicate":
            dup_count += 1
        elif applied_result.status == "conflict":
            conflict_count += 1
        else:
            rejected_count += 1

    return SyncBatchResponse(
        processed=len(sorted_items),
        applied=applied_count,
        duplicates=dup_count,
        conflicts=conflict_count,
        rejected=rejected_count,
        results=results,
        server_timestamp=now,
    )


async def execute_sync_push(actor: User, req: SyncPushRequest) -> SyncPushResponse:
    """Legacy Phase 4 push wrapper delegating to atomic batch engine."""
    batch_req = SyncBatchRequest(mutations=req.mutations)
    batch_res = await execute_sync_batch(actor=actor, req=batch_req)

    mutation_results: List[SyncMutationResult] = []
    for r in batch_res.results:
        mutation_results.append(SyncMutationResult(
            record_id=r.item_id,
            client_id=r.idempotency_key,
            status=r.status,
            server_version=r.server_version or 1,
            server_document=r.server_document,
            message=r.message,
        ))

    return SyncPushResponse(
        processed=batch_res.processed,
        applied=batch_res.applied,
        conflicts=batch_res.conflicts,
        results=mutation_results,
        server_timestamp=batch_res.server_timestamp,
    )


async def execute_sync_pull(
    actor: User,
    patient_id: str,
    since: Optional[datetime] = None
) -> SyncPullResponse:
    """Fetch all records updated since timestamp for multi-device sync."""
    now = datetime.now(timezone.utc)
    query = [
        ClinicalRecord.patient_id == patient_id,
    ]
    if since:
        query.append(ClinicalRecord.updated_at > since)

    records = await ClinicalRecord.find(*query).sort("-updated_at").to_list()
    res_list = [record_to_response(r) for r in records]

    return SyncPullResponse(
        records=res_list,
        server_timestamp=now,
        count=len(res_list)
    )
