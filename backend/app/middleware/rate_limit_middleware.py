import ipaddress
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


def _is_proxy(host: str) -> bool:
    try:
        addr = ipaddress.ip_address(host)
    except ValueError:
        return False
    return addr.is_loopback or addr.is_private


def _get_client_ip(request: Request) -> str:
    peer = request.client.host if request.client else "unknown"
    if not _is_proxy(peer):
        return peer
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[-1].strip()
    xri = request.headers.get("x-real-ip")
    if xri:
        return xri.strip()
    return peer


LOGIN_ACCOUNT_LIMIT = 10
_login_attempts: dict[str, deque] = defaultdict(deque)


def check_login_attempt(login: str) -> bool:
    key = login.strip().lower()
    now = time.monotonic()
    bucket = _login_attempts[key]
    while bucket and bucket[0] < now - WINDOW:
        bucket.popleft()
    if len(bucket) >= LOGIN_ACCOUNT_LIMIT:
        return False
    bucket.append(now)
    return True


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
