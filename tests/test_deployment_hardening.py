"""Automated tests for CareBridge Deployment Hardening & Audit Verification (Phase 7)."""

import pytest
from app.modules.identity.models import User, UserRole
from app.core.security import hash_password, create_access_token
from app.modules.audit.service import append_audit_log
from app.modules.audit.models import AuditLog


async def get_admin_token() -> str:
    user = await User.find_one(User.email == "admin.hardening@carebridge.local")
    if not user:
        user = User(
            email="admin.hardening@carebridge.local",
            hashed_password=hash_password("Admin@123"),
            full_name="Hardening Admin Test",
            role=UserRole.ADMIN,
            is_active=True
        )
        await user.insert()
    return create_access_token(data={"sub": user.user_id, "role": user.role.value})


@pytest.mark.asyncio
async def test_security_headers_middleware(client):
    """Verify production security headers are set on all responses."""
    response = await client.get("/health")

    assert response.status_code == 200
    headers = response.headers

    assert headers.get("x-content-type-options") == "nosniff"
    assert headers.get("x-frame-options") == "DENY"
    assert headers.get("x-xss-protection") == "1; mode=block"
    assert headers.get("referrer-policy") == "strict-origin-when-cross-origin"
    assert "camera=" in headers.get("permissions-policy", "")
    assert "default-src 'self'" in headers.get("content-security-policy", "")


@pytest.mark.asyncio
async def test_root_phase_seven(client):
    """Verify GET / returns Phase 7."""
    response = await client.get("/")

    assert response.status_code == 200
    data = response.json()
    assert data["phase"] == 7
    assert data["app"] == "CareBridge Telemedicine API"


@pytest.mark.asyncio
async def test_audit_verification_endpoint_enhanced(client):
    """Verify GET /audit/verify returns cryptographic telemetry (genesis_hash, tip_hash, is_tamper_free)."""
    admin_token = await get_admin_token()

    # Append an audit log to ensure non-empty chain
    await append_audit_log(
        event_type="HARDENING_TEST_EVENT",
        actor_id="admin_test",
        actor_role="admin",
        payload={"test": "hardening_phase_7"}
    )

    response = await client.get(
        "/audit/verify",
        headers={"Authorization": f"Bearer {admin_token}"}
    )

    assert response.status_code == 200
    data = response.json()

    assert data["valid"] is True
    assert data["is_tamper_free"] is True
    assert data["count"] > 0
    assert "genesis_hash" in data
    assert "tip_hash" in data
    assert "tip_seq" in data
    assert data["tip_seq"] == data["count"]
    assert "verified_at" in data
    assert "SHA-256" in data["algorithm"]


@pytest.mark.asyncio
async def test_audit_stats_endpoint(client):
    """Verify GET /audit/stats returns aggregate audit chain metrics."""
    admin_token = await get_admin_token()

    response = await client.get(
        "/audit/stats",
        headers={"Authorization": f"Bearer {admin_token}"}
    )

    assert response.status_code == 200
    data = response.json()

    assert "total_blocks" in data
    assert "genesis_hash" in data
    assert "tip_hash" in data
    assert "event_distribution" in data
    assert "roles_distribution" in data
    assert data["integrity_status"] == "VERIFIED_TAMPER_FREE"


@pytest.mark.asyncio
async def test_audit_log_filtering_by_event_type(client):
    """Verify GET /audit?event_type=... filters records accurately."""
    admin_token = await get_admin_token()

    unique_event = "HARDENING_FILTER_UNIQUE_EVENT"
    await append_audit_log(
        event_type=unique_event,
        actor_id="admin_test",
        actor_role="admin",
        payload={"filter_check": True}
    )

    response = await client.get(
        f"/audit?event_type={unique_event}",
        headers={"Authorization": f"Bearer {admin_token}"}
    )

    assert response.status_code == 200
    logs = response.json()
    assert len(logs) >= 1
    assert all(log["event_type"] == unique_event for log in logs)
