"""Audit Log model using Beanie.

Append-only cryptographic chain for compliance and non-repudiation.
Each document has a monotonically increasing sequence (seq), the previous
block's hash, and its own SHA-256 hash.
Unique index on 'seq' ensures the chain cannot fork under concurrent appends.
"""

from datetime import datetime, timezone
from typing import Any, Dict, Optional

from beanie import Document
from pydantic import Field
from pymongo import ASCENDING, IndexModel


class AuditLog(Document):
    seq: int
    prev_hash: str
    hash: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    event_type: str  # e.g. "USER_LOGIN", "USER_REGISTER", "CONSENT_GRANTED", "CONSENT_REVOKED", "DOCTOR_APPROVED"
    actor_id: str
    actor_role: str
    target_id: Optional[str] = None
    payload: Dict[str, Any] = Field(default_factory=dict)

    class Settings:
        name = "audit_log"
        indexes = [
            IndexModel([("seq", ASCENDING)], unique=True),
            IndexModel([("event_type", ASCENDING)]),
            IndexModel([("actor_id", ASCENDING)]),
            IndexModel([("target_id", ASCENDING)]),
        ]
