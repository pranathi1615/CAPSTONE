"""Rate limiter for authentication and sensitive endpoints.

Tracks client request counts within a sliding time window using Redis.
Returns HTTP 429 when thresholds are exceeded.
"""

from fastapi import HTTPException, Request, status
from app.core.redis import get_redis


class RateLimiter:
    def __init__(self, max_requests: int, window_seconds: int, prefix: str = "rl"):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.prefix = prefix

    async def __call__(self, request: Request) -> None:
        client_ip = request.client.host if request.client else "unknown"
        path = request.url.path
        key = f"{self.prefix}:{path}:{client_ip}"

        try:
            r = get_redis()
            current = await r.incr(key)
            if current == 1:
                # Set TTL on first request in window
                await r.expire(key, self.window_seconds)

            if current > self.max_requests:
                ttl = await r.ttl(key)
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Too many attempts. Please try again in {max(ttl, 1)} seconds."
                )
        except HTTPException:
            raise
        except Exception:
            # In case of temporary cache error, fail open so legitimate users aren't locked out
            pass
