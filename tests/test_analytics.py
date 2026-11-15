"""Automated tests for CareBridge Analytics & Epidemiological Telemetry (Phase 7)."""

import pytest
from app.modules.identity.models import User, UserRole
from app.core.security import hash_password, create_access_token


async def get_test_token(role: UserRole, email: str) -> str:
    user = await User.find_one(User.email == email)
    if not user:
        user = User(
            email=email,
            hashed_password=hash_password("Pass@123"),
            full_name=f"Test {role.value}",
            role=role,
            is_active=True
        )
        await user.insert()
    return create_access_token(data={"sub": user.user_id, "role": user.role.value})


@pytest.mark.asyncio
async def test_analytics_summary_endpoint(client):
    """Test GET /analytics/summary returns complete operational and clinical metrics."""
    admin_token = await get_test_token(UserRole.ADMIN, "admin.analytics@carebridge.local")
    response = await client.get(
        "/analytics/summary",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert response.status_code == 200
    data = response.json()

    # 1. Top level structure
    assert "generated_at" in data
    assert "consultations" in data
    assert "network" in data
    assert "offline_sync" in data
    assert "clinical" in data
    assert "system_integrity" in data

    # 2. Consultations telemetry
    consults = data["consultations"]
    assert consults["total"] >= 0
    assert isinstance(consults["by_specialty"], dict)
    assert isinstance(consults["by_urgency"], dict)
    assert "avg_wait_time_seconds" in consults
    assert "avg_wait_time_formatted" in consults

    # 3. Network telemetry
    network = data["network"]
    assert network["mode_events_count"] >= 0
    assert "VIDEO" in network["mode_distribution"]
    assert "AUDIO_ONLY" in network["mode_distribution"]
    assert "VOICE_NOTE" in network["mode_distribution"]
    assert "TEXT" in network["mode_distribution"]
    assert network["resilience_rate_percent"] >= 90.0

    # 4. Offline sync telemetry
    sync_data = data["offline_sync"]
    assert sync_data["total_sync_receipts"] >= 0
    assert sync_data["conflict_resolution_rate_percent"] == 100.0

    # 5. Clinical telemetry
    clinical = data["clinical"]
    assert clinical["prescriptions_issued"] >= 0
    assert clinical["referrals_generated"] >= 0
    assert clinical["triage_evaluations_total"] >= 0

    # 6. System integrity
    system_int = data["system_integrity"]
    assert system_int["audit_chain_status"] == "VERIFIED_TAMPER_FREE"
    assert len(system_int["genesis_hash"]) == 64
    assert len(system_int["tip_hash"]) == 64


@pytest.mark.asyncio
async def test_analytics_epidemiological_endpoint(client):
    """Test GET /analytics/epidemiological returns specialty and urgency distributions."""
    token = await get_test_token(UserRole.PATIENT, "patient.analytics@carebridge.local")
    response = await client.get(
        "/analytics/epidemiological",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    data = response.json()

    assert "specialties" in data
    assert "urgency_distribution" in data
    assert "triage_evaluations_total" in data
    assert "red_flags_detected" in data


@pytest.mark.asyncio
async def test_analytics_network_degradation_endpoint(client):
    """Test GET /analytics/network-degradation returns weak network telemetry."""
    token = await get_test_token(UserRole.PATIENT, "patient.analytics2@carebridge.local")
    response = await client.get(
        "/analytics/network-degradation",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    data = response.json()

    assert "mode_events_count" in data
    assert "mode_distribution" in data
    assert "resilience_rate_percent" in data


@pytest.mark.asyncio
async def test_analytics_rbac_unauthorized(client):
    """Test GET /analytics/summary requires authentication and appropriate role."""
    # No token
    res_no_auth = await client.get("/analytics/summary")
    assert res_no_auth.status_code in (401, 403)
