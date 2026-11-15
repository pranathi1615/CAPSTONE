"""Analytics API Router (Phase 7).

Provides aggregated operational, epidemiological, and network degradation metrics
for healthcare administrators, on-call doctors, and clinical researchers.
"""

from typing import Any, Dict
from fastapi import APIRouter, Depends

from app.core.dependencies import get_current_user, require_roles
from app.modules.identity.models import User, UserRole
from app.modules.analytics.schemas import AnalyticsSummaryResponse
from app.modules.analytics.service import get_analytics_summary

router = APIRouter(prefix="/analytics", tags=["Analytics & Epidemiological Telemetry"])


@router.get(
    "/summary",
    response_model=AnalyticsSummaryResponse,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.DOCTOR))]
)
async def get_summary_endpoint():
    """Retrieve comprehensive platform summary covering operational, clinical, and network telemetry."""
    return await get_analytics_summary()


@router.get(
    "/epidemiological",
    dependencies=[Depends(get_current_user)]
)
async def get_epidemiological_endpoint():
    """Retrieve epidemiological breakdown: specialties, triage urgency, and disease red flags."""
    summary = await get_analytics_summary()
    return {
        "generated_at": summary.generated_at,
        "specialties": summary.consultations.by_specialty,
        "urgency_distribution": summary.consultations.by_urgency,
        "triage_evaluations_total": summary.clinical.triage_evaluations_total,
        "red_flags_detected": summary.clinical.red_flags_detected,
        "clinical_referrals": summary.clinical.referrals_generated,
    }


@router.get(
    "/network-degradation",
    dependencies=[Depends(get_current_user)]
)
async def get_network_degradation_endpoint():
    """Retrieve network resilience metrics: mode transitions across VIDEO, AUDIO, VOICE, and TEXT."""
    summary = await get_analytics_summary()
    return {
        "generated_at": summary.generated_at,
        "mode_events_count": summary.network.mode_events_count,
        "mode_distribution": summary.network.mode_distribution,
        "voice_notes_count": summary.network.voice_notes_count,
        "resilience_rate_percent": summary.network.resilience_rate_percent,
    }
