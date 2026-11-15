"""Clinical Triage REST API Router (Phase 6)."""

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Query, status

from app.core.dependencies import get_current_user
from app.modules.identity.models import User
from app.modules.triage.models import TriageEvaluation
from app.modules.triage.schemas import TriageEvaluationRequest, TriageEvaluationResponse
from app.modules.triage.service import evaluate_clinical_triage, load_facilities, load_rules

router = APIRouter(prefix="/triage", tags=["Clinical Triage & Emergency"])


@router.post("/evaluate", response_model=TriageEvaluationResponse, status_code=status.HTTP_200_OK)
async def evaluate_triage_endpoint(
    data: TriageEvaluationRequest,
    current_user: User = Depends(get_current_user)
):
    """Evaluate patient presentation for clinical urgency and specialty routing.

    NEVER outputs a diagnosis. Absolute priority to deterministic red-flags.
    """
    return await evaluate_clinical_triage(data, current_user)


@router.get("/rules", response_model=Dict[str, Any])
async def get_triage_rules_endpoint(_: User = Depends(get_current_user)):
    """Retrieve shared red-flag triage rules and emergency thresholds."""
    return load_rules()


@router.get("/facilities", response_model=Dict[str, Any])
async def get_emergency_facilities_endpoint(_: User = Depends(get_current_user)):
    """Retrieve MOCK seeded emergency hospitals and ambulance contact numbers."""
    return load_facilities()


@router.get("/evaluations/patient/{patient_id}", response_model=List[TriageEvaluationResponse])
async def get_patient_triage_history(
    patient_id: str,
    _: User = Depends(get_current_user)
):
    """Retrieve historical triage evaluations for a patient."""
    evaluations = await TriageEvaluation.find(
        TriageEvaluation.patient_id == patient_id
    ).sort("-created_at").limit(20).to_list()

    return [
        TriageEvaluationResponse(
            evaluation_id=e.evaluation_id,
            urgency=e.urgency,
            suggested_specialty=e.suggested_specialty,
            reason=e.reason,
            is_red_flag=e.is_red_flag,
            rule_id=e.rule_id,
            mode="History",
            created_at=e.created_at
        )
        for e in evaluations
    ]
