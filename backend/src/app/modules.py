from __future__ import annotations

from dataclasses import dataclass

from fastapi import APIRouter

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


@dataclass(frozen=True)
class AppModule:
    name: str
    routers: tuple[APIRouter, ...]


APP_MODULES: tuple[AppModule, ...] = (
    AppModule(
        name="auth",
        routers=(
            auth_router,
            pin_auth_router,
            terminal_bootstrap_router,
            terminal_pairing_router,
        ),
    ),
    AppModule(
        name="home_overview",
        routers=(home_overview_router, devices_router),
    ),
    AppModule(
        name="system_connections",
        routers=(device_reload_router, system_connections_router),
    ),
    AppModule(name="device_control", routers=(device_controls_router,)),
    AppModule(name="settings", routers=(settings_router,)),
    AppModule(name="editor", routers=(editor_router,)),
    AppModule(name="energy", routers=(energy_router,)),
    AppModule(name="media", routers=(media_router,)),
    AppModule(name="page_assets", routers=(page_assets_router,)),
    AppModule(name="backups", routers=(backups_router,)),
    AppModule(name="realtime", routers=(realtime_router,)),
)
