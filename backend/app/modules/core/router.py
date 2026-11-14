"""Core system router: health check and platform status.

GET /health probes both MongoDB and Redis, reporting status: "ok"
or "degraded" as required by the Phase 1 specification.
"""

from typing import Any, Dict
from fastapi import APIRouter

from app.core.config import settings
from app.core.database import is_mongo_healthy
from app.core.redis import is_redis_healthy

router = APIRouter(tags=["Core System"])


@router.get("/health")
async def health_check() -> Dict[str, Any]:
    """Check MongoDB and Redis connectivity.

    Returns:
        status: "ok" if both services are healthy, "degraded" if either fails.
    """
    mongo_ok = await is_mongo_healthy()
    redis_ok = await is_redis_healthy()

    overall_status = "ok" if (mongo_ok and redis_ok) else "degraded"

    return {
        "status": overall_status,
        "services": {
            "mongo": "ok" if mongo_ok else "unhealthy",
            "redis": "ok" if redis_ok else "degraded"
        },
        "environment": settings.ENVIRONMENT,
        "version": settings.APP_VERSION
    }
