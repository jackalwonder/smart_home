from __future__ import annotations

from sqlalchemy import text

from src.infrastructure.db.connection.Database import Database
from src.infrastructure.db.repositories._support import session_scope
from src.repositories.base.media.MediaBindingRepository import MediaBindingRow, MediaBindingUpsertRow
from src.shared.kernel.RepoContext import RepoContext


class MediaBindingRepositoryImpl:
    def __init__(self, database: Database) -> None:
        self._database = database

    async def find_by_home_id(self, home_id: str, ctx: RepoContext | None = None) -> MediaBindingRow | None:
        stmt = text(
            """
            SELECT
                id::text AS id,
                home_id::text AS home_id,
                device_id::text AS device_id,
                binding_status::text AS binding_status,
                availability_status::text AS availability_status,
                updated_at::text AS updated_at
            FROM media_bindings
            WHERE home_id = :home_id
            """
        )
        async with session_scope(self._database, ctx) as (session, _):
            row = (await session.execute(stmt, {"home_id": home_id})).mappings().one_or_none()
        return MediaBindingRow(**row) if row is not None else None

    async def upsert(self, input: MediaBindingUpsertRow, ctx: RepoContext | None = None) -> MediaBindingRow:
        stmt = text(
            """
            INSERT INTO media_bindings (
                home_id, device_id, binding_status, availability_status, updated_by_member_id, updated_by_terminal_id, updated_at
            ) VALUES (
                :home_id, :device_id, :binding_status, :availability_status, :updated_by_member_id, :updated_by_terminal_id, now()
            )
            ON CONFLICT (home_id) DO UPDATE SET
                device_id = EXCLUDED.device_id,
                binding_status = EXCLUDED.binding_status,
                availability_status = EXCLUDED.availability_status,
                updated_by_member_id = EXCLUDED.updated_by_member_id,
                updated_by_terminal_id = EXCLUDED.updated_by_terminal_id,
                updated_at = now()
            RETURNING
                id::text AS id,
                home_id::text AS home_id,
                device_id::text AS device_id,
                binding_status::text AS binding_status,
                availability_status::text AS availability_status,
                updated_at::text AS updated_at
            """
        )
        async with session_scope(self._database, ctx) as (session, owned):
            row = (await session.execute(stmt, input.__dict__)).mappings().one()
            if owned:
                await session.commit()
        return MediaBindingRow(**row)
