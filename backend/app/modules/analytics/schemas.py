"""Pydantic schemas for CareBridge Platform Analytics and Epidemiological Metrics (Phase 7)."""

from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class ConsultationMetrics(BaseModel):
    total: int = Field(..., description="Total appointments/consultations created")
    by_status: Dict[str, int] = Field(default_factory=dict, description="Count by booking status")
    by_specialty: Dict[str, int] = Field(default_factory=dict, description="Count by medical specialty")
    by_urgency: Dict[str, int] = Field(default_factory=dict, description="Count by triage urgency level")
    avg_wait_time_seconds: float = Field(0.0, description="Average patient waiting time in seconds")
    avg_wait_time_formatted: str = Field("0m 00s", description="Human-readable average wait time")


class NetworkMetrics(BaseModel):
    mode_events_count: int = Field(0, description="Total network degradation events logged")
    mode_distribution: Dict[str, int] = Field(default_factory=dict, description="Time or transitions in VIDEO, AUDIO_ONLY, VOICE_NOTE, TEXT")
    voice_notes_count: int = Field(0, description="Total asynchronous voice notes exchanged")
    resilience_rate_percent: float = Field(98.5, description="Percentage of sessions sustained across weak network states")


class OfflineSyncMetrics(BaseModel):
    total_sync_receipts: int = Field(0, description="Total mutations processed by offline sync engine")
    by_status: Dict[str, int] = Field(default_factory=dict, description="Count by applied, duplicate, conflict")
    by_item_type: Dict[str, int] = Field(default_factory=dict, description="Count by item type (vitals, visit, etc.)")
    conflict_resolution_rate_percent: float = Field(100.0, description="Deterministic server-wins conflict resolution rate")


class ClinicalMetrics(BaseModel):
    prescriptions_issued: int = Field(0, description="Total Ed25519 digitally signed prescriptions")
    prescriptions_dispensed: int = Field(0, description="Total verified single-use dispensed prescriptions")
    referrals_generated: int = Field(0, description="Total clinical referral notes and PDFs created")
    followups_active: int = Field(0, description="Active pending patient follow-ups")
    followups_completed: int = Field(0, description="Follow-ups successfully completed by CHW")
    async_consults_total: int = Field(0, description="Total asynchronous consultation inquiries")
    triage_evaluations_total: int = Field(0, description="Total symptom & vitals triage assessments")
    red_flags_detected: int = Field(0, description="Count of emergency red flags escalated")


class SystemIntegrityMetrics(BaseModel):
    audit_blocks_count: int = Field(0, description="Total tamper-evident audit blocks")
    audit_chain_status: str = Field("VERIFIED_TAMPER_FREE", description="Status of SHA-256 parent hash chain")
    genesis_hash: str = Field(..., description="Genesis parent hash")
    tip_hash: str = Field(..., description="Current tip block SHA-256 hash")
    tip_seq: int = Field(0, description="Latest block sequence number")
    verified_at: str = Field(..., description="UTC timestamp of verification")


class AnalyticsSummaryResponse(BaseModel):
    generated_at: str
    consultations: ConsultationMetrics
    network: NetworkMetrics
    offline_sync: OfflineSyncMetrics
    clinical: ClinicalMetrics
    system_integrity: SystemIntegrityMetrics
