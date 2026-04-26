from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI

from src.app.container import get_database
from src.app.exception_handlers import register_exception_handlers
from src.app.health_routes import check_redis as _check_redis
from src.app.health_routes import register_health_routes
from src.app.modules import start_app_modules, stop_app_modules
from src.app.observability_middleware import register_observability_middleware
from src.app.openapi_contract import attach_openapi_contract
from src.app.router_registry import register_api_routes
from src.shared.config.Settings import get_settings
from src.shared.observability import get_observability_metrics


@asynccontextmanager
async def lifespan(app: FastAPI):
    await start_app_modules()
    yield
    await stop_app_modules()
    await get_database().dispose()


def create_app() -> FastAPI:
    settings = get_settings()
    get_observability_metrics().reset()
    app = FastAPI(title="Smart Home Backend", version="0.1.0", lifespan=lifespan)

    register_observability_middleware(app)
    register_api_routes(app)
    attach_openapi_contract(app)
    register_exception_handlers(app)
    register_health_routes(
        app,
        settings,
        database_getter=lambda: get_database(),
        redis_checker=lambda redis_url, timeout_seconds: _check_redis(
            redis_url,
            timeout_seconds,
        ),
    )

    return app


app = create_app()
