from __future__ import annotations

from injector import Module, provider, singleton

from src.infrastructure.db.connection.Database import Database
from src.infrastructure.db.repositories.base.control.DeviceControlRequestRepositoryImpl import (
    DeviceControlRequestRepositoryImpl,
)
from src.infrastructure.db.repositories.base.control.DeviceControlTransitionRepositoryImpl import (
    DeviceControlTransitionRepositoryImpl,
)
from src.infrastructure.db.repositories.query.control.DeviceControlQueryRepositoryImpl import (
    DeviceControlQueryRepositoryImpl,
)


class DeviceControlRepositoryModule(Module):
    @provider
    @singleton
    def provide_device_control_query_repository(
        self, db: Database
    ) -> DeviceControlQueryRepositoryImpl:
        return DeviceControlQueryRepositoryImpl(db)

    @provider
    @singleton
    def provide_device_control_request_repository(
        self, db: Database
    ) -> DeviceControlRequestRepositoryImpl:
        return DeviceControlRequestRepositoryImpl(db)

    @provider
    @singleton
    def provide_device_control_transition_repository(
        self, db: Database
    ) -> DeviceControlTransitionRepositoryImpl:
        return DeviceControlTransitionRepositoryImpl(db)
