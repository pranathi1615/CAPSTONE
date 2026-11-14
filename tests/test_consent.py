"""Tests for Patient Consent Management and Permissions."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_patient_and_chw_consent_flow(client: AsyncClient):
    """Test patient granting consent for self, CHW granting for patient, and revocation."""
    # 1. Register Patient 1
    p1_res = await client.post("/auth/register", json={
        "email": "patient1@carebridge.local",
        "password": "Password@123",
        "full_name": "Patient One",
        "role": "patient"
    })
    p1_id = p1_res.json()["user_id"]
    p1_login = await client.post("/auth/login", json={
        "email": "patient1@carebridge.local",
        "password": "Password@123"
    })
    p1_headers = {"Authorization": f"Bearer {p1_login.json()['access_token']}"}

    # 2. Register Patient 2
    p2_res = await client.post("/auth/register", json={
        "email": "patient2@carebridge.local",
        "password": "Password@123",
        "full_name": "Patient Two",
        "role": "patient"
    })
    p2_id = p2_res.json()["user_id"]
    p2_login = await client.post("/auth/login", json={
        "email": "patient2@carebridge.local",
        "password": "Password@123"
    })
    p2_headers = {"Authorization": f"Bearer {p2_login.json()['access_token']}"}

    # 3. Register CHW
    chw_res = await client.post("/auth/register", json={
        "email": "chw.test@carebridge.local",
        "password": "Password@123",
        "full_name": "CHW Test",
        "role": "chw"
    })
    chw_login = await client.post("/auth/login", json={
        "email": "chw.test@carebridge.local",
        "password": "Password@123"
    })
    chw_headers = {"Authorization": f"Bearer {chw_login.json()['access_token']}"}

    # 4. Patient 1 grants consent for self -> Success (201)
    c1_res = await client.post(
        "/consents",
        headers=p1_headers,
        json={"patient_id": p1_id, "purpose": "teleconsultation"}
    )
    assert c1_res.status_code == 201
    c1_data = c1_res.json()
    assert c1_data["patient_id"] == p1_id
    assert c1_data["granted_by"] == p1_id
    assert c1_data["granted_by_role"] == "patient"
    assert c1_data["is_active"] is True
    consent_1_id = c1_data["consent_id"]

    # 5. Patient 1 attempts to grant consent for Patient 2 -> 403 Forbidden
    cross_res = await client.post(
        "/consents",
        headers=p1_headers,
        json={"patient_id": p2_id, "purpose": "teleconsultation"}
    )
    assert cross_res.status_code == 403

    # 6. CHW records consent on behalf of Patient 2 -> Success (201)
    chw_c_res = await client.post(
        "/consents",
        headers=chw_headers,
        json={"patient_id": p2_id, "purpose": "assisted_consult"}
    )
    assert chw_c_res.status_code == 201
    chw_c_data = chw_c_res.json()
    assert chw_c_data["patient_id"] == p2_id
    assert chw_c_data["granted_by_role"] == "chw"

    # 7. List consents for Patient 1
    list_res = await client.get(f"/consents/patient/{p1_id}", headers=p1_headers)
    assert list_res.status_code == 200
    assert len(list_res.json()) >= 1

    # 8. Patient 2 cannot list Patient 1's consents -> 403
    forbidden_list = await client.get(f"/consents/patient/{p1_id}", headers=p2_headers)
    assert forbidden_list.status_code == 403

    # 9. Patient 1 revokes their own consent -> Success
    revoke_res = await client.post(f"/consents/{consent_1_id}/revoke", headers=p1_headers)
    assert revoke_res.status_code == 200
    assert revoke_res.json()["is_active"] is False
    assert revoke_res.json()["revoked_at"] is not None

    # 10. Attempting to revoke already-revoked consent -> 400
    dup_revoke = await client.post(f"/consents/{consent_1_id}/revoke", headers=p1_headers)
    assert dup_revoke.status_code == 400
