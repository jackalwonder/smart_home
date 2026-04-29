from __future__ import annotations

from injector import Module, provider, singleton

from src.infrastructure.db.connection.Database import Database
from src.infrastructure.db.repositories.base.realtime.HaRealtimeSyncRepositoryImpl import (
    HaRealtimeSyncRepositoryImpl,
)
from src.infrastructure.db.repositories.base.realtime.TerminalPresenceRepositoryImpl import (
    TerminalPresenceRepositoryImpl,
)
from src.infrastructure.db.repositories.base.realtime.WsEventOutboxRepositoryImpl import (
    WsEventOutboxRepositoryImpl,
)


class RealtimeRepositoryModule(Module):
    @provider
    @singleton
    def provide_ws_event_outbox_repository(
        self, db: Database
    ) -> WsEventOutboxRepositoryImpl:
        return WsEventOutboxRepositoryImpl(db)

    @provider
    @singleton
    def provide_ha_realtime_sync_repository(
        self, db: Database
    ) -> HaRealtimeSyncRepositoryImpl:
        return HaRealtimeSyncRepositoryImpl(db)

    @provider
    @singleton
    def provide_terminal_presence_repository(
        self, db: Database
    ) -> TerminalPresenceRepositoryImpl:
        return TerminalPresenceRepositoryImpl(db)
