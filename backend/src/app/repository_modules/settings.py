from __future__ import annotations

from injector import Module, provider, singleton

from src.infrastructure.db.connection.Database import Database
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


class SettingsRepositoryModule(Module):
    @provider
    @singleton
    def provide_settings_snapshot_query_repository(
        self, db: Database
    ) -> SettingsSnapshotQueryRepositoryImpl:
        return SettingsSnapshotQueryRepositoryImpl(db)

    @provider
    @singleton
    def provide_favorites_query_repository(
        self, db: Database
    ) -> FavoritesQueryRepositoryImpl:
        return FavoritesQueryRepositoryImpl(db)

    @provider
    @singleton
    def provide_settings_version_repository(
        self, db: Database
    ) -> SettingsVersionRepositoryImpl:
        return SettingsVersionRepositoryImpl(db)

    @provider
    @singleton
    def provide_favorite_devices_repository(
        self, db: Database
    ) -> FavoriteDevicesRepositoryImpl:
        return FavoriteDevicesRepositoryImpl(db)

    @provider
    @singleton
    def provide_page_settings_repository(
        self, db: Database
    ) -> PageSettingsRepositoryImpl:
        return PageSettingsRepositoryImpl(db)

    @provider
    @singleton
    def provide_function_settings_repository(
        self, db: Database
    ) -> FunctionSettingsRepositoryImpl:
        return FunctionSettingsRepositoryImpl(db)

    @provider
    @singleton
    def provide_layout_version_repository(
        self, db: Database
    ) -> LayoutVersionRepositoryImpl:
        return LayoutVersionRepositoryImpl(db)

    @provider
    @singleton
    def provide_layout_hotspot_repository(
        self, db: Database
    ) -> LayoutHotspotRepositoryImpl:
        return LayoutHotspotRepositoryImpl(db)
