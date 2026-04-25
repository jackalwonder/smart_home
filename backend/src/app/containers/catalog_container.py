from __future__ import annotations

from functools import lru_cache

from src.app.containers import auth_container, core_container, repositories_container
from src.modules.home_overview.services.DeviceCatalogService import DeviceCatalogService
from src.modules.home_overview.services.query.HomeOverviewQueryService import (
    HomeOverviewQueryService,
)


@lru_cache(maxsize=1)
def get_home_overview_query_service() -> HomeOverviewQueryService:
    return HomeOverviewQueryService(
        home_overview_query_repository=repositories_container.get_home_overview_query_repository(),
        weather_provider=core_container.get_weather_provider(),
    )


@lru_cache(maxsize=1)
def get_device_catalog_service() -> DeviceCatalogService:
    return DeviceCatalogService(
        device_catalog_query_repository=repositories_container.get_device_catalog_query_repository(),
        device_catalog_command_repository=repositories_container.get_device_catalog_command_repository(),
        unit_of_work=repositories_container.get_unit_of_work(),
        device_repository=repositories_container.get_device_repository(),
        management_pin_guard=auth_container.get_management_pin_guard(),
    )
