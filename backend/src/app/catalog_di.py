from __future__ import annotations

from injector import Module, provider, singleton

from src.infrastructure.capabilities.impl.DbCapabilityProvider import DbCapabilityProvider
from src.infrastructure.weather.impl.OpenMeteoWeatherProvider import OpenMeteoWeatherProvider
from src.modules.home_overview.services.DeviceCatalogService import DeviceCatalogService
from src.modules.home_overview.services.query.HomeOverviewQueryService import (
    HomeOverviewQueryService,
)
from src.modules.auth.services.guard.ManagementPinGuard import ManagementPinGuard
from src.infrastructure.db.repositories.query.overview.HomeOverviewQueryRepositoryImpl import (
    HomeOverviewQueryRepositoryImpl,
)
from src.infrastructure.db.repositories.query.overview.DeviceCatalogQueryRepositoryImpl import (
    DeviceCatalogQueryRepositoryImpl,
)
from src.infrastructure.db.repositories.base.devices.DeviceCatalogCommandRepositoryImpl import (
    DeviceCatalogCommandRepositoryImpl,
)
from src.infrastructure.db.repositories.base.devices.DeviceRepositoryImpl import DeviceRepositoryImpl
from src.infrastructure.db.unit_of_work.PostgresUnitOfWork import PostgresUnitOfWork


class CatalogModule(Module):
    @provider
    @singleton
    def provide_home_overview_query_service(
        self,
        home_overview_query_repository: HomeOverviewQueryRepositoryImpl,
        weather_provider: OpenMeteoWeatherProvider,
    ) -> HomeOverviewQueryService:
        return HomeOverviewQueryService(
            home_overview_query_repository=home_overview_query_repository,
            weather_provider=weather_provider,
        )

    @provider
    @singleton
    def provide_device_catalog_service(
        self,
        device_catalog_query_repository: DeviceCatalogQueryRepositoryImpl,
        device_catalog_command_repository: DeviceCatalogCommandRepositoryImpl,
        unit_of_work: PostgresUnitOfWork,
        device_repository: DeviceRepositoryImpl,
        management_pin_guard: ManagementPinGuard,
    ) -> DeviceCatalogService:
        return DeviceCatalogService(
            device_catalog_query_repository=device_catalog_query_repository,
            device_catalog_command_repository=device_catalog_command_repository,
            unit_of_work=unit_of_work,
            device_repository=device_repository,
            management_pin_guard=management_pin_guard,
        )
