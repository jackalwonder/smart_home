from __future__ import annotations

from injector import Binder, Module

from src.app.repository_modules.auth import AuthRepositoryModule
from src.app.repository_modules.backups import BackupRepositoryModule
from src.app.repository_modules.device_control import DeviceControlRepositoryModule
from src.app.repository_modules.devices import DeviceRepositoryModule
from src.app.repository_modules.editor import EditorRepositoryModule
from src.app.repository_modules.energy import EnergyRepositoryModule
from src.app.repository_modules.media import MediaRepositoryModule
from src.app.repository_modules.overview import OverviewRepositoryModule
from src.app.repository_modules.page_assets import PageAssetRepositoryModule
from src.app.repository_modules.realtime import RealtimeRepositoryModule
from src.app.repository_modules.settings import SettingsRepositoryModule
from src.app.repository_modules.system import SystemRepositoryModule
from src.app.repository_modules.unit_of_work import UnitOfWorkModule


class RepositoryModule(Module):
    def configure(self, binder: Binder) -> None:
        binder.install(AuthRepositoryModule())
        binder.install(OverviewRepositoryModule())
        binder.install(SettingsRepositoryModule())
        binder.install(EditorRepositoryModule())
        binder.install(DeviceRepositoryModule())
        binder.install(DeviceControlRepositoryModule())
        binder.install(RealtimeRepositoryModule())
        binder.install(SystemRepositoryModule())
        binder.install(EnergyRepositoryModule())
        binder.install(MediaRepositoryModule())
        binder.install(BackupRepositoryModule())
        binder.install(PageAssetRepositoryModule())
        binder.install(UnitOfWorkModule())
