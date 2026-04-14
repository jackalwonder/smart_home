from __future__ import annotations

from sqlalchemy import text

from src.infrastructure.db.connection.Database import Database
from src.infrastructure.db.repositories._support import session_scope
from src.repositories.base.auth.PinLockRepository import PinFailureUpsert
from src.repositories.rows.index import PinLockRow
from src.shared.kernel.RepoContext import RepoContext


def _to_row(row) -> PinLockRow:
    return PinLockRow(
        id=row["id"],
        home_id=row["home_id"],
        terminal_id=row["terminal_id"],
        failed_attempts=row["failed_attempts"],
        locked_until=row["locked_until"],
        last_failed_at=row["last_failed_at"],
    )


class PinLockRepositoryImpl:
    def __init__(self, database: Database) -> None:
        self._database = database

    async def find_by_home_and_terminal(self, home_id: str, terminal_id: str, ctx: RepoContext | None = None) -> PinLockRow | None:
        stmt = text(
            """
            SELECT
                id::text AS id,
                home_id::text AS home_id,
                terminal_id::text AS terminal_id,
                failed_attempts,
                locked_until::text AS locked_until,
                last_failed_at::text AS last_failed_at
            FROM pin_lock_records
            WHERE home_id = :home_id AND terminal_id = :terminal_id
            """
        )
        async with session_scope(self._database, ctx) as (session, _):
            row = (await session.execute(stmt, {"home_id": home_id, "terminal_id": terminal_id})).mappings().one_or_none()
        return _to_row(row) if row is not None else None

    async def upsert_failure(self, input: PinFailureUpsert, ctx: RepoContext | None = None) -> PinLockRow:
        stmt = text(
            """
            INSERT INTO pin_lock_records (
                home_id, terminal_id, failed_attempts, locked_until, last_failed_at
            ) VALUES (
                :home_id, :terminal_id, :failed_attempts, :locked_until, :last_failed_at
            )
            ON CONFLICT (home_id, terminal_id) DO UPDATE SET
                failed_attempts = EXCLUDED.failed_attempts,
                locked_until = EXCLUDED.locked_until,
                last_failed_at = EXCLUDED.last_failed_at,
                updated_at = now()
            RETURNING
                id::text AS id,
                home_id::text AS home_id,
                terminal_id::text AS terminal_id,
                failed_attempts,
                locked_until::text AS locked_until,
                last_failed_at::text AS last_failed_at
            """
        )
        async with session_scope(self._database, ctx) as (session, owned):
            row = (await session.execute(stmt, {
                "home_id": input.home_id,
                "terminal_id": input.terminal_id,
                "failed_attempts": input.failed_attempts,
                "locked_until": input.locked_until,
                "last_failed_at": input.last_failed_at,
            })).mappings().one()
            if owned:
                await session.commit()
        return _to_row(row)

    async def clear_failures(self, home_id: str, terminal_id: str, ctx: RepoContext | None = None) -> None:
        stmt = text(
            """
            UPDATE pin_lock_records
            SET failed_attempts = 0, locked_until = NULL, last_failed_at = NULL, updated_at = now()
            WHERE home_id = :home_id AND terminal_id = :terminal_id
            """
        )
        async with session_scope(self._database, ctx) as (session, owned):
            await session.execute(stmt, {"home_id": home_id, "terminal_id": terminal_id})
            if owned:
                await session.commit()
