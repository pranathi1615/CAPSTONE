"""Pydantic schemas for Triage, Emergency Escalation, and Decision Support."""

from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from app.modules.triage.models import UrgencyLevel


class TriageEvaluationRequest(BaseModel):
    patient_id: Optional[str] = None
    patient_name: Optional[str] = None
    symptoms: List[str] = Field(default_factory=list)
    symptom_text: Optional[str] = None
    vitals: Dict[str, Any] = Field(default_factory=dict)
    age_group: Optional[str] = "adult"


class TriageEvaluationResponse(BaseModel):
    evaluation_id: str
    urgency: UrgencyLevel
    suggested_specialty: str
    reason: str
    is_red_flag: bool
    rule_id: Optional[str] = None
    mode: str = "ML + Deterministic Red-Flags"
    notice: Dict[str, str] = Field(default_factory=lambda: {
        "en": "Decision support only. A qualified doctor makes the final clinical decision.",
        "hi": "केवल निर्णय समर्थन। अंतिम नैदानिक ​​निर्णय योग्य डॉक्टर द्वारा लिया जाता है।",
        "te": "కేవలం నిర్ణయ మద్దతు మాత్రమే. అర్హత కలిగిన వైద్యుడు తుది నిర్ణయం తీసుకుంటారు."
    })
    nearest_facilities: Optional[List[Dict[str, Any]]] = None
    ambulance_contacts: Optional[List[Dict[str, Any]]] = None
    created_at: datetime
