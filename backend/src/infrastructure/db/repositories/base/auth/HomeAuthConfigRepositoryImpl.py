from __future__ import annotations

from sqlalchemy import text

from src.infrastructure.db.connection.Database import Database
from src.infrastructure.db.repositories._support import session_scope
from src.repositories.rows.index import HomeAuthConfigRow
from src.shared.kernel.RepoContext import RepoContext


class HomeAuthConfigRepositoryImpl:
    def __init__(self, database: Database) -> None:
        self._database = database

    async def find_by_home_id(
        self,
        home_id: str,
        ctx: RepoContext | None = None,
    ) -> HomeAuthConfigRow | None:
        stmt = text(
            """
            SELECT
                id::text AS id,
                home_id::text AS home_id,
                login_mode::text AS login_mode,
                pin_hash,
                pin_salt,
                pin_retry_limit,
                pin_lock_minutes,
                pin_session_ttl_seconds
            FROM home_auth_configs
            WHERE home_id = :home_id
            """
        )
        async with session_scope(self._database, ctx) as (session, _):
            row = (await session.execute(stmt, {"home_id": home_id})).mappings().one_or_none()
        if row is None:
            return None
        return HomeAuthConfigRow(**row)
