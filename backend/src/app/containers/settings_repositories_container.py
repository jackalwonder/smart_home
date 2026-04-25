from __future__ import annotations

from functools import lru_cache

from src.app.containers import core_container
from src.infrastructure.db.repositories.base.media.MediaBindingRepositoryImpl import (
    MediaBindingRepositoryImpl,
)
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


def _database():
    return core_container.get_database()


@lru_cache(maxsize=1)
def get_settings_snapshot_query_repository() -> SettingsSnapshotQueryRepositoryImpl:
    return SettingsSnapshotQueryRepositoryImpl(_database())


@lru_cache(maxsize=1)
def get_favorites_query_repository() -> FavoritesQueryRepositoryImpl:
    return FavoritesQueryRepositoryImpl(_database())


@lru_cache(maxsize=1)
def get_settings_version_repository() -> SettingsVersionRepositoryImpl:
    return SettingsVersionRepositoryImpl(_database())


@lru_cache(maxsize=1)
def get_favorite_devices_repository() -> FavoriteDevicesRepositoryImpl:
    return FavoriteDevicesRepositoryImpl(_database())


@lru_cache(maxsize=1)
def get_page_settings_repository() -> PageSettingsRepositoryImpl:
    return PageSettingsRepositoryImpl(_database())


@lru_cache(maxsize=1)
def get_function_settings_repository() -> FunctionSettingsRepositoryImpl:
    return FunctionSettingsRepositoryImpl(_database())


@lru_cache(maxsize=1)
def get_layout_version_repository() -> LayoutVersionRepositoryImpl:
    return LayoutVersionRepositoryImpl(_database())


@lru_cache(maxsize=1)
def get_layout_hotspot_repository() -> LayoutHotspotRepositoryImpl:
    return LayoutHotspotRepositoryImpl(_database())


@lru_cache(maxsize=1)
def get_media_binding_repository() -> MediaBindingRepositoryImpl:
    return MediaBindingRepositoryImpl(_database())
