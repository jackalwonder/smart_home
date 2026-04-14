from __future__ import annotations

from sqlalchemy import bindparam, text

from src.infrastructure.db.connection.Database import Database
from src.infrastructure.db.repositories._support import as_dict, session_scope, to_jsonb
from src.repositories.base.realtime.WsEventOutboxRepository import NewWsEventOutboxRow
from src.repositories.rows.index import WsEventOutboxRow
from src.shared.kernel.RepoContext import RepoContext


def _to_outbox_row(row) -> WsEventOutboxRow:
    return WsEventOutboxRow(
        id=row["id"],
        home_id=row["home_id"],
        event_id=row["event_id"],
        event_type=row["event_type"],
        change_domain=row["change_domain"],
        snapshot_required=row["snapshot_required"],
        payload_json=as_dict(row["payload_json"]),
        delivery_status=row["delivery_status"],
        occurred_at=row["occurred_at"],
        created_at=row["created_at"],
    )


class WsEventOutboxRepositoryImpl:
    def __init__(self, database: Database) -> None:
        self._database = database

    async def insert(
        self,
        input: NewWsEventOutboxRow,
        ctx: RepoContext | None = None,
    ) -> WsEventOutboxRow:
        stmt = text(
            """
            INSERT INTO ws_event_outbox (
                home_id,
                event_id,
                event_type,
                change_domain,
                snapshot_required,
                payload_json,
                occurred_at
            ) VALUES (
                :home_id,
                :event_id,
                :event_type,
                :change_domain,
                :snapshot_required,
                :payload_json,
                :occurred_at
            )
            ON CONFLICT (home_id, event_id) DO UPDATE SET
                payload_json = EXCLUDED.payload_json,
                occurred_at = EXCLUDED.occurred_at
            RETURNING
                id::text AS id,
                home_id::text AS home_id,
                event_id,
                event_type,
                change_domain::text AS change_domain,
                snapshot_required,
                payload_json,
                delivery_status::text AS delivery_status,
                occurred_at::text AS occurred_at,
                created_at::text AS created_at
            """
        )
        async with session_scope(self._database, ctx) as (session, owned):
            row = (
                await session.execute(
                    stmt,
                    {
                        "home_id": input.home_id,
                        "event_id": input.event_id,
                        "event_type": input.event_type,
                        "change_domain": input.change_domain,
                        "snapshot_required": input.snapshot_required,
                        "payload_json": to_jsonb(as_dict(input.payload_json)),
                        "occurred_at": input.occurred_at,
                    },
                )
            ).mappings().one()
            if owned:
                await session.commit()
        return _to_outbox_row(row)

    async def list_pending(
        self,
        limit: int,
        ctx: RepoContext | None = None,
    ) -> list[WsEventOutboxRow]:
        stmt = text(
            """
            SELECT
                id::text AS id,
                home_id::text AS home_id,
                event_id,
                event_type,
                change_domain::text AS change_domain,
                snapshot_required,
                payload_json,
                delivery_status::text AS delivery_status,
                occurred_at::text AS occurred_at,
                created_at::text AS created_at
            FROM ws_event_outbox
            WHERE delivery_status = 'PENDING'
            ORDER BY created_at ASC
            LIMIT :limit
            """
        )
        async with session_scope(self._database, ctx) as (session, _):
            rows = (await session.execute(stmt, {"limit": limit})).mappings().all()
        return [_to_outbox_row(row) for row in rows]

    async def list_recent(
        self,
        home_id: str,
        limit: int,
        ctx: RepoContext | None = None,
    ) -> list[WsEventOutboxRow]:
        stmt = text(
            """
            SELECT
                id::text AS id,
                home_id::text AS home_id,
                event_id,
                event_type,
                change_domain::text AS change_domain,
                snapshot_required,
                payload_json,
                delivery_status::text AS delivery_status,
                occurred_at::text AS occurred_at,
                created_at::text AS created_at
            FROM ws_event_outbox
            WHERE home_id = :home_id
            ORDER BY occurred_at DESC, created_at DESC
            LIMIT :limit
            """
        )
        async with session_scope(self._database, ctx) as (session, _):
            rows = (await session.execute(stmt, {"home_id": home_id, "limit": limit})).mappings().all()
        return [_to_outbox_row(row) for row in reversed(rows)]

    async def mark_dispatching(self, ids: list[str], ctx: RepoContext | None = None) -> None:
        if not ids:
            return
        stmt = text(
            """
            UPDATE ws_event_outbox
            SET delivery_status = 'DISPATCHING'
            WHERE id IN :ids
            """
        ).bindparams(bindparam("ids", expanding=True))
        async with session_scope(self._database, ctx) as (session, owned):
            await session.execute(stmt, {"ids": ids})
            if owned:
                await session.commit()

    async def mark_dispatched(self, id: str, ctx: RepoContext | None = None) -> None:
        stmt = text(
            """
            UPDATE ws_event_outbox
            SET delivery_status = 'DISPATCHED'
            WHERE id = :id
            """
        )
        async with session_scope(self._database, ctx) as (session, owned):
            await session.execute(stmt, {"id": id})
            if owned:
                await session.commit()

    async def mark_failed(self, id: str, ctx: RepoContext | None = None) -> None:
        stmt = text(
            """
            UPDATE ws_event_outbox
            SET delivery_status = 'FAILED'
            WHERE id = :id
            """
        )
        async with session_scope(self._database, ctx) as (session, owned):
            await session.execute(stmt, {"id": id})
            if owned:
                await session.commit()
