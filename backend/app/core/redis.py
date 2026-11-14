"""Redis connection management with in-memory fallback for local dev.

Provides async Redis client and healthcheck probe.
"""

import logging
from typing import Optional
import redis.asyncio as aioredis
import fakeredis.aioredis as fake_aioredis

from app.core.config import settings

logger = logging.getLogger(__name__)

redis_client: Optional[aioredis.Redis] = None
is_using_fake_redis: bool = False


async def init_redis() -> aioredis.Redis:
    """Initialize Redis client. Falls back to FakeRedis if Redis server is unreachable."""
    global redis_client, is_using_fake_redis
    try:
        real_client = aioredis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            socket_connect_timeout=1.5
        )
        await real_client.ping()
        redis_client = real_client
        is_using_fake_redis = False
        logger.info("Connected to real Redis at %s", settings.REDIS_URL)
    except Exception as exc:
        logger.warning(
            "Could not connect to Redis at %s (%s). Falling back to in-memory FakeRedis for local development.",
            settings.REDIS_URL,
            exc
        )
        redis_client = fake_aioredis.FakeRedis(decode_responses=True)
        is_using_fake_redis = True
    return redis_client


async def close_redis() -> None:
    """Close Redis client connection."""
    global redis_client
    if redis_client:
        await redis_client.aclose()
        redis_client = None


async def is_redis_healthy() -> bool:
    """Probe Redis health. Returns True only if connected to an operational Redis server."""
    if is_using_fake_redis:
        # If running in-memory fallback, reporting false indicates real Redis is degraded
        return False
    if not redis_client:
        return False
    try:
        await redis_client.ping()
        return True
    except Exception:
        return False


def get_redis() -> aioredis.Redis:
    """Return current redis client instance."""
    if redis_client is None:
        raise RuntimeError("Redis client not initialized")
    return redis_client
