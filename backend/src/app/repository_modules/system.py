from __future__ import annotations

from injector import Module, provider, singleton

from src.infrastructure.db.connection.Database import Database
from src.infrastructure.db.repositories.base.system.HaEntitySyncRepositoryImpl import (
    HaEntitySyncRepositoryImpl,
)
from src.infrastructure.db.repositories.base.system.SystemConnectionRepositoryImpl import (
    SystemConnectionRepositoryImpl,
)


class SystemRepositoryModule(Module):
    @provider
    @singleton
    def provide_system_connection_repository(
        self, db: Database
    ) -> SystemConnectionRepositoryImpl:
        return SystemConnectionRepositoryImpl(db)

    @provider
    @singleton
    def provide_ha_entity_sync_repository(
        self, db: Database
    ) -> HaEntitySyncRepositoryImpl:
        return HaEntitySyncRepositoryImpl(db)
