from __future__ import annotations

import asyncio
import time
from collections.abc import Awaitable, Callable
from contextlib import asynccontextmanager
from typing import Any
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.openapi.utils import get_openapi
from fastapi.routing import APIRoute
from redis.asyncio import Redis
from starlette.exceptions import HTTPException as StarletteHTTPException

from src.app.container import get_database, get_ha_realtime_sync_service
from src.modules.auth.controllers.AuthController import router as auth_router
from src.modules.auth.controllers.PinAuthController import router as pin_auth_router
from src.modules.auth.controllers.TerminalBootstrapController import (
    router as terminal_bootstrap_router,
)
from src.modules.auth.controllers.TerminalPairingController import (
    router as terminal_pairing_router,
)
from src.modules.backups.controllers.BackupsController import router as backups_router
from src.modules.device_control.controllers.DeviceControlsController import (
    router as device_controls_router,
)
from src.modules.editor.controllers.EditorController import router as editor_router
from src.modules.energy.controllers.EnergyController import router as energy_router
from src.modules.home_overview.controllers.HomeOverviewController import (
    router as home_overview_router,
)
from src.modules.home_overview.controllers.DevicesController import (
    router as devices_router,
)
from src.modules.media.controllers.MediaController import router as media_router
from src.modules.page_assets.controllers.PageAssetsController import router as page_assets_router
from src.modules.realtime.RealtimeGateway import router as realtime_router
from src.modules.settings.controllers.SettingsController import router as settings_router
from src.modules.system_connections.controllers.DeviceReloadController import (
    router as device_reload_router,
)
from src.modules.system_connections.controllers.SystemConnectionsController import (
    router as system_connections_router,
)
from src.shared.config.Settings import get_settings
from src.shared.errors.AppError import AppError
from src.shared.errors.ErrorCode import ErrorCode
from src.shared.http.ResponseEnvelope import SuccessEnvelope, error_response, success_response
from src.shared.observability import (
    collect_http_legacy_context_fields,
    get_observability_metrics,
    log_structured_event,
)

HTTP_METHODS = {"get", "post", "put", "patch", "delete", "head", "options"}
STANDARD_ERROR_RESPONSES: dict[str, str] = {
    "400": "Invalid request parameters",
    "401": "Unauthorized",
    "403": "PIN required or permission denied",
    "404": "Resource not found",
    "405": "Method not allowed",
    "409": "Business conflict",
    "500": "Internal server error",
}
LEGACY_CONTEXT_PARAM_NAMES = {"home_id", "terminal_id", "token", "access_token"}


def _status_code_for_error(code: ErrorCode) -> int:
    if code == ErrorCode.NOT_FOUND:
        return 404
    if code == ErrorCode.METHOD_NOT_ALLOWED:
        return 405
    if code == ErrorCode.INTERNAL_SERVER_ERROR:
        return 500
    if code == ErrorCode.UNAUTHORIZED:
        return 401
    if code in {
        ErrorCode.REQUEST_ID_CONFLICT,
        ErrorCode.VERSION_CONFLICT,
        ErrorCode.DRAFT_LOCK_LOST,
        ErrorCode.DRAFT_LOCK_TAKEN_OVER,
    }:
        return 409
    if code in {ErrorCode.PIN_REQUIRED, ErrorCode.PIN_LOCKED}:
        return 403
    if code in {ErrorCode.DEVICE_NOT_FOUND, ErrorCode.CONTROL_REQUEST_NOT_FOUND}:
        return 404
    if code == ErrorCode.HA_UNAVAILABLE:
        return 503
    return 400


def _observability_scope(request: Request) -> str:
    if request.method == "GET" and request.url.path == "/api/v1/auth/session":
        return "auth_session_bootstrap"
    if request.method == "POST" and request.url.path == "/api/v1/auth/session/bootstrap":
        return "auth_session_bootstrap"
    return "runtime"


def _build_operation_id(route: APIRoute) -> str:
    methods = sorted(method.lower() for method in route.methods if method in {"GET", "POST", "PUT", "PATCH", "DELETE"})
    method_token = "_".join(methods) if methods else "http"
    path_token = (
        route.path_format.strip("/")
        .replace("/", "_")
        .replace("-", "_")
        .replace("{", "")
        .replace("}", "")
    )
    if not path_token:
        path_token = "root"
    return f"{method_token}_{path_token}"


