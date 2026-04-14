from __future__ import annotations

from sqlalchemy import text

from src.infrastructure.db.connection.Database import Database
from src.infrastructure.db.repositories._support import session_scope
from src.repositories.base.system.SystemConnectionRepository import SystemConnectionRow, SystemConnectionUpsertRow
from src.shared.kernel.RepoContext import RepoContext


def _to_row(row) -> SystemConnectionRow:
    return SystemConnectionRow(**row)


class SystemConnectionRepositoryImpl:
    def __init__(self, database: Database) -> None:
        self._database = database

    async def find_by_home_and_type(self, home_id: str, system_type: str, ctx: RepoContext | None = None) -> SystemConnectionRow | None:
        stmt = text(
            """
            SELECT
                id::text AS id,
                home_id::text AS home_id,
                system_type::text AS system_type,
                connection_mode,
                base_url_encrypted,
                auth_payload_encrypted,
                auth_configured,
                connection_status::text AS connection_status,
                last_test_at::text AS last_test_at,
                last_test_result,
                last_sync_at::text AS last_sync_at,
                last_sync_result,
                updated_at::text AS updated_at
            FROM system_connections
            WHERE home_id = :home_id AND system_type = :system_type
            """
        )
        async with session_scope(self._database, ctx) as (session, _):
            row = (await session.execute(stmt, {"home_id": home_id, "system_type": system_type})).mappings().one_or_none()
        return _to_row(row) if row is not None else None

    async def upsert(self, input: SystemConnectionUpsertRow, ctx: RepoContext | None = None) -> SystemConnectionRow:
        stmt = text(
            """
            INSERT INTO system_connections (
                home_id, system_type, connection_mode, base_url_encrypted, auth_payload_encrypted,
                auth_configured, connection_status, last_test_at, last_test_result, last_sync_at, last_sync_result, updated_at
            ) VALUES (
                :home_id, :system_type, :connection_mode, :base_url_encrypted, :auth_payload_encrypted,
                :auth_configured, :connection_status, :last_test_at, :last_test_result, :last_sync_at, :last_sync_result, now()
            )
            ON CONFLICT (home_id, system_type) DO UPDATE SET
                connection_mode = EXCLUDED.connection_mode,
                base_url_encrypted = EXCLUDED.base_url_encrypted,
                auth_payload_encrypted = EXCLUDED.auth_payload_encrypted,
                auth_configured = EXCLUDED.auth_configured,
                connection_status = EXCLUDED.connection_status,
                last_test_at = EXCLUDED.last_test_at,
                last_test_result = EXCLUDED.last_test_result,
                last_sync_at = EXCLUDED.last_sync_at,
                last_sync_result = EXCLUDED.last_sync_result,
                updated_at = now()
            RETURNING
                id::text AS id,
                home_id::text AS home_id,
                system_type::text AS system_type,
                connection_mode,
                base_url_encrypted,
                auth_payload_encrypted,
                auth_configured,
                connection_status::text AS connection_status,
                last_test_at::text AS last_test_at,
                last_test_result,
                last_sync_at::text AS last_sync_at,
                last_sync_result,
                updated_at::text AS updated_at
            """
        )
        params = input.__dict__
        async with session_scope(self._database, ctx) as (session, owned):
            row = (await session.execute(stmt, params)).mappings().one()
            if owned:
                await session.commit()
        return _to_row(row)
