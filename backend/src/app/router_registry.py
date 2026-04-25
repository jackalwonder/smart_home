from __future__ import annotations

from fastapi import FastAPI
from fastapi.routing import APIRoute

from src.app.openapi_contract import build_operation_id
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
from src.modules.home_overview.controllers.DevicesController import router as devices_router
from src.modules.home_overview.controllers.HomeOverviewController import (
    router as home_overview_router,
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


def register_api_routes(app: FastAPI) -> None:
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
            route.operation_id = build_operation_id(route)
