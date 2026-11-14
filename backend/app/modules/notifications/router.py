"""Notifications & Dev Mock Inbox API Router.

Displays sent synthetic SMS messages on the Dev Inbox UI page.
"""

from typing import Any, Dict, List
from fastapi import APIRouter
from app.modules.notifications.service import MockSMSProvider

router = APIRouter(prefix="/notifications", tags=["Notifications (MOCK)"])


@router.get("/mock-inbox", response_model=List[Dict[str, Any]])
async def get_mock_sms_inbox():
    """Dev Inbox endpoint: Returns all sent synthetic SMS alerts with clear MOCK labeling."""
    messages = await MockSMSProvider.get_inbox_messages(limit=100)
    return [
        {
            "sms_id": m.sms_id,
            "recipient_phone": m.recipient_phone,
            "recipient_name": m.recipient_name,
            "message_body": m.message_body,
            "event_type": m.event_type,
            "is_mock": m.is_mock,
            "status": m.status,
            "timestamp": m.timestamp.isoformat()
        }
        for m in messages
    ]
