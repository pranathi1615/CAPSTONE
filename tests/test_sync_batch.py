"""Tests for Phase 5: Offline Sync Batch Engine, Idempotency Receipts, Vitals Ranges, and CHW Assisted Visits."""

from datetime import datetime, timezone
import uuid
import pytest
from httpx import AsyncClient

from app.core.vitals_evaluator import evaluate_vitals_data
from app.modules.assisted_visits.models import AssistedVisit
from app.modules.clinical.models import ClinicalRecord
from app.modules.consent.models import Consent
from app.modules.identity.models import User, UserRole
from app.modules.sync.models import SyncReceipt


@pytest.mark.asyncio
async def test_vitals_evaluator_ranges_and_flags():
    """Verify that configurable vitals ranges flag abnormal clinical values correctly."""
    # 1. Normal vitals
    normal_vitals = {
        "systolic": 115,
        "diastolic": 75,
        "blood_sugar": 90,
        "spo2": 98,
        "temperature": 36.8,
        "pulse": 72
    }
    res_normal = evaluate_vitals_data(normal_vitals)
    assert res_normal["is_out_of_range"] is False
    assert len(res_normal["flags"]) == 0

    # 2. Hypertensive crisis + Hypoxia + Fever
    critical_vitals = {
        "systolic": 185,
        "diastolic": 125,
        "blood_sugar": 260,
        "spo2": 88,
        "temperature": 39.2,
        "pulse": 145
    }
    res_crit = evaluate_vitals_data(critical_vitals)
    assert res_crit["is_out_of_range"] is True
    flag_types = [f["flag"] for f in res_crit["flags"]]
    assert "HYPERTENSIVE_CRISIS" in flag_types
    assert "CRITICAL_HYPOXIA" in flag_types
    assert "HIGH_FEVER" in flag_types
    assert "CRITICAL_TACHYCARDIA" in flag_types
    assert "CRITICAL_HYPERGLYCEMIA" in flag_types


async def create_test_chw(client: AsyncClient):
    reg = await client.post("/auth/register", json={
        "email": "chw.test@carebridge.local",
        "password": "Password@123",
        "full_name": "Lakshmi CHW",
        "role": "chw"
    })
    chw_id = reg.json()["user_id"]
    login = await client.post("/auth/login", json={
        "email": "chw.test@carebridge.local",
        "password": "Password@123"
    })
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    return headers, chw_id


@pytest.mark.asyncio
async def test_sync_batch_multiple_items_and_idempotency(client: AsyncClient):
    """Verify POST /sync processes a multi-item batch and rejects duplicate idempotency keys."""
    headers, chw_id = await create_test_chw(client)
    patient_id = str(uuid.uuid4())
    consent_id = str(uuid.uuid4())
    visit_id = str(uuid.uuid4())
    vitals_key = str(uuid.uuid4())
    visit_key = str(uuid.uuid4())
    consent_key = str(uuid.uuid4())

    batch_payload = {
        "batch": [
            {
                "idempotency_key": consent_key,
                "client_id": str(uuid.uuid4()),
                "item_type": "consent",
                "item_id": consent_id,
                "payload": {
                    "patient_id": patient_id,
                    "purpose": "teleconsultation",
                    "granted_by_role": "chw"
                },
                "client_version": 1,
                "client_timestamp": datetime.now(timezone.utc).isoformat()
            },
            {
                "idempotency_key": vitals_key,
                "client_id": str(uuid.uuid4()),
                "item_type": "vitals",
                "item_id": str(uuid.uuid4()),
                "payload": {
                    "patient_id": patient_id,
                    "systolic": 130,
                    "diastolic": 85,
                    "pulse": 78
                },
                "client_version": 1,
                "client_timestamp": datetime.now(timezone.utc).isoformat()
            },
            {
                "idempotency_key": visit_key,
                "client_id": str(uuid.uuid4()),
                "item_type": "visit",
                "item_id": visit_id,
                "payload": {
                    "patient_id": patient_id,
                    "patient_name": "Ramu K",
                    "consent_id": consent_id,
                    "vitals": {"systolic": 130, "diastolic": 85},
                    "symptoms": ["fever", "cough"],
                    "consultation_type": "async_consult"
                },
                "client_version": 1,
                "client_timestamp": datetime.now(timezone.utc).isoformat()
            }
        ]
    }

    # 1. First sync submission -> All 3 applied
    res1 = await client.post("/sync", json=batch_payload, headers=headers)
    assert res1.status_code == 200
    data1 = res1.json()
    assert data1["processed"] == 3
    assert data1["applied"] == 3
    assert data1["duplicates"] == 0

    # Verify visit stored in MongoDB
    saved_visit = await AssistedVisit.find_one(AssistedVisit.visit_id == visit_id)
    assert saved_visit is not None
    assert saved_visit.patient_name == "Ramu K"
    assert "fever" in saved_visit.symptoms

    # Verify SyncReceipts created
    receipts = await SyncReceipt.find(SyncReceipt.actor_id != "").to_list()
    assert len(receipts) >= 3

    # 2. Second identical sync submission -> All 3 marked duplicate (idempotency victory)
    res2 = await client.post("/sync", json=batch_payload, headers=headers)
    assert res2.status_code == 200
    data2 = res2.json()
    assert data2["processed"] == 3
    assert data2["applied"] == 0
    assert data2["duplicates"] == 3
    for item in data2["results"]:
        assert item["status"] == "duplicate"


