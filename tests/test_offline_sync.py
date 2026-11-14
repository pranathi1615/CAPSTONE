"""Tests for the offline sync engine: outbox push, pull, and conflict detection."""

from datetime import datetime, timezone
import uuid
import pytest
from httpx import AsyncClient

from app.modules.clinical.models import ClinicalRecord
from app.modules.identity.models import User


async def create_test_patient(client: AsyncClient):
    reg = await client.post("/auth/register", json={
        "email": "sync.patient@carebridge.local",
        "password": "Password@123",
        "full_name": "Sync Patient",
        "role": "patient"
    })
    pat_id = reg.json()["user_id"]
    login = await client.post("/auth/login", json={
        "email": "sync.patient@carebridge.local",
        "password": "Password@123"
    })
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    return headers, pat_id


@pytest.mark.asyncio
async def test_offline_sync_push_new_records(client: AsyncClient):
    """Client created 2 records offline and pushes outbox when connectivity restores."""
    headers, pat_id = await create_test_patient(client)
    rec_id_1 = str(uuid.uuid4())
    rec_id_2 = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()

    payload = {
        "mutations": [
            {
                "client_id": str(uuid.uuid4()),
                "record_id": rec_id_1,
                "patient_id": pat_id,
                "record_type": "condition",
                "data": {
                    "resourceType": "Condition",
                    "code": "Seasonal Allergic Rhinitis",
                    "clinical_status": "active",
                    "verification_status": "confirmed"
                },
                "client_version": 1,
                "client_timestamp": now_iso,
                "mutation_type": "create"
            },
            {
                "client_id": str(uuid.uuid4()),
                "record_id": rec_id_2,
                "patient_id": pat_id,
                "record_type": "observation",
                "data": {
                    "resourceType": "Observation",
                    "category": "vital-signs",
                    "pulse": 72.0,
                    "spo2_percent": 99.0
                },
                "client_version": 1,
                "client_timestamp": now_iso,
                "mutation_type": "create"
            }
        ]
    }

    resp = await client.post("/sync/push", json=payload, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["processed"] == 2
    assert data["applied"] == 2
    assert data["conflicts"] == 0

    # Verify records in database
    r1 = await ClinicalRecord.find_one(ClinicalRecord.record_id == rec_id_1)
    assert r1 is not None
    assert r1.version == 1


@pytest.mark.asyncio
async def test_offline_sync_conflict_detection(client: AsyncClient):
    """When a client submits an offline mutation with an older base version than server, conflict is returned."""
    headers, pat_id = await create_test_patient(client)
    rec_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()

    # 1. First sync inserts version 1
    push_1 = {
        "mutations": [
            {
                "client_id": str(uuid.uuid4()),
                "record_id": rec_id,
                "patient_id": pat_id,
                "record_type": "condition",
                "data": {
                    "resourceType": "Condition",
                    "code": "Mild Asthma",
                    "clinical_status": "active",
                    "verification_status": "confirmed"
                },
                "client_version": 1,
                "client_timestamp": now_iso
            }
        ]
    }
    r1 = await client.post("/sync/push", json=push_1, headers=headers)
    assert r1.status_code == 200
    assert r1.json()["applied"] == 1

    # 2. Server updates record to version 2
    record = await ClinicalRecord.find_one(ClinicalRecord.record_id == rec_id)
    record.version = 2
    record.data["severity"] = "moderate"
    await record.save()

    # 3. Offline client (which only knew version 1) attempts to push an update
    offline_mutation = {
        "mutations": [
            {
                "client_id": str(uuid.uuid4()),
                "record_id": rec_id,
                "patient_id": pat_id,
                "record_type": "condition",
                "data": {
                    "resourceType": "Condition",
                    "code": "Severe Asthma",
                    "clinical_status": "active",
                    "verification_status": "confirmed"
                },
                "client_version": 1,  # Stale version! Server is now 2
                "client_timestamp": now_iso
            }
        ]
    }
    r2 = await client.post("/sync/push", json=offline_mutation, headers=headers)
    assert r2.status_code == 200
    data = r2.json()
    assert data["conflicts"] == 1
    assert data["results"][0]["status"] == "conflict"
    assert data["results"][0]["server_version"] == 2
    assert data["results"][0]["server_document"]["data"]["severity"] == "moderate"


@pytest.mark.asyncio
async def test_offline_sync_pull(client: AsyncClient):
    """Client pulls recent updates since a given timestamp."""
    headers, pat_id = await create_test_patient(client)
    resp = await client.get(f"/sync/pull?patient_id={pat_id}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "records" in data
    assert "server_timestamp" in data
