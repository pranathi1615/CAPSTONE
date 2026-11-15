"""Service layer for Patient Follow-up Scheduling and Reminders (Phase 6).

Implements:
- Post-visit follow-up scheduling by doctors.
- Injectable clock for scheduler and deterministic testing.
- Automated reminder dispatch (MOCK SMS + WebSocket).
- Missed follow-up transition.
- CHW 'Follow-ups due today' list.
"""

from datetime import datetime, timedelta, timezone
import logging
from typing import List, Optional
from fastapi import HTTPException, status

from app.modules.audit.service import append_audit_log
from app.modules.chat.websocket_manager import ws_manager
from app.modules.followups.models import FollowUp, FollowUpStatus
from app.modules.followups.schemas import (
    CreateFollowUpRequest,
    FollowUpResponse,
    ProcessRemindersResult,
)
from app.modules.identity.models import User, UserRole
from app.modules.notifications.service import MockSMSProvider

logger = logging.getLogger("carebridge.followups")


def followup_to_response(f: FollowUp) -> FollowUpResponse:
    return FollowUpResponse(
        followup_id=f.followup_id,
        booking_id=f.booking_id,
        patient_id=f.patient_id,
        patient_name=f.patient_name,
        patient_phone=f.patient_phone,
        doctor_id=f.doctor_id,
        doctor_name=f.doctor_name,
        due_date=f.due_date,
        reason=f.reason,
        status=f.status,
        chw_id=f.chw_id,
        reminder_sent_at=f.reminder_sent_at,
        completed_at=f.completed_at,
        created_at=f.created_at,
    )


async def create_followup(data: CreateFollowUpRequest, doctor: User) -> FollowUpResponse:
    patient = await User.find_one(User.user_id == data.patient_id)
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target patient not found.")

    followup = FollowUp(
        booking_id=data.booking_id,
        patient_id=patient.user_id,
        patient_name=patient.full_name,
        patient_phone=patient.phone,
        doctor_id=doctor.user_id,
        doctor_name=doctor.full_name,
        due_date=data.due_date,
        reason=data.reason,
        status=FollowUpStatus.SCHEDULED,
        chw_id=data.chw_id,
    )
    await followup.insert()

    # Append audit trail
    await append_audit_log(
        event_type="FOLLOWUP_SCHEDULED",
        actor_id=doctor.user_id,
        actor_role=doctor.role.value,
        target_id=followup.followup_id,
        payload={
            "patient_id": patient.user_id,
            "due_date": data.due_date.isoformat(),
            "reason": data.reason
        }
    )

    return followup_to_response(followup)


async def process_followup_reminders(clock: Optional[datetime] = None) -> ProcessRemindersResult:
    """Scan and process due reminders and mark missed visits with an injectable clock."""
    now = clock if clock is not None else datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)

    # 1. Reminders: follow-ups scheduled for within the next 24 hours
    reminder_horizon = now + timedelta(days=1)
    to_remind = await FollowUp.find(
        FollowUp.status == FollowUpStatus.SCHEDULED,
        FollowUp.due_date <= reminder_horizon,
        FollowUp.due_date >= now - timedelta(hours=1)
    ).to_list()

    reminded_count = 0
    for f in to_remind:
        f.status = FollowUpStatus.REMINDED
        f.reminder_sent_at = now
        f.updated_at = now
        await f.save()
        reminded_count += 1

        # MOCK SMS
        if f.patient_phone:
            due_str = f.due_date.strftime("%d %b %Y")
            msg = f"CareBridge Reminder: You have a scheduled follow-up with Dr. {f.doctor_name} on {due_str} for: {f.reason}."
            await MockSMSProvider.send_sms(
                recipient_phone=f.patient_phone,
                recipient_name=f.patient_name,
                message=msg,
                event_type="FOLLOWUP_REMINDER_SMS"
            )

        # In-app WebSocket notification
        await ws_manager.broadcast_envelope(
            room=f"patient_{f.patient_id}",
            msg_type="followup_reminder",
            payload={
                "followup_id": f.followup_id,
                "doctor_name": f.doctor_name,
                "due_date": f.due_date.isoformat(),
                "reason": f.reason
            }
        )

    # 2. Mark missed follow-ups: past due_date and still in SCHEDULED or REMINDED state
    past_due_cutoff = now - timedelta(hours=6)
    missed_items = await FollowUp.find(
        {"status": {"$in": [FollowUpStatus.SCHEDULED.value, FollowUpStatus.REMINDED.value]}},
        FollowUp.due_date < past_due_cutoff
    ).to_list()

    missed_count = 0
    for m in missed_items:
        m.status = FollowUpStatus.MISSED
        m.updated_at = now
        await m.save()
        missed_count += 1

        await append_audit_log(
            event_type="FOLLOWUP_MISSED",
            actor_id="system",
            actor_role="scheduler",
            target_id=m.followup_id,
            payload={
                "patient_id": m.patient_id,
                "due_date": m.due_date.isoformat()
            }
        )

    return ProcessRemindersResult(
        reminded_count=reminded_count,
        missed_count=missed_count,
        processed_at=now
    )


async def list_chw_followups_due_today(clock: Optional[datetime] = None) -> List[FollowUpResponse]:
    """Retrieve follow-ups scheduled for today for CHW community health surveillance."""
    now = clock if clock is not None else datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)

    start_of_day = datetime(now.year, now.month, now.day, 0, 0, 0, tzinfo=timezone.utc)
    end_of_day = datetime(now.year, now.month, now.day, 23, 59, 59, tzinfo=timezone.utc)

    followups = await FollowUp.find(
        FollowUp.due_date >= start_of_day,
        FollowUp.due_date <= end_of_day,
        {"status": {"$in": [FollowUpStatus.SCHEDULED.value, FollowUpStatus.REMINDED.value, FollowUpStatus.MISSED.value]}}
    ).sort("+due_date").to_list()

    return [followup_to_response(f) for f in followups]


async def complete_followup_status(followup_id: str, actor: User) -> FollowUpResponse:
    followup = await FollowUp.find_one(FollowUp.followup_id == followup_id)
    if not followup:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Follow-up not found.")

    now = datetime.now(timezone.utc)
    followup.status = FollowUpStatus.COMPLETED
    followup.completed_at = now
    followup.updated_at = now
    await followup.save()

    await append_audit_log(
        event_type="FOLLOWUP_COMPLETED",
        actor_id=actor.user_id,
        actor_role=actor.role.value,
        target_id=followup.followup_id,
        payload={"completed_at": now.isoformat()}
    )

    return followup_to_response(followup)
