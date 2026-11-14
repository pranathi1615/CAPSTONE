"""Tests for Ed25519 tamper-proof digital prescriptions and atomic single-use dispense."""

import asyncio
import json
import pytest
from httpx import AsyncClient

from app.modules.identity.models import DoctorStatus, User
from app.modules.prescriptions.crypto import (
    canonicalize_prescription_dict,
    generate_ed25519_keypair,
    sign_prescription_data,
    verify_prescription_signature
)


async def setup_doctor_patient_pharmacy(client: AsyncClient):
    # 1. Doctor
    reg_doc = await client.post("/auth/register", json={
        "email": "dr.rx@carebridge.local",
        "password": "Password@123",
        "full_name": "Dr. Rx",
        "role": "doctor",
        "registration_number": "MCI-998877",
        "specialty": "General Medicine"
    })
    doc_id = reg_doc.json()["user_id"]
    doc_user = await User.find_one(User.user_id == doc_id)
    doc_user.doctor_status = DoctorStatus.APPROVED
    await doc_user.save()

    doc_login = await client.post("/auth/login", json={
        "email": "dr.rx@carebridge.local",
        "password": "Password@123"
    })
    doc_headers = {"Authorization": f"Bearer {doc_login.json()['access_token']}"}

    # 2. Patient
    reg_pat = await client.post("/auth/register", json={
        "email": "patient.rx@carebridge.local",
        "password": "Password@123",
        "full_name": "Patient Rx",
        "role": "patient"
    })
    pat_id = reg_pat.json()["user_id"]

    # 3. Pharmacy
    reg_pharm = await client.post("/auth/register", json={
        "email": "pharmacy.rx@carebridge.local",
        "password": "Password@123",
        "full_name": "CareBridge Local Pharmacy",
        "role": "pharmacy"
    })
    pharm_login = await client.post("/auth/login", json={
        "email": "pharmacy.rx@carebridge.local",
        "password": "Password@123"
    })
    pharm_headers = {"Authorization": f"Bearer {pharm_login.json()['access_token']}"}

    return doc_headers, pat_id, pharm_headers


def test_ed25519_signing_and_tamper_detection():
    """Verify Ed25519 signing works and tampering with even 1 byte invalidates the signature."""
    priv_key, pub_key = generate_ed25519_keypair()

    data = {
        "prescription_id": "test-uuid-1234",
        "doctor_id": "doc-5678",
        "patient_id": "pat-9999",
        "items": [{"drug": "Paracetamol", "dose": "500mg"}]
    }

    canonical_str, canonical_bytes = canonicalize_prescription_dict(data)
    signature = sign_prescription_data(priv_key, canonical_bytes)

    # 1. Unaltered verification MUST succeed
    assert verify_prescription_signature(pub_key, canonical_bytes, signature) is True

    # 2. Tampered data (e.g. dose modified from 500mg to 1000mg) MUST fail verification
    tampered_data = dict(data)
    tampered_data["items"] = [{"drug": "Paracetamol", "dose": "1000mg"}]
    _, tampered_bytes = canonicalize_prescription_dict(tampered_data)
    assert verify_prescription_signature(pub_key, tampered_bytes, signature) is False


@pytest.mark.asyncio
async def test_doctor_issue_prescription_endpoint(client: AsyncClient):
    """Doctor creates and digitally signs a prescription via API."""
    doc_headers, pat_id, _ = await setup_doctor_patient_pharmacy(client)

    payload = {
        "patient_id": pat_id,
        "patient_name": "Patient Rx",
        "items": [
            {
                "drug_name": "Amoxicillin",
                "dose": "500mg",
                "frequency": "1-0-1",
                "duration": "5 days",
                "instructions": "Take after meals with water"
            }
        ],
        "notes": "Monitor for any allergic skin reactions."
    }
    resp = await client.post("/prescriptions", json=payload, headers=doc_headers)
    assert resp.status_code == 201
    rx = resp.json()
    assert rx["prescription_id"] is not None
    assert rx["signature"] is not None
    assert rx["signature_valid"] is True
    assert rx["status"] == "issued"

    # Fetch QR code PNG
    qr_resp = await client.get(f"/prescriptions/{rx['prescription_id']}/qr", headers=doc_headers)
    assert qr_resp.status_code == 200
    assert qr_resp.headers["content-type"] == "image/png"
    assert len(qr_resp.content) > 100


@pytest.mark.asyncio
async def test_single_use_dispense_and_blocking(client: AsyncClient):
    """Prescription is dispensed once; a second dispense attempt MUST fail with HTTP 409."""
    doc_headers, pat_id, pharm_headers = await setup_doctor_patient_pharmacy(client)

    # 1. Issue prescription
    create_resp = await client.post(
        "/prescriptions",
        json={
            "patient_id": pat_id,
            "patient_name": "Patient Rx",
            "items": [{"drug_name": "Cetirizine", "dose": "10mg", "frequency": "0-0-1", "duration": "3 days"}]
        },
        headers=doc_headers
    )
    assert create_resp.status_code == 201
    rx_id = create_resp.json()["prescription_id"]

    # 2. Pharmacy dispenses for the first time -> 200 OK
    dispense1 = await client.post(
        f"/prescriptions/{rx_id}/dispense",
        json={"notes": "Dispensed 1 strip of Cetirizine 10mg"},
        headers=pharm_headers
    )
    assert dispense1.status_code == 200
    assert dispense1.json()["success"] is True

    # 3. Pharmacy or another entity tries to dispense again -> 409 Conflict with ALREADY_DISPENSED
    dispense2 = await client.post(
        f"/prescriptions/{rx_id}/dispense",
        json={"notes": "Duplicate attempt"},
        headers=pharm_headers
    )
    assert dispense2.status_code == 409
    assert "ALREADY_DISPENSED" in dispense2.json()["detail"]


@pytest.mark.asyncio
async def test_single_use_dispense_concurrent_race_condition(client: AsyncClient):
    """10 concurrent dispense requests fired at the exact same moment.

    Atomic conditional MongoDB update guarantees that EXACTLY ONE succeeds (HTTP 200),
    and 9 fail with HTTP 409.
    """
    doc_headers, pat_id, pharm_headers = await setup_doctor_patient_pharmacy(client)

    create_resp = await client.post(
        "/prescriptions",
        json={
            "patient_id": pat_id,
            "patient_name": "Patient Rx",
            "items": [{"drug_name": "Azithromycin", "dose": "500mg", "frequency": "1-0-0", "duration": "3 days"}]
        },
        headers=doc_headers
    )
    assert create_resp.status_code == 201
    rx_id = create_resp.json()["prescription_id"]

    # Fire 10 concurrent dispense requests simultaneously
    async def attempt_dispense(index: int):
        return await client.post(
            f"/prescriptions/{rx_id}/dispense",
            json={"notes": f"Concurrent attempt #{index}"},
            headers=pharm_headers
        )

    tasks = [attempt_dispense(i) for i in range(10)]
    responses = await asyncio.gather(*tasks)

    status_codes = [r.status_code for r in responses]
    assert status_codes.count(200) == 1, f"Expected exactly one 200, got {status_codes.count(200)}"
    assert status_codes.count(409) == 9, f"Expected nine 409s, got {status_codes.count(409)}"
