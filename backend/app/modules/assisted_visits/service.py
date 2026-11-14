"""Service layer for CHW Assisted Visits.

Enforces:
- Consent MUST be present before visit can be created.
- Vitals are evaluated against configurable ranges with out-of-range flags.
- Vitals are appended to ClinicalRecord for patient longitudinal continuity.
"""

from datetime import datetime, timezone
import logging
from typing import Any, Dict, List, Optional
import uuid
from fastapi import HTTPException, status

from app.core.vitals_evaluator import evaluate_vitals_data
from app.modules.assisted_visits.models import AssistedVisit
from app.modules.assisted_visits.schemas import AssistedVisitCreateRequest, AssistedVisitResponse
from app.modules.audit.service import append_audit_log
from app.modules.clinical.models import ClinicalRecord
from app.modules.consent.models import Consent
from app.modules.identity.models import User, UserRole

logger = logging.getLogger(__name__)


def visit_to_response(v: AssistedVisit) -> AssistedVisitResponse:
    return AssistedVisitResponse(
        visit_id=v.visit_id,
        patient_id=v.patient_id,
        patient_name=v.patient_name,
        patient_phone=v.patient_phone,
        patient_age=v.patient_age,
        patient_gender=v.patient_gender,
        chw_id=v.chw_id,
        chw_name=v.chw_name,
        consent_id=v.consent_id,
        status=v.status,
        vitals=v.vitals,
        symptoms=v.symptoms,
        symptom_notes=v.symptom_notes,
        transcript=v.transcript,
        voice_note_id=v.voice_note_id,
        consultation_type=v.consultation_type,
        async_consult_summary=v.async_consult_summary,
        is_out_of_range=v.is_out_of_range,
        out_of_range_flags=v.out_of_range_flags,
        client_id=v.client_id,
        idempotency_key=v.idempotency_key,
        created_at=v.created_at,
        synced_at=v.synced_at,
        updated_at=v.updated_at,
    )


async def create_assisted_visit(actor: User, req: AssistedVisitCreateRequest) -> AssistedVisitResponse:
    """Create or sync a CHW assisted visit."""
    now = datetime.now(timezone.utc)
    visit_id = req.visit_id or str(uuid.uuid4())
    client_id = req.client_id or str(uuid.uuid4())

    # 1. Enforce that consent exists
    consent = await Consent.find_one(Consent.consent_id == req.consent_id)
    if not consent:
        # If offline sync created consent in the same batch, check by patient_id
        consent = await Consent.find_one(Consent.patient_id == req.patient_id)
        if not consent:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Patient consent MUST be recorded before an assisted visit can be stored."
            )

    # 2. Evaluate vitals with configurable clinical thresholds
    eval_res = evaluate_vitals_data(req.vitals or {})
    is_out_of_range = eval_res["is_out_of_range"]
    flags = eval_res["flags"]

    # 3. Check for existing visit with visit_id
    existing = await AssistedVisit.find_one(AssistedVisit.visit_id == visit_id)
    if existing:
        existing.vitals = req.vitals
        existing.symptoms = req.symptoms
        existing.symptom_notes = req.symptom_notes
        existing.transcript = req.transcript
        existing.voice_note_id = req.voice_note_id
        existing.consultation_type = req.consultation_type
        existing.async_consult_summary = req.async_consult_summary
        existing.is_out_of_range = is_out_of_range
        existing.out_of_range_flags = flags
        existing.updated_at = now
        existing.synced_at = now
        await existing.save()
        visit = existing
    else:
        visit = AssistedVisit(
            visit_id=visit_id,
            patient_id=req.patient_id,
            patient_name=req.patient_name,
            patient_phone=req.patient_phone,
            patient_age=req.patient_age,
            patient_gender=req.patient_gender,
            chw_id=actor.user_id,
            chw_name=actor.full_name,
            consent_id=consent.consent_id,
            status="consult_requested" if req.consultation_type == "async_consult" else "completed",
            vitals=req.vitals,
            symptoms=req.symptoms,
            symptom_notes=req.symptom_notes,
            transcript=req.transcript,
            voice_note_id=req.voice_note_id,
            consultation_type=req.consultation_type,
            async_consult_summary=req.async_consult_summary,
            is_out_of_range=is_out_of_range,
            out_of_range_flags=flags,
            client_id=client_id,
            idempotency_key=req.idempotency_key,
            created_at=req.created_at or now,
            synced_at=now,
            updated_at=now,
        )
        await visit.insert()

    # 4. Append vitals as Observation in ClinicalRecord (append-only longitudinal log)
    if req.vitals:
        obs_rec = ClinicalRecord(
            record_id=str(uuid.uuid4()),
            patient_id=req.patient_id,
            doctor_id=None,
            record_type="observation",
            data={
                "status": "final",
                "category": ["vital-signs"],
                "code": "85354-9",
                "effectiveDateTime": (req.created_at or now).isoformat(),
                "values": req.vitals,
                "interpretation": "out_of_range" if is_out_of_range else "normal",
                "flags": [f["flag"] for f in flags],
            },
            version=1,
            client_id=client_id,
            is_deleted=False,
            client_timestamp=req.created_at or now,
            created_at=now,
            updated_at=now,
        )
        await obs_rec.insert()

    # 5. Append Audit Log
    await append_audit_log(
        event_type="ASSISTED_VISIT_RECORDED",
        actor_id=actor.user_id,
        actor_role=actor.role.value,
        target_id=visit.visit_id,
        payload={
            "patient_id": visit.patient_id,
            "consultation_type": visit.consultation_type,
            "is_out_of_range": is_out_of_range,
        },
    )

    return visit_to_response(visit)


async def list_assisted_visits(
    actor: User,
    patient_id: Optional[str] = None,
    limit: int = 50
) -> List[AssistedVisitResponse]:
    """Retrieve assisted visits filtered by CHW or patient."""
    query = []
    if patient_id:
        query.append(AssistedVisit.patient_id == patient_id)
    elif actor.role == UserRole.CHW:
        query.append(AssistedVisit.chw_id == actor.user_id)

    visits = await AssistedVisit.find(*query).sort("-created_at").limit(limit).to_list()
    return [visit_to_response(v) for v in visits]


async def get_assisted_visit_by_id(visit_id: str) -> AssistedVisitResponse:
    visit = await AssistedVisit.find_one(AssistedVisit.visit_id == visit_id)
    if not visit:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assisted visit not found.")
    return visit_to_response(visit)
