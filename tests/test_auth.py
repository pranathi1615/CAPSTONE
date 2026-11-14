"""Tests for Authentication, Registration, Token Refresh, and Health."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_health_check(client: AsyncClient):
    """Test /health endpoint reports status and checks services."""
    res = await client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert "status" in data
    assert data["status"] in ["ok", "degraded"]
    assert "services" in data
    assert "mongo" in data["services"]
    assert "redis" in data["services"]


@pytest.mark.asyncio
async def test_patient_registration_and_login(client: AsyncClient):
    """Test registering a patient, logging in, and fetching /me."""
    reg_payload = {
        "email": "anita.test@carebridge.local",
        "password": "Password@123",
        "full_name": "Anita Devi",
        "role": "patient",
        "phone": "+919876543210"
    }
    reg_res = await client.post("/auth/register", json=reg_payload)
    assert reg_res.status_code == 201
    user_data = reg_res.json()
    assert user_data["email"] == "anita.test@carebridge.local"
    assert user_data["role"] == "patient"
    assert "user_id" in user_data

    # Login
    login_res = await client.post("/auth/login", json={
        "email": "anita.test@carebridge.local",
        "password": "Password@123"
    })
    assert login_res.status_code == 200
    tokens = login_res.json()
    assert "access_token" in tokens
    assert "refresh_token" in tokens
    assert tokens["user"]["email"] == "anita.test@carebridge.local"

    # Get /me with access token
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}
    me_res = await client.get("/auth/me", headers=headers)
    assert me_res.status_code == 200
    me_data = me_res.json()
    assert me_data["user_id"] == user_data["user_id"]


@pytest.mark.asyncio
async def test_duplicate_registration_fails(client: AsyncClient):
    """Test that registering duplicate email raises 400."""
    payload = {
        "email": "dup@carebridge.local",
        "password": "Password@123",
        "full_name": "Duplicate Test",
        "role": "patient"
    }
    res1 = await client.post("/auth/register", json=payload)
    assert res1.status_code == 201

    res2 = await client.post("/auth/register", json=payload)
    assert res2.status_code == 400
    assert "already registered" in res2.json()["detail"].lower()


@pytest.mark.asyncio
async def test_invalid_login_credentials(client: AsyncClient):
    """Test invalid credentials return 401."""
    res = await client.post("/auth/login", json={
        "email": "nonexistent@carebridge.local",
        "password": "WrongPassword@123"
    })
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_refresh_token_rotation(client: AsyncClient):
    """Test token refresh creates a new valid access token."""
    reg_payload = {
        "email": "refresh.test@carebridge.local",
        "password": "Password@123",
        "full_name": "Refresh User",
        "role": "patient"
    }
    await client.post("/auth/register", json=reg_payload)

    login_res = await client.post("/auth/login", json={
        "email": "refresh.test@carebridge.local",
        "password": "Password@123"
    })
    tokens = login_res.json()
    refresh_token = tokens["refresh_token"]

    refresh_res = await client.post("/auth/refresh", json={"refresh_token": refresh_token})
    assert refresh_res.status_code == 200
    new_tokens = refresh_res.json()
    assert "access_token" in new_tokens
    assert new_tokens["access_token"] != tokens["access_token"]

    # New token works
    headers = {"Authorization": f"Bearer {new_tokens['access_token']}"}
    me_res = await client.get("/auth/me", headers=headers)
    assert me_res.status_code == 200
