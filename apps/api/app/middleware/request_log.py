"""Access logging: method, path, status and latency only. No bodies, no patient data."""

from __future__ import annotations

import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware

from apps.api.app.core.logging import get_logger


class RequestLogMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        request_id = uuid.uuid4().hex[:12]
        started = time.perf_counter()
        response = await call_next(request)
        elapsed_ms = (time.perf_counter() - started) * 1000
        response.headers["X-Request-ID"] = request_id
        get_logger().info(
            "%s %s -> %s in %.1f ms [%s]",
            request.method,
            request.url.path,
            response.status_code,
            elapsed_ms,
            request_id,
        )
        return response
