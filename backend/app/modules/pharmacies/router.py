"""Verified pharmacy directory and nearby geo-spatial endpoints."""

from typing import List
from fastapi import APIRouter, Depends, Query

from app.core.dependencies import get_current_user
from app.modules.identity.models import User
from app.modules.pharmacies.schemas import PharmacyResponse
from app.modules.pharmacies.service import find_nearby_pharmacies, seed_default_pharmacies
from app.modules.pharmacies.models import Pharmacy

router = APIRouter(prefix="/pharmacies", tags=["pharmacies"])


@router.get("/nearby", response_model=List[PharmacyResponse])
async def get_nearby_pharmacies_endpoint(
    lat: float = Query(17.3850, ge=-90, le=90, description="Latitude (default: Hyderabad center)"),
    lng: float = Query(78.4867, ge=-180, le=180, description="Longitude (default: Hyderabad center)"),
    radius_km: float = Query(35.0, ge=1.0, le=200.0, description="Search radius in kilometers"),
    current_user: User = Depends(get_current_user)
):
    """Find verified pharmacies near geographic coordinates using MongoDB 2dsphere index."""
    return await find_nearby_pharmacies(lat=lat, lng=lng, radius_km=radius_km)


@router.get("", response_model=List[PharmacyResponse])
async def list_all_pharmacies_endpoint(
    current_user: User = Depends(get_current_user)
):
    """List all verified pharmacies in the network."""
    await seed_default_pharmacies()
    docs = await Pharmacy.find(Pharmacy.is_verified == True).to_list()
    res = []
    for d in docs:
        coords = d.location.get("coordinates", [78.4867, 17.3850])
        res.append(PharmacyResponse(
            pharmacy_id=d.pharmacy_id,
            name=d.name,
            license_number=d.license_number,
            address=d.address,
            phone=d.phone,
            is_verified=d.is_verified,
            stock_status=d.stock_status,
            lat=coords[1],
            lng=coords[0],
            distance_km=None,
            is_mock_data=True
        ))
    return res
