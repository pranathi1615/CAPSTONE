"""Tests for Clinical Records with FHIR R4 subsets and optimistic concurrency."""

import pytest
from httpx import AsyncClient

from app.modules.clinical.models import ClinicalRecord
from app.modules.identity.models import DoctorStatus, User, UserRole


async def create_doctor_and_patient(client: AsyncClient):
    # Register approved doctor
    reg_doc = await client.post("/auth/register", json={
        "email": "dr.clinical@carebridge.local",
        "password": "Password@123",
        "full_name": "Dr. Clinical",
        "role": "doctor",
        "registration_number": "MCI-778899",
        "specialty": "Internal Medicine"
    })
    doc_id = reg_doc.json()["user_id"]
    doc_user = await User.find_one(User.user_id == doc_id)
    doc_user.doctor_status = DoctorStatus.APPROVED
    await doc_user.save()

    doc_login = await client.post("/auth/login", json={
        "email": "dr.clinical@carebridge.local",
        "password": "Password@123"
    })
    doc_headers = {"Authorization": f"Bearer {doc_login.json()['access_token']}"}

    # Register patient
    reg_pat = await client.post("/auth/register", json={
        "email": "patient.clinical@carebridge.local",
        "password": "Password@123",
        "full_name": "Patient Clinical",
        "role": "patient"
    })
    pat_id = reg_pat.json()["user_id"]

    return doc_headers, pat_id


@pytest.mark.asyncio
async def test_create_and_retrieve_fhir_condition(client: AsyncClient):
    """Doctor creates an active FHIR Condition record for a patient."""
    doc_headers, pat_id = await create_doctor_and_patient(client)

    payload = {
        "patient_id": pat_id,
        "record_type": "condition",
        "data": {
            "resourceType": "Condition",
            "code": "Type 2 Diabetes Mellitus",
            "clinical_status": "active",
            "verification_status": "confirmed",
            "severity": "moderate",
            "notes": "Patient reports increased thirst and fatigue."
        }
    }
    resp = await client.post("/clinical/records", json=payload, headers=doc_headers)
    assert resp.status_code == 201
    created = resp.json()
    assert created["record_id"] is not None
    assert created["record_type"] == "condition"
    assert created["version"] == 1
    assert created["data"]["code"] == "Type 2 Diabetes Mellitus"

    # Fetch patient's records
    get_resp = await client.get(
        f"/clinical/records?patient_id={pat_id}&record_type=condition",
        headers=doc_headers
    )
    assert get_resp.status_code == 200
    records = get_resp.json()
    assert any(r["record_id"] == created["record_id"] for r in records)


@pytest.mark.asyncio
async def test_create_fhir_observation_vitals(client: AsyncClient):
    """Doctor records patient vitals conforming to FHIR Observation subset."""
    doc_headers, pat_id = await create_doctor_and_patient(client)

    payload = {
        "patient_id": pat_id,
        "record_type": "observation",
        "data": {
            "resourceType": "Observation",
            "category": "vital-signs",
            "systolic_bp": 128.0,
            "diastolic_bp": 82.0,
            "pulse": 74.0,
            "temperature_c": 37.1,
            "spo2_percent": 98.0,
            "weight_kg": 65.5,
            "notes": "Vitals stable, normal sinus rhythm."
        }
    }
    resp = await client.post("/clinical/records", json=payload, headers=doc_headers)
    assert resp.status_code == 201
    rec = resp.json()
    assert rec["data"]["systolic_bp"] == 128.0
    assert rec["data"]["spo2_percent"] == 98.0


@pytest.mark.asyncio
async def test_optimistic_concurrency_conflict(client: AsyncClient):
    """Updating a record with an outdated version must raise HTTP 409 CONFLICT."""
    doc_headers, pat_id = await create_doctor_and_patient(client)

    # 1. Create record
    create_resp = await client.post(
        "/clinical/records",
        json={
            "patient_id": pat_id,
            "record_type": "allergy",
            "data": {
                "resourceType": "AllergyIntolerance",
                "substance": "Penicillin",
                "clinical_status": "active",
                "verification_status": "confirmed",
                "criticality": "high",
                "manifestation": "Anaphylaxis and hives"
            }
        },
        headers=doc_headers
    )
    assert create_resp.status_code == 201
    rec_id = create_resp.json()["record_id"]

    # 2. First update with version 1 -> succeeds, increments to version 2
    update1 = await client.put(
        f"/clinical/records/{rec_id}",
        json={
            "version": 1,
            "data": {
                "resourceType": "AllergyIntolerance",
                "substance": "Penicillin & Amoxicillin",
                "clinical_status": "active",
                "verification_status": "confirmed",
                "criticality": "high",
                "manifestation": "Severe hives"
            }
        },
        headers=doc_headers
    )
    assert update1.status_code == 200
    assert update1.json()["version"] == 2

    # 3. Second client tries to update with stale version 1 -> fails with 409 Conflict
    conflict_resp = await client.put(
        f"/clinical/records/{rec_id}",
        json={
            "version": 1,
            "data": {
                "resourceType": "AllergyIntolerance",
                "substance": "Penicillin only",
                "clinical_status": "active",
                "verification_status": "confirmed",
                "criticality": "high"
            }
        },
        headers=doc_headers
    )
    assert conflict_resp.status_code == 409
    assert "VERSION_CONFLICT" in conflict_resp.json()["detail"]
