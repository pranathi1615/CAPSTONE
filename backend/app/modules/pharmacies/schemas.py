"""Schemas for verified pharmacies and geo-spatial nearby queries."""

from typing import Optional
from pydantic import BaseModel, Field


class PharmacyResponse(BaseModel):
    pharmacy_id: str
    name: str
    license_number: str
    address: str
    phone: str
    is_verified: bool
    stock_status: str       # MOCK: in_stock | partial_stock | out_of_stock
    lat: float
    lng: float
    distance_km: Optional[float] = None
    is_mock_data: bool = True


class PharmacyCreateRequest(BaseModel):
    name: str
    license_number: str
    address: str
    phone: str
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)
    stock_status: str = "in_stock"
