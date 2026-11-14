"""Pharmacy document model with GeoJSON Point and 2dsphere index."""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import uuid

from beanie import Document
from pydantic import BaseModel, Field
from pymongo import ASCENDING, IndexModel


class GeoPoint(BaseModel):
    type: str = "Point"
    coordinates: List[float] = Field(..., description="[longitude, latitude]")


class Pharmacy(Document):
    pharmacy_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    license_number: str
    address: str
    phone: str
    is_verified: bool = True

    # Stock availability status (MOCK: labeled per Standing Rule 2)
    stock_status: str = "in_stock"  # in_stock | partial_stock | out_of_stock
    is_mock_data: bool = True

    # GeoJSON Point for 2dsphere index: {"type": "Point", "coordinates": [lng, lat]}
    location: Dict[str, Any]

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "pharmacies"
        indexes = [
            IndexModel([("pharmacy_id", ASCENDING)], unique=True),
            IndexModel([("location", "2dsphere")]),
            IndexModel([("is_verified", ASCENDING)]),
        ]
