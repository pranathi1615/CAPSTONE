"""Phase 6 Triage Evaluation Unit & Integration Tests.

Validates:
1. Deterministic red-flag absolute priority over ML predictions.
2. 100% of red-flag clinical vignettes reach 'emergency' urgency.
3. Confusion matrix and overall agreement across all 50 vignettes.
4. Tri-lingual decision support notices (en, hi, te) emphasizing non-diagnostic nature.
5. REST endpoints: POST /api/triage/evaluate, GET /api/triage/rules, GET /api/triage/facilities.
"""

import json
from pathlib import Path
import pytest
from app.modules.triage.service import evaluate_clinical_triage
from app.modules.triage.schemas import TriageEvaluationRequest
from app.modules.identity.models import User, UserRole


@pytest.fixture
def mock_chw_user():
    return User(
        user_id="test-chw-actor-01",
        email="pooja.chw@carebridge.local",
        hashed_password="mock_hashed_password_123",
        full_name="Pooja Sharma",
        phone="+919800000003",
        role=UserRole.CHW,
        is_active=True,
    )


@pytest.mark.asyncio
async def test_triage_red_flag_cases_reach_100_percent_emergency(mock_chw_user):
    """Verify that every single red-flag vignette in triage_cases.json reaches 'emergency'."""
    cases_path = Path(__file__).parent / "triage_cases.json"
    with open(cases_path, "r", encoding="utf-8") as f:
        cases = json.load(f)

    red_flag_cases = [c for c in cases if c.get("is_red_flag") is True or c.get("expected_urgency") == "emergency"]
    assert len(red_flag_cases) >= 15, "Expected at least 15 red-flag test vignettes"

    emergency_count = 0
    for c in red_flag_cases:
        req = TriageEvaluationRequest(
            patient_id="test-patient-vignette",
            symptoms=c.get("symptoms", []),
            vitals=c.get("vitals", {}),
            symptom_text=c.get("text", ""),
        )
        res = await evaluate_clinical_triage(req, mock_chw_user)
        assert res.urgency == "emergency", (
            f"Vignette {c['id']} failed red flag! Expected emergency, got {res.urgency}. "
            f"Reason: {res.reason}, Symptoms: {c.get('symptoms')}"
        )
        assert res.is_red_flag is True
        emergency_count += 1

    escalation_rate = (emergency_count / len(red_flag_cases)) * 100.0
    print(f"\n[TRIAGE EVALUATION] Red-flag Emergency Escalation Rate: {escalation_rate:.1f}% ({emergency_count}/{len(red_flag_cases)})")
    assert escalation_rate == 100.0, "Safety violation: Not all red-flag cases reached emergency!"


@pytest.mark.asyncio
async def test_triage_all_50_cases_agreement_and_confusion_matrix(mock_chw_user):
    """Run all 50 test cases, compute agreement and print confusion matrix."""
    cases_path = Path(__file__).parent / "triage_cases.json"
    with open(cases_path, "r", encoding="utf-8") as f:
        cases = json.load(f)

    assert len(cases) == 50, f"Expected exactly 50 test cases, found {len(cases)}"

    urgency_levels = ["emergency", "urgent", "soon", "routine"]
    confusion_matrix = {exp: {pred: 0 for pred in urgency_levels} for exp in urgency_levels}

    correct_predictions = 0
    safe_escalations = 0  # Where predicted urgency is at least as urgent as expected

    urgency_ranks = {"routine": 1, "soon": 2, "urgent": 3, "emergency": 4}

    for c in cases:
        req = TriageEvaluationRequest(
            patient_id="test-patient-confusion-matrix",
            symptoms=c.get("symptoms", []),
            vitals=c.get("vitals", {}),
            symptom_text=c.get("text", ""),
        )
        res = await evaluate_clinical_triage(req, mock_chw_user)
        expected = c["expected_urgency"]
        predicted = res.urgency

        confusion_matrix[expected][predicted] += 1

        if predicted == expected:
            correct_predictions += 1

        # Clinical safety check: predicted should never be under-triaged for red-flags
        if urgency_ranks[predicted] >= urgency_ranks[expected]:
            safe_escalations += 1

    overall_agreement = (correct_predictions / len(cases)) * 100.0
    safe_rate = (safe_escalations / len(cases)) * 100.0

    print("\n" + "=" * 55)
    print("TRIAGE CONFUSION MATRIX (Row = Expected, Col = Predicted):")
    header = f"{'Expected':<12} | " + " | ".join([f"{u:<9}" for u in urgency_levels])
    print(header)
    print("-" * len(header))
    for exp in urgency_levels:
        row_str = f"{exp:<12} | " + " | ".join([f"{confusion_matrix[exp][pred]:<9}" for pred in urgency_levels])
        print(row_str)
    print("=" * 55)
    print(f"Overall Exact Agreement: {overall_agreement:.1f}% ({correct_predictions}/50)")
    print(f"Safe Escalation Rate (no under-triage): {safe_rate:.1f}% ({safe_escalations}/50)")
    print("=" * 55)

    # In clinical decision support, exact agreement should be high (>= 75%) and safe rate >= 90%
    assert overall_agreement >= 75.0, f"Overall agreement too low: {overall_agreement}%"
    assert safe_rate >= 90.0, f"Clinical under-triage rate too high! Safe rate: {safe_rate}%"