@pytest.mark.asyncio
async def test_sync_server_wins_version_conflict(client: AsyncClient):
    """Verify shared clinical records enforce server-wins when client is behind."""
    headers, chw_id = await create_test_chw(client)
    patient_id = str(uuid.uuid4())
    record_id = str(uuid.uuid4())

    # 1. Create record at version 1
    rec = ClinicalRecord(
        record_id=record_id,
        patient_id=patient_id,
        record_type="condition",
        data={"code": "386661006", "name": "Fever", "clinical_status": "active"},
        version=2,  # Server advanced to version 2
        client_id=str(uuid.uuid4()),
        client_timestamp=datetime.now(timezone.utc),
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc)
    )
    await rec.insert()

    # 2. Client sends mutation based on stale version 1
    conflict_payload = {
        "batch": [
            {
                "idempotency_key": str(uuid.uuid4()),
                "client_id": str(uuid.uuid4()),
                "item_type": "clinical_record",
                "item_id": record_id,
                "payload": {
                    "patient_id": patient_id,
                    "record_type": "condition",
                    "data": {"code": "386661006", "name": "Fever Resolved", "clinical_status": "resolved"}
                },
                "client_version": 1,  # Stale version!
                "client_timestamp": datetime.now(timezone.utc).isoformat()
            }
        ]
    }

    res = await client.post("/sync", json=conflict_payload, headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["conflicts"] == 1
    assert data["results"][0]["status"] == "conflict"
    assert data["results"][0]["server_version"] == 2
    assert data["results"][0]["server_document"]["data"]["name"] == "Fever"


@pytest.mark.asyncio
async def test_assisted_visit_requires_consent_and_appends_vitals(client: AsyncClient):
    """Verify that an assisted visit enforces consent and appends vitals to ClinicalRecord."""
    headers, chw_id = await create_test_chw(client)
    patient_id = str(uuid.uuid4())

    # 1. Attempt to create visit without prior consent -> 400 Bad Request
    visit_payload = {
        "patient_id": patient_id,
        "patient_name": "Sita Devi",
        "consent_id": str(uuid.uuid4()),  # Non-existent consent!
        "vitals": {"systolic": 120, "diastolic": 80},
        "symptoms": ["headache"]
    }
    res_no_consent = await client.post("/assisted-visits", json=visit_payload, headers=headers)
    assert res_no_consent.status_code == 400
    assert "consent" in res_no_consent.json()["detail"].lower()

    # 2. Grant consent first
    consent = Consent(
        consent_id=str(uuid.uuid4()),
        patient_id=patient_id,
        purpose="teleconsultation",
        granted_by=chw_id,
        granted_by_role="chw"
    )
    await consent.insert()

    # 3. Create assisted visit with critical vitals
    visit_payload["consent_id"] = consent.consent_id
    visit_payload["vitals"] = {
        "systolic": 185,
        "diastolic": 122,
        "spo2": 89
    }
    res_ok = await client.post("/assisted-visits", json=visit_payload, headers=headers)
    assert res_ok.status_code == 201
    visit_data = res_ok.json()
    assert visit_data["is_out_of_range"] is True
    assert len(visit_data["out_of_range_flags"]) >= 2

    # 4. Verify vitals were appended to ClinicalRecord
    records = await ClinicalRecord.find(ClinicalRecord.patient_id == patient_id).to_list()
    assert len(records) == 1
    assert records[0].record_type == "observation"
    assert records[0].data["interpretation"] == "out_of_range"
