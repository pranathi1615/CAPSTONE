"""Beanie Document models for offline synchronization receipts and idempotency tracking.

Enforces:
- Unique index on idempotency_key prevents duplicate writes across multi-device / network replay.
- Append-only receipt tracking for sync auditing.
"""

from datetime import datetime, timezone
from typing import Any, Dict, Optional
import uuid
from beanie import Document
from pydantic import Field
from pymongo import ASCENDING, IndexModel


class SyncReceipt(Document):
    receipt_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    idempotency_key: str = Field(..., description="Unique client idempotency UUID")
    item_type: str = Field(..., description="visit | vitals | note | consent | symptom | voice_note | clinical_record")
    item_id: str = Field(..., description="UUID of the item processed")
    client_id: str = Field(..., description="Client mutation tracking UUID")
    actor_id: str = Field(..., description="User UUID who pushed the mutation")
    status: str = Field(..., description="applied | duplicate | conflict | rejected")
    payload_summary: Optional[Dict[str, Any]] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "sync_receipts"
        indexes = [
            IndexModel([("idempotency_key", ASCENDING)], unique=True),
            IndexModel([("actor_id", ASCENDING), ("created_at", ASCENDING)]),
            IndexModel([("item_type", ASCENDING), ("item_id", ASCENDING)]),
        ]
