"""Tests for verified pharmacy finder with GeoJSON 2dsphere index and distance calculation."""

import pytest
from httpx import AsyncClient

from app.modules.pharmacies.service import haversine_distance_km


async def create_auth_headers(client: AsyncClient):
    reg = await client.post("/auth/register", json={
        "email": "user.pharmacy.test@carebridge.local",
        "password": "Password@123",
        "full_name": "Test User",
        "role": "patient"
    })
    login = await client.post("/auth/login", json={
        "email": "user.pharmacy.test@carebridge.local",
        "password": "Password@123"
    })
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


def test_haversine_distance_calculation():
    """Verify haversine distance gives accurate kilometer calculation between points."""
    # Distance between Banjara Hills (17.4168, 78.4382) and Charminar (17.3616, 78.4747) is approx 7.3 km
    dist = haversine_distance_km(17.4168, 78.4382, 17.3616, 78.4747)
    assert 6.0 <= dist <= 9.0


@pytest.mark.asyncio
async def test_find_nearby_verified_pharmacies(client: AsyncClient):
    """Find verified pharmacies within 35km of Hyderabad coordinates."""
    headers = await create_auth_headers(client)
    resp = await client.get(
        "/pharmacies/nearby?lat=17.3850&lng=78.4867&radius_km=35.0",
        headers=headers
    )
    assert resp.status_code == 200
    pharmacies = resp.json()
    assert len(pharmacies) >= 1
    for p in pharmacies:
        assert p["is_verified"] is True
        assert p["is_mock_data"] is True
        assert p["distance_km"] is not None
        assert p["distance_km"] <= 35.0
