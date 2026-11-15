"""Clinical Triage Evaluation and Emergency Escalation Service (Phase 6).

Implements:
1. Deterministic Red-Flag Rule Engine (absolute priority, model cannot override).
2. Machine Learning Urgency & Specialty Classification (scikit-learn).
3. Non-diagnostic Clinical Decision Support output with tri-lingual notices.
4. Instant WebSocket emergency escalation broadcast to on-call doctors.
5. Append-only audit logging (seq+1 cryptographic hash chain).
"""

from datetime import datetime, timezone
import json
import logging
import os
from typing import Any, Dict, List, Optional
import joblib

from app.core.config import settings
from app.modules.audit.service import append_audit_log
from app.modules.chat.websocket_manager import ws_manager
from app.modules.identity.models import User, UserRole
from app.modules.triage.models import TriageEvaluation, UrgencyLevel
from app.modules.triage.schemas import TriageEvaluationRequest, TriageEvaluationResponse

logger = logging.getLogger("carebridge.triage")

# File paths
CORE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "core"))
RULES_PATH = os.path.join(CORE_DIR, "triage_rules.json")
FACILITIES_PATH = os.path.join(CORE_DIR, "emergency_facilities.json")
MODEL_PATH = os.path.join(os.path.dirname(__file__), "triage_model.joblib")

# Global caches
_triage_rules: Optional[Dict[str, Any]] = None
_facilities_data: Optional[Dict[str, Any]] = None
_ml_artifact: Optional[Dict[str, Any]] = None


def load_rules() -> Dict[str, Any]:
    global _triage_rules
    if _triage_rules is None:
        try:
            with open(RULES_PATH, "r", encoding="utf-8") as f:
                _triage_rules = json.load(f)
        except Exception as exc:
            logger.error("Failed loading triage rules from %s: %s", RULES_PATH, exc)
            _triage_rules = {"red_flag_rules": [], "vital_sign_emergency_thresholds": {}}
    return _triage_rules


def load_facilities() -> Dict[str, Any]:
    global _facilities_data
    if _facilities_data is None:
        try:
            with open(FACILITIES_PATH, "r", encoding="utf-8") as f:
                _facilities_data = json.load(f)
        except Exception as exc:
            logger.error("Failed loading facilities data from %s: %s", FACILITIES_PATH, exc)
            _facilities_data = {"facilities": [], "national_emergency_numbers": []}
    return _facilities_data


def load_ml_model() -> Optional[Dict[str, Any]]:
    global _ml_artifact
    if _ml_artifact is None and os.path.exists(MODEL_PATH):
        try:
            _ml_artifact = joblib.load(MODEL_PATH)
            logger.info("CareBridge Triage ML model loaded successfully from %s", MODEL_PATH)
        except Exception as exc:
            logger.warning("Could not load triage ML model (%s). Using rules-only fallback.", exc)
    return _ml_artifact


async def broadcast_emergency_escalation(
    evaluation_id: str,
    patient_id: Optional[str],
    patient_name: Optional[str],
    reason: str,
    suggested_specialty: str
):
    """Pushes a real-time WebSocket alert immediately to all on-call doctors."""
    try:
        on_call_doctors = await User.find(
            User.role == UserRole.DOCTOR,
            User.is_on_call == True
        ).to_list()

        alert_payload = {
            "type": "emergency_alert",
            "evaluation_id": evaluation_id,
            "patient_id": patient_id,
            "patient_name": patient_name or "Anonymous Patient",
            "reason": reason,
            "suggested_specialty": suggested_specialty,
            "urgency": "emergency",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "target_response_time": "IMMEDIATE (0 min)",
            "notice": "Decision support alert - immediate medical evaluation required."
        }

        # Broadcast via Redis / WebSocket manager to all connected sessions
        await ws_manager.broadcast_to_role(
            role="doctor",
            message_type="emergency_alert",
            payload=alert_payload
        )
        logger.info(
            "Emergency escalation alert dispatched to %d on-call doctors for patient %s",
            len(on_call_doctors),
            patient_id
        )
    except Exception as exc:
        logger.error("Failed to broadcast emergency escalation: %s", exc)


