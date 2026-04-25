from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import text

from src.infrastructure.db.connection.Database import Database
from src.infrastructure.db.repositories._support import session_scope
from src.repositories.query.auth.RequestContextRepository import (
    RequestContextLookupRow,
)


class RequestContextRepositoryImpl:
    def __init__(self, database: Database) -> None:
        self._database = database

    async def find_terminal_context(
        self,
        terminal_id: str,
    ) -> RequestContextLookupRow | None:
        stmt = text(
            """
            SELECT
                home_id::text AS home_id,
                id::text AS terminal_id
            FROM terminals
            WHERE id = :terminal_id
            """
        )
        async with session_scope(self._database) as (session, _):
            row = (
                await session.execute(stmt, {"terminal_id": terminal_id})
            ).mappings().one_or_none()
        if row is None:
            return None
        return RequestContextLookupRow(
            home_id=row["home_id"],
            terminal_id=row["terminal_id"],
        )

    async def find_session_context(
        self,
        session_token: str,
    ) -> RequestContextLookupRow | None:
        stmt = text(
            """
            SELECT
                home_id::text AS home_id,
                terminal_id::text AS terminal_id,
                member_id::text AS operator_id
            FROM pin_sessions
            WHERE session_token_hash = :session_token
              AND is_active = true
              AND expires_at > :now
            ORDER BY verified_at DESC
            LIMIT 1
            """
        )
        async with session_scope(self._database) as (session, _):
            row = (
                await session.execute(
                    stmt,
                    {
                        "session_token": session_token,
                        "now": datetime.now(timezone.utc),
                    },
                )
            ).mappings().one_or_none()
        if row is None:
            return None
        return RequestContextLookupRow(
            home_id=row["home_id"],
            terminal_id=row["terminal_id"],
            operator_id=row["operator_id"],
        )

    async def find_home_id_by_device_id(self, device_id: str) -> str | None:
        stmt = text(
            """
            SELECT home_id::text AS home_id
            FROM devices
            WHERE id = :device_id
            """
        )
        async with session_scope(self._database) as (session, _):
            row = (
                await session.execute(stmt, {"device_id": device_id})
            ).mappings().one_or_none()
        return row["home_id"] if row is not None else None

    async def find_home_id_by_control_request_id(self, request_id: str) -> str | None:
        stmt = text(
            """
            SELECT home_id::text AS home_id
            FROM device_control_requests
            WHERE request_id = :request_id
            ORDER BY created_at DESC
            LIMIT 1
            """
        )
        async with session_scope(self._database) as (session, _):
            row = (
                await session.execute(stmt, {"request_id": request_id})
            ).mappings().one_or_none()
        return row["home_id"] if row is not None else None
