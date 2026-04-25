from __future__ import annotations

from functools import lru_cache

from src.app.containers import core_container
from src.infrastructure.db.repositories.base.devices.DeviceCatalogCommandRepositoryImpl import (
    DeviceCatalogCommandRepositoryImpl,
)
from src.infrastructure.db.repositories.base.devices.DeviceControlSchemaRepositoryImpl import (
    DeviceControlSchemaRepositoryImpl,
)
from src.infrastructure.db.repositories.base.devices.DeviceRepositoryImpl import (
    DeviceRepositoryImpl,
)
from src.infrastructure.db.repositories.base.devices.DeviceRuntimeStateRepositoryImpl import (
    DeviceRuntimeStateRepositoryImpl,
)
from src.infrastructure.db.repositories.query.overview.DeviceCatalogQueryRepositoryImpl import (
    DeviceCatalogQueryRepositoryImpl,
)
from src.infrastructure.db.repositories.query.overview.HomeOverviewQueryRepositoryImpl import (
    HomeOverviewQueryRepositoryImpl,
)


def _database():
    return core_container.get_database()


@lru_cache(maxsize=1)
def get_home_overview_query_repository() -> HomeOverviewQueryRepositoryImpl:
    return HomeOverviewQueryRepositoryImpl(_database())


@lru_cache(maxsize=1)
def get_device_catalog_query_repository() -> DeviceCatalogQueryRepositoryImpl:
    return DeviceCatalogQueryRepositoryImpl(_database())


@lru_cache(maxsize=1)
def get_device_repository() -> DeviceRepositoryImpl:
    return DeviceRepositoryImpl(_database())


@lru_cache(maxsize=1)
def get_device_catalog_command_repository() -> DeviceCatalogCommandRepositoryImpl:
    return DeviceCatalogCommandRepositoryImpl(_database())


@lru_cache(maxsize=1)
def get_device_runtime_state_repository() -> DeviceRuntimeStateRepositoryImpl:
    return DeviceRuntimeStateRepositoryImpl(_database())


@lru_cache(maxsize=1)
def get_device_control_schema_repository() -> DeviceControlSchemaRepositoryImpl:
    return DeviceControlSchemaRepositoryImpl(_database())
