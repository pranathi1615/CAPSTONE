"""Service layer for verified pharmacy search using MongoDB 2dsphere index and distance calculation."""

import math
from typing import List, Optional
import uuid

from app.modules.pharmacies.models import Pharmacy
from app.modules.pharmacies.schemas import PharmacyResponse


def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great-circle distance between two geographic points in kilometers."""
    R = 6371.0  # Earth's radius in kilometers
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(d_lon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return round(R * c, 2)


async def seed_default_pharmacies() -> None:
    """Seed synthetic verified pharmacies if collection is empty (MOCK DATA labeled)."""
    count = await Pharmacy.count()
    if count > 0:
        return

    # Seed pharmacies around Hyderabad / Vijayawada healthcare corridors
    defaults = [
        {
            "name": "Apollo Pharmacy - Banjara Hills (MOCK)",
            "license_number": "TS/HYD/2024/0981",
            "address": "Road No. 2, Banjara Hills, Hyderabad, Telangana 500034",
            "phone": "+91 40 2360 7777",
            "lat": 17.4168,
            "lng": 78.4382,
            "stock_status": "in_stock"
        },
        {
            "name": "MedPlus - Jubilee Hills (MOCK)",
            "license_number": "TS/HYD/2023/1142",
            "address": "Road No. 36, Jubilee Hills, Hyderabad, Telangana 500033",
            "phone": "+91 40 2355 8899",
            "lat": 17.4325,
            "lng": 78.4073,
            "stock_status": "in_stock"
        },
        {
            "name": "CareBridge Jan Aushadhi Kendra (MOCK)",
            "license_number": "PMBJP/TS/0412",
            "address": "Near Government General Hospital, Koti, Hyderabad 500095",
            "phone": "+91 40 2465 1234",
            "lat": 17.3820,
            "lng": 78.4867,
            "stock_status": "in_stock"
        },
        {
            "name": "Sanjeevani Rural Health Dispensary (MOCK)",
            "license_number": "TS/RR/2022/4451",
            "address": "Main Road, Shamshabad, Ranga Reddy District 501218",
            "phone": "+91 8413 222111",
            "lat": 17.2600,
            "lng": 78.4000,
            "stock_status": "partial_stock"
        },
        {
            "name": "Sri Krishna Medical & General Stores (MOCK)",
            "license_number": "TS/SEC/2021/8872",
            "address": "MG Road, Secunderabad, Telangana 500003",
            "phone": "+91 40 2780 3456",
            "lat": 17.4399,
            "lng": 78.4983,
            "stock_status": "in_stock"
        }
    ]

    for p in defaults:
        doc = Pharmacy(
            pharmacy_id=str(uuid.uuid4()),
            name=p["name"],
            license_number=p["license_number"],
            address=p["address"],
            phone=p["phone"],
            is_verified=True,
            stock_status=p["stock_status"],
            is_mock_data=True,
            location={
                "type": "Point",
                "coordinates": [p["lng"], p["lat"]]
            }
        )
        await doc.insert()


async def find_nearby_pharmacies(
    lat: float,
    lng: float,
    radius_km: float = 25.0
) -> List[PharmacyResponse]:
    """Find verified pharmacies within radius_km using MongoDB 2dsphere index and calculate distances."""
    await seed_default_pharmacies()

    collection = Pharmacy.get_motor_collection()
    query = {
        "location": {
            "$near": {
                "$geometry": {
                    "type": "Point",
                    "coordinates": [lng, lat]
                },
                "$maxDistance": radius_km * 1000.0  # Convert km to meters
            }
        },
        "is_verified": True
    }

    cursor = collection.find(query)
    results = await cursor.to_list(length=50)

    responses: List[PharmacyResponse] = []
    for doc in results:
        coords = doc.get("location", {}).get("coordinates", [lng, lat])
        p_lng, p_lat = coords[0], coords[1]
        dist = haversine_distance_km(lat, lng, p_lat, p_lng)

        responses.append(PharmacyResponse(
            pharmacy_id=doc["pharmacy_id"],
            name=doc["name"],
            license_number=doc["license_number"],
            address=doc["address"],
            phone=doc["phone"],
            is_verified=doc.get("is_verified", True),
            stock_status=doc.get("stock_status", "in_stock"),
            lat=p_lat,
            lng=p_lng,
            distance_km=dist,
            is_mock_data=True
        ))

    return responses
