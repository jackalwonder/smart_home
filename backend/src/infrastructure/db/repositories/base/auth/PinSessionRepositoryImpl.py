from __future__ import annotations

from sqlalchemy import text

from src.infrastructure.db.connection.Database import Database
from src.infrastructure.db.repositories._support import session_scope
from src.repositories.base.auth.PinSessionRepository import NewPinSessionRow
from src.repositories.rows.index import PinSessionRow
from src.shared.kernel.RepoContext import RepoContext


def _to_pin_session_row(row) -> PinSessionRow:
    return PinSessionRow(
        id=row["id"],
        home_id=row["home_id"],
        terminal_id=row["terminal_id"],
        member_id=row["member_id"],
        verified_for_action=row["verified_for_action"],
        is_active=row["is_active"],
        verified_at=row["verified_at"],
        expires_at=row["expires_at"],
    )


class PinSessionRepositoryImpl:
    def __init__(self, database: Database) -> None:
        self._database = database

    async def find_active_by_home_and_terminal(
        self,
        home_id: str,
        terminal_id: str,
        ctx: RepoContext | None = None,
    ) -> PinSessionRow | None:
        stmt = text(
            """
            SELECT
                id::text AS id,
                home_id::text AS home_id,
                terminal_id::text AS terminal_id,
                member_id::text AS member_id,
                verified_for_action,
                is_active,
                verified_at::text AS verified_at,
                expires_at::text AS expires_at
            FROM pin_sessions
            WHERE home_id = :home_id
              AND terminal_id = :terminal_id
              AND is_active = true
            ORDER BY verified_at DESC
            LIMIT 1
            """
        )
        async with session_scope(self._database, ctx) as (session, _):
            row = (
                await session.execute(
                    stmt,
                    {"home_id": home_id, "terminal_id": terminal_id},
                )
            ).mappings().one_or_none()
        return _to_pin_session_row(row) if row is not None else None

    async def insert(
        self,
        input: NewPinSessionRow,
        ctx: RepoContext | None = None,
    ) -> PinSessionRow:
        stmt = text(
            """
            INSERT INTO pin_sessions (
                home_id,
                terminal_id,
                member_id,
                verified_for_action,
                session_token_hash,
                verified_at,
                expires_at
            ) VALUES (
                :home_id,
                :terminal_id,
                :member_id,
                :verified_for_action,
                :session_token_hash,
                :verified_at,
                :expires_at
            )
            RETURNING
                id::text AS id,
                home_id::text AS home_id,
                terminal_id::text AS terminal_id,
                member_id::text AS member_id,
                verified_for_action,
                is_active,
                verified_at::text AS verified_at,
                expires_at::text AS expires_at
            """
        )
        async with session_scope(self._database, ctx) as (session, owned):
            row = (
                await session.execute(
                    stmt,
                    {
                        "home_id": input.home_id,
                        "terminal_id": input.terminal_id,
                        "member_id": input.member_id,
                        "verified_for_action": input.verified_for_action,
                        "session_token_hash": input.session_token_hash,
                        "verified_at": input.verified_at,
                        "expires_at": input.expires_at,
                    },
                )
            ).mappings().one()
            if owned:
                await session.commit()
        return _to_pin_session_row(row)

    async def deactivate_active_by_home_and_terminal(
        self,
        home_id: str,
        terminal_id: str,
        ctx: RepoContext | None = None,
    ) -> int:
        stmt = text(
            """
            UPDATE pin_sessions
            SET is_active = false, updated_at = now()
            WHERE home_id = :home_id
              AND terminal_id = :terminal_id
              AND is_active = true
            """
        )
        async with session_scope(self._database, ctx) as (session, owned):
            result = await session.execute(
                stmt,
                {"home_id": home_id, "terminal_id": terminal_id},
            )
            if owned:
                await session.commit()
        return result.rowcount or 0

    async def mark_expired_before(
        self,
        now: str,
        ctx: RepoContext | None = None,
    ) -> int:
        stmt = text(
            """
            UPDATE pin_sessions
            SET is_active = false, updated_at = now()
            WHERE is_active = true
              AND expires_at < :now
            """
        )
        async with session_scope(self._database, ctx) as (session, owned):
            result = await session.execute(stmt, {"now": now})
            if owned:
                await session.commit()
        return result.rowcount or 0
