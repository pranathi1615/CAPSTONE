"""Schemas for the offline synchronization engine (push & pull)."""

from datetime import datetime
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


class SyncPushRequest(BaseModel):
    mutations: List[SyncMutation]


class SyncMutationResult(BaseModel):
    record_id: str
    client_id: str
    status: str     # "applied" | "conflict" | "error"
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
