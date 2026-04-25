from __future__ import annotations

from sqlalchemy import text

from src.infrastructure.db.connection.Database import Database
from src.infrastructure.db.repositories._support import session_scope


class TerminalPresenceRepositoryImpl:
    def __init__(self, database: Database) -> None:
        self._database = database

    async def touch_terminal(
        self,
        *,
        terminal_id: str,
        client_host: str | None,
    ) -> None:
        stmt = text(
            """
            UPDATE terminals
            SET last_seen_at = now(), last_ip = :client_host
            WHERE id = :terminal_id
            """
        )
        async with session_scope(self._database) as (session, owned):
            await session.execute(
                stmt,
                {"terminal_id": terminal_id, "client_host": client_host},
            )
            if owned:
                await session.commit()
