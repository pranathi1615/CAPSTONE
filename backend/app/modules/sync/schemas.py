"""Schemas for the offline synchronization engine (POST /sync batch processor)."""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

from app.modules.clinical.schemas import ClinicalRecordResponse


class SyncMutation(BaseModel):
    client_id: str = Field(..., description="Unique client mutation UUID")
    record_id: str = Field(..., description="Target record UUID")
    patient_id: str
    doctor_id: Optional[str] = None
    record_type: str = Field(..., description="condition | observation | allergy")
    data: Dict[str, Any]
    client_version: int = Field(default=1, ge=0, description="Base version known to client when mutation was created")
    client_timestamp: datetime = Field(..., description="When the mutation was committed in local Dexie store")
    mutation_type: str = Field(default="upsert", description="create | update | delete")
    is_deleted: bool = False
    idempotency_key: Optional[str] = None


class SyncPushRequest(BaseModel):
    mutations: List[SyncMutation]


class SyncBatchItem(BaseModel):
    idempotency_key: str = Field(..., description="Unique client idempotency UUID")
    client_id: str = Field(..., description="Client mutation tracking UUID")
    item_type: str = Field(..., description="visit | vitals | note | consent | symptom | voice_note | clinical_record")
    item_id: str = Field(..., description="Entity UUID")
    payload: Dict[str, Any]
    client_version: int = Field(default=1, ge=0)
    client_timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class SyncBatchRequest(BaseModel):
    batch: Optional[List[SyncBatchItem]] = None
    mutations: Optional[List[SyncMutation]] = None


class SyncBatchItemResult(BaseModel):
    idempotency_key: str
    item_id: str
    item_type: str
    status: str  # "applied" | "duplicate" | "conflict" | "rejected"
    message: Optional[str] = None
    server_document: Optional[Dict[str, Any]] = None
    server_version: Optional[int] = None


class SyncBatchResponse(BaseModel):
    processed: int
    applied: int
    duplicates: int
    conflicts: int
    rejected: int
    results: List[SyncBatchItemResult]
    server_timestamp: datetime


class SyncMutationResult(BaseModel):
    record_id: str
    client_id: str
    status: str     # "applied" | "conflict" | "error" | "duplicate"
    server_version: int
    server_document: Optional[Dict[str, Any]] = None
    message: Optional[str] = None


class SyncPushResponse(BaseModel):
    processed: int
    applied: int
    conflicts: int
    results: List[SyncMutationResult]
    server_timestamp: datetime


class SyncPullResponse(BaseModel):
    records: List[ClinicalRecordResponse]
    server_timestamp: datetime
    count: int
