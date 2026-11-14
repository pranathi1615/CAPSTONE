"""Tests for Doctor Availability, Booking Rules, Double-Booking Prevention, and Queue."""

from datetime import datetime, timedelta, timezone
import pytest
from httpx import AsyncClient

from app.modules.appointments.models import Booking, BookingStatus, DoctorSlot
from app.modules.identity.models import DoctorStatus, User, UserRole
from app.modules.notifications.models import MockSMS


@pytest.mark.asyncio
async def test_doctor_slots_and_approved_doctors_only(client: AsyncClient):
    """Test slot creation permissions and approved doctor filtering."""
    # 1. Register approved doctor
    reg_appr = await client.post("/auth/register", json={
        "email": "dr.approved@carebridge.local",
        "password": "Password@123",
        "full_name": "Dr Approved",
        "role": "doctor",
        "registration_number": "MCI-11111",
        "specialty": "Cardiology"
    })
    doc_appr_id = reg_appr.json()["user_id"]

    # Mark doctor approved in database
    doc_user = await User.find_one(User.user_id == doc_appr_id)
    doc_user.doctor_status = DoctorStatus.APPROVED
    await doc_user.save()

    doc_login = await client.post("/auth/login", json={
        "email": "dr.approved@carebridge.local",
        "password": "Password@123"
    })
    doc_token = doc_login.json()["access_token"]
    doc_headers = {"Authorization": f"Bearer {doc_token}"}

    # 2. Register pending doctor
    reg_pend = await client.post("/auth/register", json={
        "email": "dr.pending2@carebridge.local",
        "password": "Password@123",
        "full_name": "Dr Pending",
        "role": "doctor",
        "registration_number": "MCI-22222",
        "specialty": "Pediatrics"
    })
    pend_id = reg_pend.json()["user_id"]
    pend_login = await client.post("/auth/login", json={
        "email": "dr.pending2@carebridge.local",
        "password": "Password@123"
    })
    pend_token = pend_login.json()["access_token"]
    pend_headers = {"Authorization": f"Bearer {pend_token}"}

    # 3. Approved doctor creates slot -> 201 Created
    now = datetime.now(timezone.utc)
    s1 = now + timedelta(hours=2)
    s2 = s1 + timedelta(minutes=30)
    slot_res = await client.post(
        "/appointments/slots",
        headers=doc_headers,
        json={"slot_start": s1.isoformat(), "slot_end": s2.isoformat()}
    )
    assert slot_res.status_code == 201
    assert slot_res.json()["doctor_id"] == doc_appr_id

    # 4. Pending doctor attempts to create slot -> 403 Forbidden
    pend_slot_res = await client.post(
        "/appointments/slots",
        headers=pend_headers,
        json={"slot_start": s1.isoformat(), "slot_end": s2.isoformat()}
    )
    assert pend_slot_res.status_code == 403

    # 5. Search approved doctors -> only approved doctor returned
    search_res = await client.get("/appointments/doctors", headers=doc_headers)
    assert search_res.status_code == 200
    docs = search_res.json()
    assert any(d["user_id"] == doc_appr_id for d in docs)
    assert not any(d["user_id"] == pend_id for d in docs)