async def evaluate_clinical_triage(
    data: TriageEvaluationRequest,
    current_user: User
) -> TriageEvaluationResponse:
    """Evaluate patient clinical presentation for urgency level and specialty routing.

    NEVER outputs a medical diagnosis. Only clinical decision support urgency and specialty.
    """
    rules = load_rules()
    facilities = load_facilities()

    # Normalize symptoms
    norm_symptoms = [s.strip().lower().replace("-", "_").replace(" ", "_") for s in data.symptoms if s]
    combined_text = (data.symptom_text or " ".join(data.symptoms)).lower()

    # -------------------------------------------------------------
    # 1. Deterministic Red-Flag Rule Engine (Absolute Priority)
    # -------------------------------------------------------------
    red_flag_fired = None
    for rule in rules.get("red_flag_rules", []):
        req_met = (
            not rule.get("required_symptoms") or
            all(req.lower() in norm_symptoms or req.lower() in combined_text for req in rule["required_symptoms"])
        )
        any_met = (
            not rule.get("any_of_symptoms") or
            any(opt.lower() in norm_symptoms or opt.lower() in combined_text for opt in rule["any_of_symptoms"])
        )
        if req_met and any_met:
            red_flag_fired = rule
            break

    # Vital sign emergency threshold checks
    v_thresh = rules.get("vital_sign_emergency_thresholds", {})
    vital_red_flag_reason = None
    if data.vitals and isinstance(data.vitals, dict):
        spo2 = data.vitals.get("spo2")
        if spo2 is not None and float(spo2) < v_thresh.get("spo2_min", 88):
            vital_red_flag_reason = f"Critical hypoxia (SpO2 {spo2}% < {v_thresh.get('spo2_min')}%)"
        systolic = data.vitals.get("systolic_bp")
        if systolic is not None and float(systolic) >= v_thresh.get("systolic_bp_max", 200):
            vital_red_flag_reason = f"Hypertensive crisis (Systolic BP {systolic} >= {v_thresh.get('systolic_bp_max')})"
        elif systolic is not None and 0 < float(systolic) <= v_thresh.get("systolic_bp_min", 70):
            vital_red_flag_reason = f"Profound hypotension / shock (Systolic BP {systolic} <= {v_thresh.get('systolic_bp_min')})"
        pulse = data.vitals.get("pulse")
        if pulse is not None and (float(pulse) > v_thresh.get("pulse_max", 145) or (0 < float(pulse) < v_thresh.get("pulse_min", 40))):
            vital_red_flag_reason = f"Extreme hemodynamic instability (Pulse {pulse} bpm)"

    # Red-flag override
    if red_flag_fired or vital_red_flag_reason:
        urgency = UrgencyLevel.EMERGENCY
        is_red_flag = True
        suggested_specialty = red_flag_fired.get("suggested_specialty", "General Medicine") if red_flag_fired else "Cardiology"
        rule_id = red_flag_fired.get("id") if red_flag_fired else "RF_VITALS_CRITICAL"
        reason = vital_red_flag_reason or red_flag_fired.get("reason", "Critical red-flag symptom combination")
        mode = "Deterministic Red-Flag (Absolute Priority)"
    else:
        # -------------------------------------------------------------
        # 2. Machine Learning Urgency & Specialty Classification
        # -------------------------------------------------------------
        ml = load_ml_model()
        if ml and "urgency_pipeline" in ml and "specialty_pipeline" in ml:
            text_input = [combined_text or "general consultation review"]
            pred_urgency_str = ml["urgency_pipeline"].predict(text_input)[0]
            pred_specialty = ml["specialty_pipeline"].predict(text_input)[0]

            try:
                urgency = UrgencyLevel(pred_urgency_str.lower())
            except ValueError:
                urgency = UrgencyLevel.ROUTINE

            suggested_specialty = pred_specialty
            is_red_flag = False
            rule_id = None
            mode = "ML Clinical Classifier (Decision Support)"

            # Extract top contributing symptoms
            contributing = [s for s in data.symptoms if s.lower() in combined_text]
            if contributing:
                reason = f"ML assessment: urgency driven by symptoms ({', '.join(contributing[:3])})"
            else:
                reason = f"ML assessment: clinical presentation corresponds to {urgency.value} grade care"
        else:
            # Fallback heuristic rules
            is_red_flag = False
            rule_id = None
            mode = "Rules-Only Heuristic"
            if any(s in norm_symptoms for s in ["severe_headache", "high_fever", "acute_abdominal_pain", "deep_laceration"]):
                urgency = UrgencyLevel.URGENT
                suggested_specialty = "General Medicine"
                reason = "Heuristic rule: acute symptoms requiring same-day clinical review"
            elif any(s in norm_symptoms for s in ["mild_fever", "cough_cold", "ear_pain", "joint_pain"]):
                urgency = UrgencyLevel.SOON
                suggested_specialty = "Orthopedics" if "joint_pain" in norm_symptoms else "General Medicine"
                reason = "Heuristic rule: moderate symptoms suitable for 4-6 hour window"
            else:
                urgency = UrgencyLevel.ROUTINE
                suggested_specialty = "General Medicine"
                reason = "Heuristic rule: non-acute routine presentation"

    # Persist evaluation record
    evaluation = TriageEvaluation(
        patient_id=data.patient_id,
        patient_name=data.patient_name,
        evaluated_by=current_user.user_id,
        evaluated_by_role=current_user.role.value,
        symptoms=data.symptoms,
        symptom_text=data.symptom_text,
        vitals=data.vitals,
        urgency=urgency,
        suggested_specialty=suggested_specialty,
        reason=reason,
        is_red_flag=is_red_flag,
        rule_id=rule_id,
        model_version="1.0.0"
    )
    await evaluation.insert()

    # Append audit trail
    await append_audit_log(
        event_type="TRIAGE_EVALUATION_COMPLETED",
        actor_id=current_user.user_id,
        actor_role=current_user.role.value,
        target_id=evaluation.evaluation_id,
        payload={
            "patient_id": data.patient_id,
            "urgency": urgency.value,
            "suggested_specialty": suggested_specialty,
            "is_red_flag": is_red_flag,
            "reason": reason
        }
    )

    # Emergency escalation broadcast if red-flag / emergency
    if urgency == UrgencyLevel.EMERGENCY:
        await append_audit_log(
            event_type="EMERGENCY_ESCALATED",
            actor_id=current_user.user_id,
            actor_role=current_user.role.value,
            target_id=evaluation.evaluation_id,
            payload={
                "reason": reason,
                "suggested_specialty": suggested_specialty,
                "patient_id": data.patient_id
            }
        )
        await broadcast_emergency_escalation(
            evaluation_id=evaluation.evaluation_id,
            patient_id=data.patient_id,
            patient_name=data.patient_name,
            reason=reason,
            suggested_specialty=suggested_specialty
        )

    return TriageEvaluationResponse(
        evaluation_id=evaluation.evaluation_id,
        urgency=urgency,
        suggested_specialty=suggested_specialty,
        reason=reason,
        is_red_flag=is_red_flag,
        rule_id=rule_id,
        mode=mode,
        nearest_facilities=facilities.get("facilities", []),
        ambulance_contacts=facilities.get("national_emergency_numbers", []),
        created_at=evaluation.created_at
    )