@pytest.mark.asyncio
async def test_triage_decision_support_trilingual_notices(mock_chw_user):
    """Verify decision support notices in en, hi, and te are always present and non-diagnostic."""
    req = TriageEvaluationRequest(
        patient_id="patient-notice-check",
        symptoms=["fever", "cough"],
        vitals={"temperature": 38.0},
        symptom_text="Mild cold and cough for two days",
    )
    res = await evaluate_clinical_triage(req, mock_chw_user)

    assert res.notice is not None
    assert "en" in res.notice
    assert "hi" in res.notice
    assert "te" in res.notice

    # Verify notice states it is decision support and NOT a formal medical diagnosis
    assert "Decision support only" in res.notice["en"] or "qualified doctor" in res.notice["en"]
    assert "निर्णय समर्थन" in res.notice["hi"] or "डॉक्टर" in res.notice["hi"]
    assert "వైద్యు" in res.notice["te"] or "నిర్ణయ" in res.notice["te"]


@pytest.mark.asyncio
async def test_triage_endpoints(client):
    """Test REST API endpoints for triage evaluation, rules, and emergency facilities."""
    reg = await client.post("/auth/register", json={
        "email": "triage.tester@carebridge.local",
        "password": "Password@123",
        "full_name": "Triage Tester",
        "role": "chw",
    })
    assert reg.status_code == 201
    login = await client.post("/auth/login", json={
        "email": "triage.tester@carebridge.local",
        "password": "Password@123",
    })
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    # 1. GET /triage/rules
    rules_resp = await client.get("/triage/rules", headers=headers)
    assert rules_resp.status_code == 200
    rules_data = rules_resp.json()
    assert "red_flag_rules" in rules_data
    assert len(rules_data["red_flag_rules"]) >= 8

    # 2. GET /triage/facilities
    fac_resp = await client.get("/triage/facilities", headers=headers)
    assert fac_resp.status_code == 200
    fac_data = fac_resp.json()
    assert "facilities" in fac_data
    assert len(fac_data["facilities"]) >= 3
    assert any(n["number"] == "108" for n in fac_data.get("national_emergency_numbers", []))

    # 3. POST /triage/evaluate with emergency red-flag
    eval_resp = await client.post(
        "/triage/evaluate",
        headers=headers,
        json={
            "patient_id": "test-patient-api-redflag",
            "symptoms": ["chest_pain", "sweating"],
            "vitals": {"pulse": 110},
            "symptom_text": "Sudden heavy chest tightness with sweating",
        },
    )
    assert eval_resp.status_code == 200
    eval_data = eval_resp.json()
    assert eval_data["urgency"] == "emergency"
    assert eval_data["is_red_flag"] is True
    assert eval_data["suggested_specialty"] == "Cardiology"
    assert len(eval_data["nearest_facilities"]) >= 1
    assert len(eval_data["nearest_facilities"]) >= 1
