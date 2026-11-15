"""Phase 6 Clinical Referral Notes and PDF Generation Tests.

Validates:
1. Generation of clinical referral note to nearest emergency facility.
2. PDF stream rendering via ReportLab with '%PDF-' magic header.
3. Content-Type application/pdf on GET /api/referrals/{id}/pdf.
4. Tamper-evident audit logging for REFERRAL_NOTE_GENERATED.
"""

import pytest
from app.modules.identity.models import User
from app.modules.referrals.service import create_referral_note, generate_referral_pdf
from app.modules.referrals.schemas import CreateReferralRequest
from app.modules.audit.models import AuditLog


@pytest.mark.asyncio
async def test_referral_note_creation_and_pdf_generation(client):
    """Test generating a clinical referral note and downloading the PDF."""
    patient = User(
        user_id="pat-referral-01",
        email="anjali.rao@carebridge.local",
        hashed_password="mock_hashed_pw",
        full_name="Anjali Rao",
        phone="+919800000050",
        role="patient",
        is_active=True,
    )
    await patient.insert()

    # Register CHW
    reg_chw = await client.post("/auth/register", json={
        "email": "pooja.referral@carebridge.local",
        "password": "Password@123",
        "full_name": "Pooja Sharma",
        "phone": "+919800000003",
        "role": "chw",
    })
    assert reg_chw.status_code == 201
    chw_id = reg_chw.json()["user_id"]
    chw = await User.find_one(User.user_id == chw_id)

    # Login CHW for endpoint authentication
    login = await client.post("/auth/login", json={
        "email": "pooja.referral@carebridge.local",
        "password": "Password@123",
    })
    chw_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    # 1. Create referral note via service
    req = CreateReferralRequest(
        patient_id=patient.user_id,
        facility_id="fac-001",
        urgency="emergency",
        clinical_summary="Sudden onset severe chest pain with profuse sweating. Suspected acute myocardial infarction.",
        vitals={"pulse": 115, "systolic_bp": 175, "spo2": 94},
        red_flags_identified="Chest Pain + Sweating",
        transport_mode="Ambulance 108",
    )
    ref_resp = await create_referral_note(req, chw)
    assert ref_resp.referral_id is not None
    assert ref_resp.patient_name == "Anjali Rao"
    assert ref_resp.urgency == "emergency"
    assert "District Area Government Hospital" in ref_resp.facility_name

    # 2. Test PDF byte generation directly
    from app.modules.referrals.models import ReferralNote
    note_doc = await ReferralNote.find_one(ReferralNote.referral_id == ref_resp.referral_id)
    pdf_bytes = generate_referral_pdf(note_doc)
    assert isinstance(pdf_bytes, bytes)
    assert len(pdf_bytes) > 500
    assert pdf_bytes.startswith(b"%PDF-"), "Generated file does not match PDF magic byte signature!"

    # 3. Test HTTP endpoint GET /referrals/{id}/pdf
    http_resp = await client.get(f"/referrals/{ref_resp.referral_id}/pdf", headers=chw_headers)
    assert http_resp.status_code == 200
    assert http_resp.headers["content-type"] == "application/pdf"
    assert http_resp.content.startswith(b"%PDF-")
    assert "attachment; filename=" in http_resp.headers.get("content-disposition", "")

    # 4. Verify audit trail
    logs = await AuditLog.find(AuditLog.target_id == ref_resp.referral_id).to_list()
    assert len(logs) >= 1
    assert logs[0].event_type == "REFERRAL_NOTE_GENERATED"
    assert logs[0].actor_id == chw.user_id
