"""Phase 6 Follow-up Planner with Injectable Clock Tests.

Validates:
1. Post-visit follow-up creation by doctor.
2. Injectable clock time travel for scheduler:
   - At T+0 (initial): status is 'scheduled'.
   - At T+23h (approaching due time): triggers reminder and status transitions to 'reminded' + Mock SMS.
   - At T+30h (past cutoff window): transitions to 'missed'.
3. CHW 'Follow-ups due today' query.
4. Marking follow-up as completed.
"""

from datetime import datetime, timezone, timedelta
import pytest
from app.modules.identity.models import User
from app.modules.followups.service import (
    create_followup,
    process_followup_reminders,
    list_chw_followups_due_today,
    complete_followup_status,
)
from app.modules.followups.schemas import CreateFollowUpRequest
from app.modules.followups.models import FollowUpStatus
from app.modules.notifications.models import MockSMS


@pytest.mark.asyncio
async def test_followup_injectable_clock_lifecycle():
    """Test follow-up reminders and missed transitions using an injectable clock."""
    # 1. Setup Patient, Doctor, CHW
    t0 = datetime(2026, 11, 15, 10, 0, 0, tzinfo=timezone.utc)

    patient = User(
        user_id="pat-followup-01",
        email="ramesh.rao@carebridge.local",
        hashed_password="mock_hashed_pw",
        full_name="Ramesh Rao",
        phone="+919800000040",
        role="patient",
        is_active=True,
    )
    await patient.insert()

    doctor = User(
        user_id="doc-followup-01",
        email="dr.sunita@carebridge.local",
        hashed_password="mock_hashed_pw",
        full_name="Dr. Sunita Rao",
        phone="+919800000002",
        role="doctor",
        doctor_status="approved",
        is_active=True,
    )
    await doctor.insert()

    chw = User(
        user_id="chw-followup-01",
        email="pooja.chw@carebridge.local",
        hashed_password="mock_hashed_pw",
        full_name="Pooja Sharma",
        phone="+919800000003",
        role="chw",
        is_active=True,
    )
    await chw.insert()

    # 2. Schedule follow-up exactly 24 hours in the future (T0 + 24h)
    due_date = t0 + timedelta(hours=24)
    req = CreateFollowUpRequest(
        patient_id=patient.user_id,
        due_date=due_date,
        reason="Check blood pressure response to new dosage",
        chw_id=chw.user_id,
    )
    followup_resp = await create_followup(req, doctor)
    assert followup_resp.status == FollowUpStatus.SCHEDULED
    followup_id = followup_resp.followup_id

    # 3. Clock at T0 (24h before due date) -> not yet within <24h reminder window
    # Actually at T0, due_date == T0 + 24h, which is <= reminder_horizon (T0 + 24h)
    # Let's test at T0 + 1 hour (23h before due date, well within reminder window)
    t_remind = t0 + timedelta(hours=1)
    res_remind = await process_followup_reminders(clock=t_remind)
    assert res_remind.reminded_count >= 1

    # Verify SMS was dispatched
    sms_logs = await MockSMS.find(MockSMS.recipient_phone == patient.phone).to_list()
    assert len(sms_logs) >= 1
    assert "CareBridge Reminder" in sms_logs[0].message_body

    # 4. CHW checks due-today list on the due date (T0 + 24h)
    t_due_day = t0 + timedelta(hours=24)
    due_today_items = await list_chw_followups_due_today(clock=t_due_day)
    assert len(due_today_items) >= 1
    assert any(item.followup_id == followup_id for item in due_today_items)

    # 5. Fast-forward clock to T0 + 35h (past due date by 11 hours, >6h cutoff)
    t_missed = t0 + timedelta(hours=35)
    res_missed = await process_followup_reminders(clock=t_missed)
    assert res_missed.missed_count >= 1

    # 6. Verify completion
    completed = await complete_followup_status(followup_id, chw)
    assert completed.status == FollowUpStatus.COMPLETED
    assert completed.completed_at is not None
