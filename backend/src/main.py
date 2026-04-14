from __future__ import annotations

from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError

from src.app.container import get_database, get_ha_realtime_sync_service
from src.modules.auth.controllers.AuthController import router as auth_router
from src.modules.auth.controllers.PinAuthController import router as pin_auth_router
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
from src.shared.http.ResponseEnvelope import error_response, success_response


def _status_code_for_error(code: ErrorCode) -> int:
    if code in {
        ErrorCode.REQUEST_ID_CONFLICT,
        ErrorCode.VERSION_CONFLICT,
        ErrorCode.DRAFT_LOCK_LOST,
        ErrorCode.DRAFT_LOCK_TAKEN_OVER,
    }:
        return 409
    if code in {ErrorCode.PIN_REQUIRED, ErrorCode.PIN_LOCKED}:
        return 403
    if code == ErrorCode.DEVICE_NOT_FOUND:
        return 404
    if code == ErrorCode.HA_UNAVAILABLE:
        return 503
    return 400


@asynccontextmanager
async def lifespan(app: FastAPI):
    await get_ha_realtime_sync_service().start()
    yield
    await get_ha_realtime_sync_service().stop()
    await get_database().dispose()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Smart Home Backend", version="0.1.0", lifespan=lifespan)

    @app.middleware("http")
    async def attach_trace_id(request: Request, call_next):
        request.state.trace_id = request.headers.get("x-trace-id") or str(uuid4())
        return await call_next(request)

    app.include_router(auth_router)
    app.include_router(pin_auth_router)
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

    @app.exception_handler(AppError)
    async def app_error_handler(request: Request, exc: AppError):
        return error_response(
            request,
            str(exc.code),
            exc.message,
            details=exc.details,
            status_code=exc.status_code or _status_code_for_error(exc.code),
        )

    @app.exception_handler(RequestValidationError)
    async def request_validation_error_handler(request: Request, exc: RequestValidationError):
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

    @app.get("/healthz")
    async def healthz(request: Request):
        return success_response(
            request,
            {
                "status": "ok",
                "app_env": settings.app_env,
            },
        )

    return app


app = create_app()
