from __future__ import annotations

from injector import Module, provider, singleton

from src.infrastructure.db.connection.Database import Database
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


class DeviceRepositoryModule(Module):
    @provider
    @singleton
    def provide_device_repository(self, db: Database) -> DeviceRepositoryImpl:
        return DeviceRepositoryImpl(db)

    @provider
    @singleton
    def provide_device_catalog_command_repository(
        self, db: Database
    ) -> DeviceCatalogCommandRepositoryImpl:
        return DeviceCatalogCommandRepositoryImpl(db)

    @provider
    @singleton
    def provide_device_runtime_state_repository(
        self, db: Database
    ) -> DeviceRuntimeStateRepositoryImpl:
        return DeviceRuntimeStateRepositoryImpl(db)

    @provider
    @singleton
    def provide_device_control_schema_repository(
        self, db: Database
    ) -> DeviceControlSchemaRepositoryImpl:
        return DeviceControlSchemaRepositoryImpl(db)
