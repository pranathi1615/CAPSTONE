"""Beanie models for Clinical Triage and Emergency Escalation (Phase 6)."""

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional
import uuid
from beanie import Document
from pydantic import Field


class UrgencyLevel(str, Enum):
    EMERGENCY = "emergency"
    URGENT = "urgent"
    SOON = "soon"
    ROUTINE = "routine"


class TriageEvaluation(Document):
    evaluation_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    patient_id: Optional[str] = None
    patient_name: Optional[str] = None
    evaluated_by: str  # user_id of patient or CHW
    evaluated_by_role: str
    symptoms: List[str] = Field(default_factory=list)
    symptom_text: Optional[str] = None
    vitals: Dict[str, Any] = Field(default_factory=dict)
    urgency: UrgencyLevel
    suggested_specialty: str
    reason: str
    is_red_flag: bool = False
    rule_id: Optional[str] = None
    model_version: str = "1.0.0"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "triage_evaluations"
        indexes = [
            "evaluation_id",
            "patient_id",
            "urgency",
            "created_at",
            "is_red_flag",
        ]
