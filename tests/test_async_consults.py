"""Phase 6 Asynchronous Telehealth Consults Integration Tests.

Validates:
1. Submitting an async consult request with symptoms, notes, photos, and voice notes.
2. Doctor inbox listing showing pending consults with 24h response window.
3. Overdue detection when response time exceeds 24 hours.
4. Doctor reply submission (text, voice note, and optional attached prescription).
5. Notification dispatch (Mock SMS and status update).
"""

from datetime import datetime, timezone, timedelta
import pytest
from app.modules.identity.models import User, DoctorStatus, UserRole
from app.modules.async_consults.models import AsyncConsult, AsyncConsultStatus
from app.modules.notifications.models import MockSMS


@pytest.mark.asyncio
async def test_async_consult_flow(client):
    """Test full asynchronous consultation lifecycle from submission to doctor reply."""
    # 1. Register and login doctor
    reg_doc = await client.post("/auth/register", json={
        "email": "dr.rajesh@carebridge.local",
        "password": "Password@123",
        "full_name": "Dr. Rajesh Sharma",
        "phone": "+919800000001",
        "role": "doctor",
        "registration_number": "MCI-12345",
        "specialty": "General Medicine",
    })
    assert reg_doc.status_code == 201
    doc_id = reg_doc.json()["user_id"]

    # Mark doctor approved
    doc_user = await User.find_one(User.user_id == doc_id)
    doc_user.doctor_status = DoctorStatus.APPROVED
    doc_user.is_on_call = True
    await doc_user.save()

    login_doc = await client.post("/auth/login", json={
        "email": "dr.rajesh@carebridge.local",
        "password": "Password@123",
    })
    doc_headers = {"Authorization": f"Bearer {login_doc.json()['access_token']}"}

    # Register and login patient
    reg_pat = await client.post("/auth/register", json={
        "email": "lakshmi.devi@carebridge.local",
        "password": "Password@123",
        "full_name": "Lakshmi Devi",
        "phone": "+919800000030",
        "role": "patient",
        "language": "te",
    })
    assert reg_pat.status_code == 201
    pat_id = reg_pat.json()["user_id"]

    login_pat = await client.post("/auth/login", json={
        "email": "lakshmi.devi@carebridge.local",
        "password": "Password@123",
    })
    pat_headers = {"Authorization": f"Bearer {login_pat.json()['access_token']}"}

    # 2. Patient submits async consult
    consult_payload = {
        "patient_id": pat_id,
        "patient_name": "Lakshmi Devi",
        "patient_phone": "+919800000030",
        "symptoms": ["skin_rash", "itching"],
        "symptom_text": "Red itchy rash appeared on forearm 2 days ago.",
        "photos": ["/uploads/rash1.jpg"],
        "voice_notes": ["/uploads/patient_audio_01.webm"],
        "assigned_doctor_id": doc_id,
        "specialty": "General Medicine",
    }

    create_resp = await client.post("/async-consults", json=consult_payload, headers=pat_headers)
    assert create_resp.status_code == 201
    consult_data = create_resp.json()
    consult_id = consult_data["consult_id"]
    assert consult_data["status"] == AsyncConsultStatus.SUBMITTED.value
    assert consult_data["patient_name"] == "Lakshmi Devi"

    # 3. Doctor fetches async inbox
    inbox_resp = await client.get("/async-consults/doctor/inbox", headers=doc_headers)
    assert inbox_resp.status_code == 200
    inbox_data = inbox_resp.json()
    assert len(inbox_data) >= 1
    found = next((c for c in inbox_data if c["consult_id"] == consult_id), None)
    assert found is not None
    assert found["is_overdue"] is False

    # 4. Simulate >24h elapsed and verify overdue property
    consult_doc = await AsyncConsult.find_one(AsyncConsult.consult_id == consult_id)
    consult_doc.created_at = datetime.now(timezone.utc) - timedelta(hours=26)
    consult_doc.deadline_at = consult_doc.created_at + timedelta(hours=24)
    await consult_doc.save()

    overdue_resp = await client.get("/async-consults/doctor/inbox", headers=doc_headers)
    assert overdue_resp.status_code == 200
    overdue_item = next(c for c in overdue_resp.json() if c["consult_id"] == consult_id)
    assert overdue_item["is_overdue"] is True

    # 5. Doctor submits reply with diagnosis and prescription
    reply_payload = {
        "reply_text": "Mild contact dermatitis. Apply calamine lotion twice daily. Keep area dry.",
        "voice_note_url": "/uploads/doctor_advice.webm",
        "prescription_id": "rx-mock-001",
    }
    reply_resp = await client.post(f"/async-consults/{consult_id}/reply", json=reply_payload, headers=doc_headers)
    assert reply_resp.status_code == 200
    replied_data = reply_resp.json()
    assert replied_data["status"] == AsyncConsultStatus.REPLIED.value
    assert replied_data["doctor_reply_text"] == reply_payload["reply_text"]

    # 6. Verify Mock SMS was sent to patient
    sms_logs = await MockSMS.find(MockSMS.recipient_phone == "+919800000030").to_list()
    assert len(sms_logs) >= 1
    assert any("Dr. Rajesh Sharma" in s.message_body for s in sms_logs)
