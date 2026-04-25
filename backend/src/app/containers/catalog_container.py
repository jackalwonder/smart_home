from __future__ import annotations

from functools import lru_cache

from src.modules.home_overview.services.DeviceCatalogService import DeviceCatalogService
from src.modules.home_overview.services.query.HomeOverviewQueryService import (
    HomeOverviewQueryService,
)


def _root():
    from src.app import container

    return container


@lru_cache(maxsize=1)
def get_home_overview_query_service() -> HomeOverviewQueryService:
    root = _root()
    return HomeOverviewQueryService(
        home_overview_query_repository=root.get_home_overview_query_repository(),
        weather_provider=root.get_weather_provider(),
    )


@lru_cache(maxsize=1)
def get_device_catalog_service() -> DeviceCatalogService:
    root = _root()
    return DeviceCatalogService(
        device_catalog_query_repository=root.get_device_catalog_query_repository(),
        device_catalog_command_repository=root.get_device_catalog_command_repository(),
        unit_of_work=root.get_unit_of_work(),
        device_repository=root.get_device_repository(),
        management_pin_guard=root.get_management_pin_guard(),
    )