def _error_envelope_schema() -> dict:
    return {
        "type": "object",
        "additionalProperties": False,
        "required": ["success", "data", "error", "meta"],
        "properties": {
            "success": {"type": "boolean"},
            "data": {"type": "null"},
            "error": {
                "type": "object",
                "additionalProperties": False,
                "required": ["code", "message"],
                "properties": {
                    "code": {"type": "string"},
                    "message": {"type": "string"},
                    "details": {"type": "object", "additionalProperties": True},
                },
            },
            "meta": {
                "type": "object",
                "additionalProperties": False,
                "required": ["trace_id", "server_time"],
                "properties": {
                    "trace_id": {"type": "string"},
                    "server_time": {"type": "string"},
                },
            },
        },
    }


def _attach_openapi_contract(app: FastAPI) -> None:
    def custom_openapi() -> dict:
        if app.openapi_schema is not None:
            return app.openapi_schema
        schema = get_openapi(
            title=app.title,
            version=app.version,
            routes=app.routes,
        )
        components = schema.setdefault("components", {})
        security_schemes = components.setdefault("securitySchemes", {})
        security_schemes["BearerAuth"] = {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
            "description": "Primary auth path. home_id/terminal_id from token claim are authoritative.",
        }
        security_schemes["BootstrapAuth"] = {
            "type": "apiKey",
            "in": "header",
            "name": "Authorization",
            "description": "Session bootstrap only. Use Authorization: Bootstrap <bootstrap_token>.",
        }

        for path, operations in schema.get("paths", {}).items():
            for method, operation in operations.items():
                if method not in HTTP_METHODS:
                    continue
                if path.startswith("/api/v1/"):
                    operation.setdefault("security", [{"BearerAuth": []}])
                if path == "/api/v1/auth/session/bootstrap":
                    operation["security"] = [{"BootstrapAuth": []}]
                if path.startswith("/api/v1/terminals/") and "/pairing-code-sessions" in path:
                    operation["security"] = []
                responses = operation.setdefault("responses", {})
                for code, description in STANDARD_ERROR_RESPONSES.items():
                    responses.setdefault(
                        code,
                        {
                            "description": description,
                            "content": {
                                "application/json": {
                                    "schema": _error_envelope_schema(),
                                }
                            },
                        },
                    )
                for parameter in operation.get("parameters", []):
                    if (
                        parameter.get("name") in LEGACY_CONTEXT_PARAM_NAMES
                        and parameter.get("in") in {"query", "header", "cookie"}
                    ):
                        parameter["deprecated"] = True
                        note = "Legacy compatibility field. Bearer access token claim is authoritative."
                        description = parameter.get("description")
                        if description is None or note not in description:
                            parameter["description"] = (
                                f"{description} {note}".strip() if description else note
                            )
        app.openapi_schema = schema
        return app.openapi_schema

    app.openapi = custom_openapi


async def _run_readiness_check(check: Callable[[], Awaitable[None]]) -> dict[str, str]:
    try:
        await check()
    except Exception as exc:
        return {
            "status": "unavailable",
            "error_type": exc.__class__.__name__,
        }
    return {"status": "ok"}


async def _check_redis(redis_url: str, timeout_seconds: float) -> None:
    client = Redis.from_url(
        redis_url,
        socket_connect_timeout=timeout_seconds,
        socket_timeout=timeout_seconds,
    )
    try:
        await client.ping()
    finally:
        await client.aclose()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await get_ha_realtime_sync_service().start()
    yield
    await get_ha_realtime_sync_service().stop()
    await get_database().dispose()


