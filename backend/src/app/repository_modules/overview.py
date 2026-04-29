from __future__ import annotations

from injector import Module, provider, singleton

from src.infrastructure.db.connection.Database import Database
from src.infrastructure.db.repositories.query.overview.DeviceCatalogQueryRepositoryImpl import (
    DeviceCatalogQueryRepositoryImpl,
)
from src.infrastructure.db.repositories.query.overview.HomeOverviewQueryRepositoryImpl import (
    HomeOverviewQueryRepositoryImpl,
)


class OverviewRepositoryModule(Module):
    @provider
    @singleton
    def provide_home_overview_query_repository(
        self, db: Database
    ) -> HomeOverviewQueryRepositoryImpl:
        return HomeOverviewQueryRepositoryImpl(db)

    @provider
    @singleton
    def provide_device_catalog_query_repository(
        self, db: Database
    ) -> DeviceCatalogQueryRepositoryImpl:
        return DeviceCatalogQueryRepositoryImpl(db)
