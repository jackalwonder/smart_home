from __future__ import annotations

from src.app.container_getters._shared import resolve
from src.infrastructure.db.repositories.base.settings.FavoriteDevicesRepositoryImpl import (
    FavoriteDevicesRepositoryImpl,
)
from src.infrastructure.db.repositories.base.settings.FunctionSettingsRepositoryImpl import (
    FunctionSettingsRepositoryImpl,
)
from src.infrastructure.db.repositories.base.settings.LayoutHotspotRepositoryImpl import (
    LayoutHotspotRepositoryImpl,
)
from src.infrastructure.db.repositories.base.settings.LayoutVersionRepositoryImpl import (
    LayoutVersionRepositoryImpl,
)
from src.infrastructure.db.repositories.base.settings.PageSettingsRepositoryImpl import (
    PageSettingsRepositoryImpl,
)
from src.infrastructure.db.repositories.base.settings.SettingsVersionRepositoryImpl import (
    SettingsVersionRepositoryImpl,
)
from src.infrastructure.db.repositories.query.settings.FavoritesQueryRepositoryImpl import (
    FavoritesQueryRepositoryImpl,
)
from src.infrastructure.db.repositories.query.settings.SettingsSnapshotQueryRepositoryImpl import (
    SettingsSnapshotQueryRepositoryImpl,
)
from src.modules.settings.services.command.SettingsSaveService import SettingsSaveService
from src.modules.settings.services.query.FavoritesQueryService import FavoritesQueryService
from src.modules.settings.services.query.SettingsQueryService import SettingsQueryService
from src.modules.settings.services.query.SgccLoginQrCodeService import SgccLoginQrCodeService
from src.modules.settings.services.query.SgccRuntimeControlService import SgccContainerRestarter


def get_settings_snapshot_query_repository() -> SettingsSnapshotQueryRepositoryImpl:
    return resolve(SettingsSnapshotQueryRepositoryImpl)


def get_favorites_query_repository() -> FavoritesQueryRepositoryImpl:
    return resolve(FavoritesQueryRepositoryImpl)


def get_settings_version_repository() -> SettingsVersionRepositoryImpl:
    return resolve(SettingsVersionRepositoryImpl)


def get_favorite_devices_repository() -> FavoriteDevicesRepositoryImpl:
    return resolve(FavoriteDevicesRepositoryImpl)


def get_page_settings_repository() -> PageSettingsRepositoryImpl:
    return resolve(PageSettingsRepositoryImpl)


def get_function_settings_repository() -> FunctionSettingsRepositoryImpl:
    return resolve(FunctionSettingsRepositoryImpl)


def get_layout_version_repository() -> LayoutVersionRepositoryImpl:
    return resolve(LayoutVersionRepositoryImpl)


def get_layout_hotspot_repository() -> LayoutHotspotRepositoryImpl:
    return resolve(LayoutHotspotRepositoryImpl)


def get_settings_query_service() -> SettingsQueryService:
    return resolve(SettingsQueryService)


def get_favorites_query_service() -> FavoritesQueryService:
    return resolve(FavoritesQueryService)


def get_sgcc_login_qr_code_service() -> SgccLoginQrCodeService:
    return resolve(SgccLoginQrCodeService)


def get_sgcc_container_restarter() -> SgccContainerRestarter:
    return resolve(SgccContainerRestarter)


def get_settings_save_service() -> SettingsSaveService:
    return resolve(SettingsSaveService)


__all__ = [
    "get_favorite_devices_repository",
    "get_favorites_query_repository",
    "get_favorites_query_service",
    "get_function_settings_repository",
    "get_layout_hotspot_repository",
    "get_layout_version_repository",
    "get_page_settings_repository",
    "get_settings_query_service",
    "get_settings_save_service",
    "get_settings_snapshot_query_repository",
    "get_settings_version_repository",
    "get_sgcc_container_restarter",
    "get_sgcc_login_qr_code_service",
]

