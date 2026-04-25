from __future__ import annotations

from sqlalchemy import text

from src.infrastructure.db.connection.Database import Database
from src.infrastructure.db.repositories._support import session_scope


class HaRealtimeSyncRepositoryImpl:
    def __init__(self, database: Database) -> None:
        self._database = database

    async def list_home_ids(self) -> list[str]:
        stmt = text(
            """
            SELECT id::text AS id
            FROM homes
            ORDER BY created_at ASC
            """
        )
        async with session_scope(self._database) as (session, _):
            rows = (await session.execute(stmt)).mappings().all()
        return [str(row["id"]) for row in rows]
