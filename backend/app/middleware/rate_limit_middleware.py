import time
from collections import defaultdict, deque
from typing import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

WINDOW = 60

AUTH_RATE_LIMITS: dict[str, int] = {
    "/api/auth/login":                  10,
    "/api/auth/refresh":                30,
    "/api/auth/password/reset-request": 5,
    "/api/auth/register":               5,
}

_counters: dict[str, dict[str, deque]] = defaultdict(lambda: defaultdict(deque))


def _get_client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    xri = request.headers.get("x-real-ip")
    if xri:
        return xri.strip()
    return request.client.host if request.client else "unknown"


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        path = request.url.path

        for prefix, limit in AUTH_RATE_LIMITS.items():
            if path.startswith(prefix):
                ip = _get_client_ip(request)
                now = time.monotonic()
                window_start = now - WINDOW

                bucket = _counters[prefix][ip]
                while bucket and bucket[0] < window_start:
                    bucket.popleft()

                if len(bucket) >= limit:
                    return JSONResponse(
                        status_code=429,
                        content={"detail": "too_many_requests"},
                        headers={"Retry-After": str(WINDOW)},
                    )

                bucket.append(now)
                break

        return await call_next(request)
