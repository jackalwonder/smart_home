from __future__ import annotations

import time
from uuid import uuid4

from fastapi import FastAPI, Request

from src.shared.observability import (
    collect_http_legacy_context_fields,
    get_observability_metrics,
    log_structured_event,
)


def observability_scope(request: Request) -> str:
    if request.method == "GET" and request.url.path == "/api/v1/auth/session":
        return "auth_session_bootstrap"
    if request.method == "POST" and request.url.path == "/api/v1/auth/session/dev":
        return "auth_session_bootstrap"
    if request.method == "POST" and request.url.path == "/api/v1/auth/session/bootstrap":
        return "auth_session_bootstrap"
    if (
        request.url.path.startswith("/api/v1/terminals/")
        and "/pairing-code-sessions" in request.url.path
    ):
        return "terminal_pairing"
    return "runtime"


def register_observability_middleware(app: FastAPI) -> None:
    @app.middleware("http")
    async def attach_trace_id_and_observe(request: Request, call_next):
        request.state.trace_id = request.headers.get("x-trace-id") or str(uuid4())
        started_at = time.perf_counter()
        legacy_context_fields = collect_http_legacy_context_fields(
            query_params=request.query_params,
            headers=request.headers,
            cookies=request.cookies,
        )
        response = await call_next(request)
        duration_ms = round((time.perf_counter() - started_at) * 1000, 2)
        auth_mode = getattr(request.state, "auth_mode", None)
        scope = observability_scope(request)
        get_observability_metrics().record_http_request(
            status_code=response.status_code,
            auth_mode=auth_mode,
            legacy_context_fields=legacy_context_fields,
            scope=scope,
        )
        log_structured_event(
            "http_request",
            {
                "trace_id": request.state.trace_id,
                "method": request.method,
                "request_path": request.url.path,
                "status_code": response.status_code,
                "duration_ms": duration_ms,
                "client_ip": request.client.host if request.client else None,
                "user_agent": request.headers.get("user-agent"),
                "auth_mode": auth_mode,
                "home_id": getattr(request.state, "home_id", None),
                "terminal_id": getattr(request.state, "terminal_id", None),
                "operator_id": getattr(request.state, "operator_id", None),
                "error_code": getattr(request.state, "error_code", None),
                "legacy_context_fields": legacy_context_fields,
                "observability_scope": scope,
            },
        )
        return response
