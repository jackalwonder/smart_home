from __future__ import annotations

from functools import lru_cache

from src.app.containers import core_container
from src.infrastructure.db.repositories.base.realtime.HaRealtimeSyncRepositoryImpl import (
    HaRealtimeSyncRepositoryImpl,
)
from src.infrastructure.db.repositories.base.realtime.TerminalPresenceRepositoryImpl import (
    TerminalPresenceRepositoryImpl,
)
from src.infrastructure.db.repositories.base.realtime.WsEventOutboxRepositoryImpl import (
    WsEventOutboxRepositoryImpl,
)
from src.infrastructure.db.repositories.base.system.HaEntitySyncRepositoryImpl import (
    HaEntitySyncRepositoryImpl,
)
from src.infrastructure.db.repositories.base.system.SystemConnectionRepositoryImpl import (
    SystemConnectionRepositoryImpl,
)


def _database():
    return core_container.get_database()


@lru_cache(maxsize=1)
def get_ws_event_outbox_repository() -> WsEventOutboxRepositoryImpl:
    return WsEventOutboxRepositoryImpl(_database())


@lru_cache(maxsize=1)
def get_ha_realtime_sync_repository() -> HaRealtimeSyncRepositoryImpl:
    return HaRealtimeSyncRepositoryImpl(_database())


@lru_cache(maxsize=1)
def get_terminal_presence_repository() -> TerminalPresenceRepositoryImpl:
    return TerminalPresenceRepositoryImpl(_database())


@lru_cache(maxsize=1)
def get_system_connection_repository() -> SystemConnectionRepositoryImpl:
    return SystemConnectionRepositoryImpl(_database())


@lru_cache(maxsize=1)
def get_ha_entity_sync_repository() -> HaEntitySyncRepositoryImpl:
    return HaEntitySyncRepositoryImpl(_database())
