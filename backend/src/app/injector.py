from __future__ import annotations

from injector import Injector

from src.app.core_di import CoreModule
from src.app.repository_di import RepositoryModule
from src.app.auth_di import AuthModule
from src.app.catalog_di import CatalogModule
from src.app.editor_di import EditorModule
from src.app.energy_di import EnergyModule
from src.app.settings_di import SettingsModule
from src.app.realtime_di import RealtimeModule
from src.app.backup_di import BackupModule

_app_injector = Injector(
    [
        CoreModule(),
        RepositoryModule(),
        AuthModule(),
        CatalogModule(),
        EditorModule(),
        EnergyModule(),
        SettingsModule(),
        RealtimeModule(),
        BackupModule(),
    ]
)


def get_injector() -> Injector:
    return _app_injector