def create_app() -> FastAPI:
    settings = get_settings()
    get_observability_metrics().reset()
    app = FastAPI(title="Smart Home Backend", version="0.1.0", lifespan=lifespan)

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
        observability_scope = _observability_scope(request)
        get_observability_metrics().record_http_request(
            status_code=response.status_code,
            auth_mode=auth_mode,
            legacy_context_fields=legacy_context_fields,
            scope=observability_scope,
        )
        log_payload = {
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
            "observability_scope": observability_scope,
        }
        log_structured_event("http_request", log_payload)
        return response

    app.include_router(auth_router)
    app.include_router(pin_auth_router)
    app.include_router(terminal_bootstrap_router)
    app.include_router(terminal_pairing_router)
    app.include_router(home_overview_router)
    app.include_router(device_reload_router)
    app.include_router(devices_router)
    app.include_router(device_controls_router)
    app.include_router(settings_router)
    app.include_router(editor_router)
    app.include_router(system_connections_router)
    app.include_router(energy_router)
    app.include_router(media_router)
    app.include_router(page_assets_router)
    app.include_router(backups_router)
    app.include_router(realtime_router)
    for route in app.routes:
        if isinstance(route, APIRoute) and route.path.startswith("/api/v1/"):
            route.operation_id = _build_operation_id(route)
    _attach_openapi_contract(app)

    @app.exception_handler(AppError)
    async def app_error_handler(request: Request, exc: AppError):
        request.state.error_code = str(exc.code)
        return error_response(
            request,
            str(exc.code),
            exc.message,
            details=exc.details,
            status_code=exc.status_code or _status_code_for_error(exc.code),
        )

    @app.exception_handler(RequestValidationError)
    async def request_validation_error_handler(request: Request, exc: RequestValidationError):
        request.state.error_code = str(ErrorCode.INVALID_PARAMS)
        details = {
            "fields": [
                {
                    "field": ".".join(str(part) for part in error["loc"] if part != "body"),
                    "reason": error["type"],
                }
                for error in exc.errors()
            ]
        }
        return error_response(
            request,
            str(ErrorCode.INVALID_PARAMS),
            "请求参数不合法",
            details=details,
            status_code=400,
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException):
        if exc.status_code == 404:
            code = ErrorCode.NOT_FOUND
            message = "接口不存在"
        elif exc.status_code == 405:
            code = ErrorCode.METHOD_NOT_ALLOWED
            message = "请求方法不被允许"
        else:
            code = ErrorCode.INVALID_PARAMS
            message = str(exc.detail) if isinstance(exc.detail, str) else "请求不合法"
        request.state.error_code = str(code)
        return error_response(
            request,
            str(code),
            message,
            status_code=exc.status_code,
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        request.state.error_code = str(ErrorCode.INTERNAL_SERVER_ERROR)
        return error_response(
            request,
            str(ErrorCode.INTERNAL_SERVER_ERROR),
            "服务端内部异常",
            details={"exception_type": exc.__class__.__name__},
            status_code=500,
        )

    @app.get("/healthz", response_model=SuccessEnvelope[dict[str, str]])
    async def healthz(request: Request):
        return success_response(
            request,
            {
                "status": "ok",
                "app_env": settings.app_env,
            },
        )

    @app.get("/readyz", response_model=SuccessEnvelope[dict[str, Any]])
    async def readyz(request: Request):
        timeout_seconds = settings.readiness_check_timeout_seconds
        database_check, redis_check = await asyncio.gather(
            _run_readiness_check(
                lambda: asyncio.wait_for(get_database().check(), timeout=timeout_seconds),
            ),
            _run_readiness_check(
                lambda: asyncio.wait_for(
                    _check_redis(settings.redis_url, timeout_seconds),
                    timeout=timeout_seconds,
                ),
            ),
        )
        checks = {
            "database": database_check,
            "redis": redis_check,
        }
        if any(check["status"] != "ok" for check in checks.values()):
            return error_response(
                request,
                str(ErrorCode.INTERNAL_SERVER_ERROR),
                "服务未就绪",
                details={"checks": checks},
                status_code=503,
            )
        return success_response(
            request,
            {
                "status": "ready",
                "app_env": settings.app_env,
                "checks": checks,
            },
        )

    @app.get(
        "/observabilityz",
        response_model=SuccessEnvelope[dict[str, Any]],
        include_in_schema=False,
    )
    async def observabilityz(request: Request):
        return success_response(request, get_observability_metrics().snapshot())

    return app


app = create_app()
