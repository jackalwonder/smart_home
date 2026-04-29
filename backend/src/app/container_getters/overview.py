from __future__ import annotations

from src.app.container_getters._shared import resolve
from src.infrastructure.db.repositories.query.overview.DeviceCatalogQueryRepositoryImpl import (
    DeviceCatalogQueryRepositoryImpl,
)
from src.infrastructure.db.repositories.query.overview.HomeOverviewQueryRepositoryImpl import (
    HomeOverviewQueryRepositoryImpl,
)
from src.modules.home_overview.services.DeviceCatalogService import DeviceCatalogService
from src.modules.home_overview.services.query.HomeOverviewQueryService import (
    HomeOverviewQueryService,
)


def get_home_overview_query_repository() -> HomeOverviewQueryRepositoryImpl:
    return resolve(HomeOverviewQueryRepositoryImpl)


def get_device_catalog_query_repository() -> DeviceCatalogQueryRepositoryImpl:
    return resolve(DeviceCatalogQueryRepositoryImpl)


def get_home_overview_query_service() -> HomeOverviewQueryService:
    return resolve(HomeOverviewQueryService)


def get_device_catalog_service() -> DeviceCatalogService:
    return resolve(DeviceCatalogService)


__all__ = [
    "get_device_catalog_query_repository",
    "get_device_catalog_service",
    "get_home_overview_query_repository",
    "get_home_overview_query_service",
]