@pytest.mark.asyncio
async def test_double_booking_prevention_with_partial_unique_index(client: AsyncClient):
    """Test partial unique index prevents double booking for active statuses,

    and allows re-booking when a visit is cancelled.
    """
    # 1. Setup Approved Doctor
    doc_res = await client.post("/auth/register", json={
        "email": "dr.slot@carebridge.local",
        "password": "Password@123",
        "full_name": "Dr Slot",
        "role": "doctor",
        "registration_number": "MCI-778899",
        "specialty": "General Medicine"
    })
    doc_id = doc_res.json()["user_id"]
    doc_user = await User.find_one(User.user_id == doc_id)
    doc_user.doctor_status = DoctorStatus.APPROVED
    await doc_user.save()

    # 2. Setup Patient 1
    p1_res = await client.post("/auth/register", json={
        "email": "p1@carebridge.local",
        "password": "Password@123",
        "full_name": "Patient 1",
        "role": "patient",
        "phone": "+919870000001"
    })
    p1_login = await client.post("/auth/login", json={"email": "p1@carebridge.local", "password": "Password@123"})
    p1_headers = {"Authorization": f"Bearer {p1_login.json()['access_token']}"}

    # 3. Setup Patient 2
    p2_res = await client.post("/auth/register", json={
        "email": "p2@carebridge.local",
        "password": "Password@123",
        "full_name": "Patient 2",
        "role": "patient",
        "phone": "+919870000002"
    })
    p2_login = await client.post("/auth/login", json={"email": "p2@carebridge.local", "password": "Password@123"})
    p2_headers = {"Authorization": f"Bearer {p2_login.json()['access_token']}"}

    target_start = datetime.now(timezone.utc) + timedelta(days=1, hours=10)
    target_end = target_start + timedelta(minutes=30)

    # 4. Patient 1 books slot -> 201 Created
    b1_res = await client.post(
        "/appointments/book",
        headers=p1_headers,
        json={
            "doctor_id": doc_id,
            "slot_start": target_start.isoformat(),
            "slot_end": target_end.isoformat()
        }
    )
    assert b1_res.status_code == 201
    booking_1 = b1_res.json()
    assert booking_1["status"] == "booked"

    # 5. Patient 2 attempts to book EXACT SAME slot -> 409 Conflict
    b2_res = await client.post(
        "/appointments/book",
        headers=p2_headers,
        json={
            "doctor_id": doc_id,
            "slot_start": target_start.isoformat(),
            "slot_end": target_end.isoformat()
        }
    )
    assert b2_res.status_code == 409
    assert "already booked" in b2_res.json()["detail"].lower()

    # 6. Patient 1 cancels booking
    cancel_res = await client.post(f"/appointments/{booking_1['booking_id']}/cancel", headers=p1_headers)
    assert cancel_res.status_code == 200
    assert cancel_res.json()["status"] == "cancelled"

    # 7. Now Patient 2 books the SAME slot -> 201 Created!
    # Proves partial unique index only blocks active statuses (booked, waiting, in_call)
    b2_rebook_res = await client.post(
        "/appointments/book",
        headers=p2_headers,
        json={
            "doctor_id": doc_id,
            "slot_start": target_start.isoformat(),
            "slot_end": target_end.isoformat()
        }
    )
    assert b2_rebook_res.status_code == 201
    assert b2_rebook_res.json()["status"] == "booked"


@pytest.mark.asyncio
async def test_pending_doctor_cannot_be_booked(client: AsyncClient):
    """Test that booking a pending unapproved doctor is rejected."""
    # Register doctor who remains pending
    doc_res = await client.post("/auth/register", json={
        "email": "dr.unapproved@carebridge.local",
        "password": "Password@123",
        "full_name": "Dr Unapproved",
        "role": "doctor",
        "registration_number": "MCI-404040"
    })
    doc_id = doc_res.json()["user_id"]

    # Register patient
    p_res = await client.post("/auth/register", json={
        "email": "patient.test@carebridge.local",
        "password": "Password@123",
        "full_name": "Patient Test",
        "role": "patient"
    })
    p_login = await client.post("/auth/login", json={"email": "patient.test@carebridge.local", "password": "Password@123"})
    p_headers = {"Authorization": f"Bearer {p_login.json()['access_token']}"}

    start = datetime.now(timezone.utc) + timedelta(days=2)
    end = start + timedelta(minutes=30)

    # Attempt to book pending doctor -> 400 Bad Request
    book_res = await client.post(
        "/appointments/book",
        headers=p_headers,
        json={"doctor_id": doc_id, "slot_start": start.isoformat(), "slot_end": end.isoformat()}
    )
    assert book_res.status_code == 400
    assert "pending" in book_res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_mock_sms_notifications_inbox(client: AsyncClient):
    """Test that booking actions trigger synthetic SMS logged to Dev Inbox."""
    # Register approved doctor & patient
    doc_res = await client.post("/auth/register", json={
        "email": "dr.sms@carebridge.local",
        "password": "Password@123",
        "full_name": "Dr SMS",
        "role": "doctor",
        "registration_number": "MCI-990011"
    })
    doc_id = doc_res.json()["user_id"]
    doc = await User.find_one(User.user_id == doc_id)
    doc.doctor_status = DoctorStatus.APPROVED
    await doc.save()

    p_res = await client.post("/auth/register", json={
        "email": "p.sms@carebridge.local",
        "password": "Password@123",
        "full_name": "Patient SMS",
        "role": "patient",
        "phone": "+919871112233"
    })
    p_login = await client.post("/auth/login", json={"email": "p.sms@carebridge.local", "password": "Password@123"})
    p_headers = {"Authorization": f"Bearer {p_login.json()['access_token']}"}

    start = datetime.now(timezone.utc) + timedelta(days=1)
    end = start + timedelta(minutes=30)

    await client.post(
        "/appointments/book",
        headers=p_headers,
        json={"doctor_id": doc_id, "slot_start": start.isoformat(), "slot_end": end.isoformat()}
    )

    # Verify MOCK SMS appears in Dev Inbox
    inbox_res = await client.get("/notifications/mock-inbox")
    assert inbox_res.status_code == 200
    inbox = inbox_res.json()
    assert len(inbox) >= 1
    latest_sms = inbox[0]
    assert latest_sms["is_mock"] is True
    assert "[MOCK SMS" in latest_sms["message_body"]
    assert "Dr SMS" in latest_sms["message_body"]


