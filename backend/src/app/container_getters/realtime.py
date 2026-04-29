from __future__ import annotations

from src.app.container_getters._shared import resolve
from src.infrastructure.db.repositories.base.realtime.HaRealtimeSyncRepositoryImpl import (
    HaRealtimeSyncRepositoryImpl,
)
from src.infrastructure.db.repositories.base.realtime.TerminalPresenceRepositoryImpl import (
    TerminalPresenceRepositoryImpl,
)
from src.infrastructure.db.repositories.base.realtime.WsEventOutboxRepositoryImpl import (
    WsEventOutboxRepositoryImpl,
)
from src.modules.realtime.RealtimeService import RealtimeService


def get_ws_event_outbox_repository() -> WsEventOutboxRepositoryImpl:
    return resolve(WsEventOutboxRepositoryImpl)


def get_ha_realtime_sync_repository() -> HaRealtimeSyncRepositoryImpl:
    return resolve(HaRealtimeSyncRepositoryImpl)


def get_terminal_presence_repository() -> TerminalPresenceRepositoryImpl:
    return resolve(TerminalPresenceRepositoryImpl)


def get_realtime_service() -> RealtimeService:
    return resolve(RealtimeService)


__all__ = [
    "get_ha_realtime_sync_repository",
    "get_realtime_service",
    "get_terminal_presence_repository",
    "get_ws_event_outbox_repository",
]

