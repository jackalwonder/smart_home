from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI

from src.app.container import get_database
from src.modules.auth.controllers.AuthController import router as auth_router
from src.modules.device_control.controllers.DeviceControlsController import (
    router as device_controls_router,
)
from src.modules.home_overview.controllers.HomeOverviewController import (
    router as home_overview_router,
)
from src.shared.config.Settings import get_settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await get_database().dispose()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Smart Home Backend", version="0.1.0", lifespan=lifespan)
    app.include_router(auth_router)
    app.include_router(home_overview_router)
    app.include_router(device_controls_router)

    @app.get("/healthz")
    async def healthz() -> dict[str, str]:
        return {
            "status": "ok",
            "app_env": settings.app_env,
        }

    return app


app = create_app()