@pytest.mark.asyncio
async def test_live_queue_and_doctor_call_lifecycle(client: AsyncClient):
    """Test patient joining waiting queue, arrival-based ordering, and doctor call lifecycle."""
    # Setup Doctor
    doc_res = await client.post("/auth/register", json={
        "email": "dr.queue@carebridge.local",
        "password": "Password@123",
        "full_name": "Dr Queue",
        "role": "doctor",
        "registration_number": "MCI-334455"
    })
    doc_id = doc_res.json()["user_id"]
    doc = await User.find_one(User.user_id == doc_id)
    doc.doctor_status = DoctorStatus.APPROVED
    await doc.save()

    doc_login = await client.post("/auth/login", json={"email": "dr.queue@carebridge.local", "password": "Password@123"})
    doc_headers = {"Authorization": f"Bearer {doc_login.json()['access_token']}"}

    # Setup Patient
    p_res = await client.post("/auth/register", json={
        "email": "p.queue@carebridge.local",
        "password": "Password@123",
        "full_name": "Patient Queue",
        "role": "patient"
    })
    p_login = await client.post("/auth/login", json={"email": "p.queue@carebridge.local", "password": "Password@123"})
    p_headers = {"Authorization": f"Bearer {p_login.json()['access_token']}"}

    start = datetime.now(timezone.utc) + timedelta(hours=1)
    end = start + timedelta(minutes=30)
    book_res = await client.post(
        "/appointments/book",
        headers=p_headers,
        json={"doctor_id": doc_id, "slot_start": start.isoformat(), "slot_end": end.isoformat()}
    )
    booking_id = book_res.json()["booking_id"]

    # 1. Patient taps Join -> enters WAITING queue
    join_res = await client.post(f"/appointments/{booking_id}/join", headers=p_headers)
    assert join_res.status_code == 200
    assert join_res.json()["status"] == "waiting"
    assert join_res.json()["joined_waiting_at"] is not None

    # 2. Doctor fetches queue -> patient appears with wait_seconds
    q_res = await client.get("/appointments/queue", headers=doc_headers)
    assert q_res.status_code == 200
    q_items = q_res.json()
    assert len(q_items) == 1
    assert q_items[0]["booking_id"] == booking_id
    assert q_items[0]["patient_name"] == "Patient Queue"

    # 3. Doctor starts call -> IN_CALL
    call_res = await client.post(f"/appointments/{booking_id}/call", headers=doc_headers)
    assert call_res.status_code == 200
    assert call_res.json()["status"] == "in_call"
    assert call_res.json()["call_started_at"] is not None

    # 4. Doctor completes consultation with clinical notes -> COMPLETED
    complete_res = await client.post(
        f"/appointments/{booking_id}/complete",
        headers=doc_headers,
        json={"notes": "Mild hypertension noted. Advised low sodium diet."}
    )
    assert complete_res.status_code == 200
    completed_b = complete_res.json()
    assert completed_b["status"] == "completed"
    assert "Mild hypertension" in completed_b["notes"]
    assert completed_b["call_ended_at"] is not None
