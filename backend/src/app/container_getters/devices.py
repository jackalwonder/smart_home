from __future__ import annotations

from src.app.container_getters._shared import resolve
from src.infrastructure.db.repositories.base.devices.DeviceCatalogCommandRepositoryImpl import (
    DeviceCatalogCommandRepositoryImpl,
)
from src.infrastructure.db.repositories.base.devices.DeviceControlSchemaRepositoryImpl import (
    DeviceControlSchemaRepositoryImpl,
)
from src.infrastructure.db.repositories.base.devices.DeviceRepositoryImpl import DeviceRepositoryImpl
from src.infrastructure.db.repositories.base.devices.DeviceRuntimeStateRepositoryImpl import (
    DeviceRuntimeStateRepositoryImpl,
)


def get_device_repository() -> DeviceRepositoryImpl:
    return resolve(DeviceRepositoryImpl)


def get_device_catalog_command_repository() -> DeviceCatalogCommandRepositoryImpl:
    return resolve(DeviceCatalogCommandRepositoryImpl)


def get_device_runtime_state_repository() -> DeviceRuntimeStateRepositoryImpl:
    return resolve(DeviceRuntimeStateRepositoryImpl)


def get_device_control_schema_repository() -> DeviceControlSchemaRepositoryImpl:
    return resolve(DeviceControlSchemaRepositoryImpl)


__all__ = [
    "get_device_catalog_command_repository",
    "get_device_control_schema_repository",
    "get_device_repository",
    "get_device_runtime_state_repository",
]

