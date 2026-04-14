from __future__ import annotations

from sqlalchemy import text

from src.infrastructure.db.connection.Database import Database
from src.infrastructure.db.repositories._support import session_scope
from src.repositories.base.energy.EnergySnapshotRepository import EnergySnapshotRow, NewEnergySnapshotRow
from src.shared.kernel.RepoContext import RepoContext


class EnergySnapshotRepositoryImpl:
    def __init__(self, database: Database) -> None:
        self._database = database

    async def find_latest_by_home_id(self, home_id: str, ctx: RepoContext | None = None) -> EnergySnapshotRow | None:
        stmt = text(
            """
            SELECT
                id::text AS id,
                home_id::text AS home_id,
                binding_status::text AS binding_status,
                refresh_status::text AS refresh_status,
                yesterday_usage::float8 AS yesterday_usage,
                monthly_usage::float8 AS monthly_usage,
                yearly_usage::float8 AS yearly_usage,
                balance::float8 AS balance,
                cache_mode,
                last_error_code,
                source_updated_at::text AS source_updated_at,
                created_at::text AS created_at
            FROM energy_snapshots
            WHERE home_id = :home_id
            ORDER BY created_at DESC
            LIMIT 1
            """
        )
        async with session_scope(self._database, ctx) as (session, _):
            row = (await session.execute(stmt, {"home_id": home_id})).mappings().one_or_none()
        return EnergySnapshotRow(**row) if row is not None else None

    async def insert(self, input: NewEnergySnapshotRow, ctx: RepoContext | None = None) -> EnergySnapshotRow:
        stmt = text(
            """
            INSERT INTO energy_snapshots (
                home_id, binding_status, refresh_status, yesterday_usage, monthly_usage,
                yearly_usage, balance, cache_mode, last_error_code, source_updated_at
            ) VALUES (
                :home_id, :binding_status, :refresh_status, :yesterday_usage, :monthly_usage,
                :yearly_usage, :balance, :cache_mode, :last_error_code, :source_updated_at
            )
            RETURNING
                id::text AS id,
                home_id::text AS home_id,
                binding_status::text AS binding_status,
                refresh_status::text AS refresh_status,
                yesterday_usage::float8 AS yesterday_usage,
                monthly_usage::float8 AS monthly_usage,
                yearly_usage::float8 AS yearly_usage,
                balance::float8 AS balance,
                cache_mode,
                last_error_code,
                source_updated_at::text AS source_updated_at,
                created_at::text AS created_at
            """
        )
        async with session_scope(self._database, ctx) as (session, owned):
            row = (await session.execute(stmt, input.__dict__)).mappings().one()
            if owned:
                await session.commit()
        return EnergySnapshotRow(**row)
