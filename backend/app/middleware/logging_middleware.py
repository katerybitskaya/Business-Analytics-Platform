import logging
import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger("app.http")

_SKIP_PATHS = {"/api/health"}


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        if request.url.path in _SKIP_PATHS:
            return await call_next(request)

        t0 = time.monotonic()
        try:
            response = await call_next(request)
        except Exception as exc:
            elapsed = round((time.monotonic() - t0) * 1000)
            logger.error(
                "%s %s → UNHANDLED EXCEPTION (%dms): %s",
                request.method,
                request.url.path,
                elapsed,
                exc,
            )
            raise

        elapsed = round((time.monotonic() - t0) * 1000)
        status = response.status_code

        if status >= 500:
            log = logger.error
        elif status >= 400:
            log = logger.warning
        else:
            log = logger.info

        log(
            "%s %s → %d (%dms)",
            request.method,
            request.url.path,
            status,
            elapsed,
        )
        return response
