from __future__ import annotations

from src.app.container_getters._shared import resolve
from src.infrastructure.db.repositories.base.system.HaEntitySyncRepositoryImpl import (
    HaEntitySyncRepositoryImpl,
)
from src.infrastructure.db.repositories.base.system.SystemConnectionRepositoryImpl import (
    SystemConnectionRepositoryImpl,
)
from src.modules.system_connections.services.HaEntitySyncService import HaEntitySyncService
from src.modules.system_connections.services.HaRealtimeSyncService import HaRealtimeSyncService
from src.modules.system_connections.services.SystemConnectionService import (
    SystemConnectionService,
)


def get_system_connection_repository() -> SystemConnectionRepositoryImpl:
    return resolve(SystemConnectionRepositoryImpl)


def get_ha_entity_sync_repository() -> HaEntitySyncRepositoryImpl:
    return resolve(HaEntitySyncRepositoryImpl)


def get_ha_entity_sync_service() -> HaEntitySyncService:
    return resolve(HaEntitySyncService)


def get_ha_realtime_sync_service() -> HaRealtimeSyncService:
    return resolve(HaRealtimeSyncService)


def get_system_connection_service() -> SystemConnectionService:
    return resolve(SystemConnectionService)


__all__ = [
    "get_ha_entity_sync_repository",
    "get_ha_entity_sync_service",
    "get_ha_realtime_sync_service",
    "get_system_connection_repository",
    "get_system_connection_service",
]

