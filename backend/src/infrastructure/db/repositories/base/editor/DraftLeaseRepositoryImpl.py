from __future__ import annotations

from sqlalchemy import text

from src.infrastructure.db.connection.Database import Database
from src.infrastructure.db.repositories._support import session_scope
from src.repositories.base.editor.DraftLeaseRepository import NewDraftLeaseRow
from src.repositories.rows.index import DraftLeaseRow
from src.shared.kernel.RepoContext import RepoContext


def _to_draft_lease_row(row) -> DraftLeaseRow:
    return DraftLeaseRow(
        id=row["id"],
        home_id=row["home_id"],
        lease_id=row["lease_id"],
        terminal_id=row["terminal_id"],
        member_id=row["member_id"],
        lease_status=row["lease_status"],
        is_active=row["is_active"],
        lease_expires_at=row["lease_expires_at"],
        last_heartbeat_at=row["last_heartbeat_at"],
    )


class DraftLeaseRepositoryImpl:
    def __init__(self, database: Database) -> None:
        self._database = database

    async def find_active_by_home_id(self, home_id: str, ctx: RepoContext | None = None) -> DraftLeaseRow | None:
        stmt = text(
            """
            SELECT
                id::text AS id,
                home_id::text AS home_id,
                lease_id,
                terminal_id::text AS terminal_id,
                member_id::text AS member_id,
                lease_status::text AS lease_status,
                is_active,
                lease_expires_at::text AS lease_expires_at,
                last_heartbeat_at::text AS last_heartbeat_at
            FROM draft_leases
            WHERE home_id = :home_id
              AND is_active = true
            ORDER BY created_at DESC
            LIMIT 1
            """
        )
        async with session_scope(self._database, ctx) as (session, _):
            row = (await session.execute(stmt, {"home_id": home_id})).mappings().one_or_none()
        return _to_draft_lease_row(row) if row is not None else None

    async def find_by_lease_id(
        self,
        home_id: str,
        lease_id: str,
        ctx: RepoContext | None = None,
    ) -> DraftLeaseRow | None:
        stmt = text(
            """
            SELECT
                id::text AS id,
                home_id::text AS home_id,
                lease_id,
                terminal_id::text AS terminal_id,
                member_id::text AS member_id,
                lease_status::text AS lease_status,
                is_active,
                lease_expires_at::text AS lease_expires_at,
                last_heartbeat_at::text AS last_heartbeat_at
            FROM draft_leases
            WHERE home_id = :home_id
              AND lease_id = :lease_id
            LIMIT 1
            """
        )
        async with session_scope(self._database, ctx) as (session, _):
            row = (
                await session.execute(stmt, {"home_id": home_id, "lease_id": lease_id})
            ).mappings().one_or_none()
        return _to_draft_lease_row(row) if row is not None else None

    async def insert(
        self,
        input: NewDraftLeaseRow,
        ctx: RepoContext | None = None,
    ) -> DraftLeaseRow:
        stmt = text(
            """
            INSERT INTO draft_leases (
                home_id,
                lease_id,
                terminal_id,
                member_id,
                lease_status,
                is_active,
                lease_expires_at,
                heartbeat_interval_seconds,
                last_heartbeat_at,
                taken_over_from_lease_id,
                lost_reason
            ) VALUES (
                :home_id,
                :lease_id,
                :terminal_id,
                :member_id,
                :lease_status,
                :is_active,
                :lease_expires_at,
                :heartbeat_interval_seconds,
                :last_heartbeat_at,
                :taken_over_from_lease_id,
                :lost_reason
            )
            RETURNING
                id::text AS id,
                home_id::text AS home_id,
                lease_id,
                terminal_id::text AS terminal_id,
                member_id::text AS member_id,
                lease_status::text AS lease_status,
                is_active,
                lease_expires_at::text AS lease_expires_at,
                last_heartbeat_at::text AS last_heartbeat_at
            """
        )
        async with session_scope(self._database, ctx) as (session, owned):
            row = (
                await session.execute(
                    stmt,
                    {
                        "home_id": input.home_id,
                        "lease_id": input.lease_id,
                        "terminal_id": input.terminal_id,
                        "member_id": input.member_id,
                        "lease_status": input.lease_status,
                        "is_active": input.is_active,
                        "lease_expires_at": input.lease_expires_at,
                        "heartbeat_interval_seconds": input.heartbeat_interval_seconds,
                        "last_heartbeat_at": input.last_heartbeat_at,
                        "taken_over_from_lease_id": input.taken_over_from_lease_id,
                        "lost_reason": input.lost_reason,
                    },
                )
            ).mappings().one()
            if owned:
                await session.commit()
        return _to_draft_lease_row(row)

    async def deactivate_lease(
        self,
        lease_id: str,
        next_status: str,
        lost_reason: str | None,
        ctx: RepoContext | None = None,
    ) -> None:
        stmt = text(
            """
            UPDATE draft_leases
            SET
                lease_status = :next_status,
                is_active = false,
                lost_reason = :lost_reason,
                updated_at = now()
            WHERE lease_id = :lease_id
            """
        )
        async with session_scope(self._database, ctx) as (session, owned):
            await session.execute(
                stmt,
                {
                    "lease_id": lease_id,
                    "next_status": next_status,
                    "lost_reason": lost_reason,
                },
            )
            if owned:
                await session.commit()

    async def heartbeat(
        self,
        lease_id: str,
        heartbeat_at: str,
        expires_at: str,
        ctx: RepoContext | None = None,
    ) -> int:
        stmt = text(
            """
            UPDATE draft_leases
            SET
                last_heartbeat_at = :heartbeat_at,
                lease_expires_at = :expires_at,
                updated_at = now()
            WHERE lease_id = :lease_id
              AND is_active = true
            """
        )
        async with session_scope(self._database, ctx) as (session, owned):
            result = await session.execute(
                stmt,
                {
                    "lease_id": lease_id,
                    "heartbeat_at": heartbeat_at,
                    "expires_at": expires_at,
                },
            )
            if owned:
                await session.commit()
        return result.rowcount or 0
