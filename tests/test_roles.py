"""Tests for Role-based Access Control (RBAC) and Doctor Verification."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_doctor_registration_validation(client: AsyncClient):
    """Test doctor registration enforces registration_number requirement."""
    # Attempt registration without registration number should fail validation
    res = await client.post("/auth/register", json={
        "email": "dr.bad@carebridge.local",
        "password": "Password@123",
        "full_name": "Dr Bad",
        "role": "doctor"
    })
    assert res.status_code == 422

    # With registration number -> success, starts as pending
    res_ok = await client.post("/auth/register", json={
        "email": "dr.good@carebridge.local",
        "password": "Password@123",
        "full_name": "Dr Good",
        "role": "doctor",
        "registration_number": "MCI-554433",
        "specialty": "Pediatrics"
    })
    assert res_ok.status_code == 201
    doctor_data = res_ok.json()
    assert doctor_data["doctor_status"] == "pending"
    assert doctor_data["registration_number"] == "MCI-554433"


@pytest.mark.asyncio
async def test_doctor_approval_rbac(client: AsyncClient):
    """Test that only admin can list pending doctors and approve them."""
    # 1. Register admin
    await client.post("/auth/register", json={
        "email": "admin@carebridge.local",
        "password": "AdminPassword@123",
        "full_name": "System Admin",
        "role": "admin"
    })
    admin_login = await client.post("/auth/login", json={
        "email": "admin@carebridge.local",
        "password": "AdminPassword@123"
    })
    admin_token = admin_login.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # 2. Register doctor
    await client.post("/auth/register", json={
        "email": "dr.pending@carebridge.local",
        "password": "DoctorPassword@123",
        "full_name": "Dr Sneha",
        "role": "doctor",
        "registration_number": "MCI-998877"
    })
    doctor_login = await client.post("/auth/login", json={
        "email": "dr.pending@carebridge.local",
        "password": "DoctorPassword@123"
    })
    doctor_token = doctor_login.json()["access_token"]
    doctor_id = doctor_login.json()["user"]["user_id"]
    doctor_headers = {"Authorization": f"Bearer {doctor_token}"}

    # 3. Doctor tries to view pending doctors -> 403 Forbidden
    doc_view_res = await client.get("/auth/doctors/pending", headers=doctor_headers)
    assert doc_view_res.status_code == 403

    # 4. Doctor tries to approve self -> 403 Forbidden
    doc_approve_res = await client.post(
        f"/auth/doctors/{doctor_id}/approve",
        headers=doctor_headers,
        json={"approved": True}
    )
    assert doc_approve_res.status_code == 403

    # 5. Admin views pending doctors -> 200 OK
    admin_view_res = await client.get("/auth/doctors/pending", headers=admin_headers)
    assert admin_view_res.status_code == 200
    pending_list = admin_view_res.json()
    assert any(d["user_id"] == doctor_id for d in pending_list)

    # 6. Admin approves doctor -> 200 OK, status changes to approved
    admin_approve_res = await client.post(
        f"/auth/doctors/{doctor_id}/approve",
        headers=admin_headers,
        json={"approved": True}
    )
    assert admin_approve_res.status_code == 200
    updated_doc = admin_approve_res.json()
    assert updated_doc["doctor_status"] == "approved"
