from __future__ import annotations

from fastapi import FastAPI
from fastapi.routing import APIRoute

from src.app.modules import APP_MODULES
from src.app.openapi_contract import build_operation_id


def register_api_routes(app: FastAPI) -> None:
    for module in APP_MODULES:
        for router in module.routers:
            app.include_router(router)

    for route in app.routes:
        if isinstance(route, APIRoute) and route.path.startswith("/api/v1/"):
            route.operation_id = build_operation_id(route)
