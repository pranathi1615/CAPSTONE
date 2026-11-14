"""Notifications service featuring MOCK SMS Provider.

Simulates telecom SMS gateway for weak network environments, logging messages
to MongoDB and server stdout with clear [MOCK] labelling.
"""

from datetime import datetime, timezone
import logging
from typing import List, Optional
from app.modules.notifications.models import MockSMS

logger = logging.getLogger("carebridge.mock_sms")


class MockSMSProvider:
    """MOCK SMS Gateway provider for appointments and queue alerts."""

    @staticmethod
    async def send_sms(
        recipient_phone: str,
        recipient_name: str,
        message: str,
        event_type: str = "GENERAL_NOTIFICATION"
    ) -> MockSMS:
        # Prepend explicit MOCK label to outgoing text
        formatted_body = f"[MOCK SMS - CareBridge] {message}"
        now = datetime.now(timezone.utc)

        sms_record = MockSMS(
            recipient_phone=recipient_phone,
            recipient_name=recipient_name,
            message_body=formatted_body,
            event_type=event_type,
            is_mock=True,
            status="DELIVERED_MOCK",
            timestamp=now
        )
        await sms_record.insert()

        logger.info(
            "[MOCK SMS DISPATCHED] To: %s (%s) | Event: %s | Message: %s",
            recipient_name, recipient_phone, event_type, formatted_body
        )
        return sms_record

    @staticmethod
    async def get_inbox_messages(limit: int = 100) -> List[MockSMS]:
        """Fetch synthetic messages for display in the Dev Inbox UI."""
        return await MockSMS.find().sort("-timestamp").limit(limit).to_list()
