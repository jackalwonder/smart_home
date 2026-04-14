from __future__ import annotations

from sqlalchemy import bindparam, text

from src.infrastructure.db.connection.Database import Database
from src.infrastructure.db.repositories._support import as_dict, session_scope
from src.repositories.base.devices.DeviceRuntimeStateRepository import RuntimeStateUpsert
from src.repositories.rows.index import DeviceRuntimeStateRow
from src.shared.kernel.RepoContext import RepoContext


class DeviceRuntimeStateRepositoryImpl:
    def __init__(self, database: Database) -> None:
        self._database = database

    async def find_by_device_ids(
        self,
        home_id: str,
        device_ids: list[str],
        ctx: RepoContext | None = None,
    ) -> list[DeviceRuntimeStateRow]:
        if not device_ids:
            return []

        stmt = text(
            """
            SELECT
                device_id::text AS device_id,
                home_id::text AS home_id,
                status,
                is_offline,
                runtime_state_json,
                status_summary_json,
                last_state_update_at::text AS last_state_update_at
            FROM device_runtime_states
            WHERE home_id = :home_id
              AND device_id IN :device_ids
            """
        ).bindparams(bindparam("device_ids", expanding=True))
        async with session_scope(self._database, ctx) as (session, _):
            rows = (
                await session.execute(stmt, {"home_id": home_id, "device_ids": device_ids})
            ).mappings().all()
        return [
            DeviceRuntimeStateRow(
                device_id=row["device_id"],
                home_id=row["home_id"],
                status=row["status"],
                is_offline=row["is_offline"],
                runtime_state_json=as_dict(row["runtime_state_json"]),
                status_summary_json=as_dict(row["status_summary_json"]),
                last_state_update_at=row["last_state_update_at"],
            )
            for row in rows
        ]

    async def upsert_runtime_state(
        self,
        input: RuntimeStateUpsert,
        ctx: RepoContext | None = None,
    ) -> None:
        stmt = text(
            """
            INSERT INTO device_runtime_states (
                device_id,
                home_id,
                status,
                is_offline,
                status_summary_json,
                runtime_state_json,
                last_state_update_at,
                updated_at
            ) VALUES (
                :device_id,
                :home_id,
                :status,
                :is_offline,
                :status_summary_json,
                :runtime_state_json,
                :last_state_update_at,
                now()
            )
            ON CONFLICT (device_id) DO UPDATE SET
                home_id = EXCLUDED.home_id,
                status = EXCLUDED.status,
                is_offline = EXCLUDED.is_offline,
                status_summary_json = EXCLUDED.status_summary_json,
                runtime_state_json = EXCLUDED.runtime_state_json,
                last_state_update_at = EXCLUDED.last_state_update_at,
                updated_at = now()
            """
        )
        async with session_scope(self._database, ctx) as (session, owned):
            await session.execute(
                stmt,
                {
                    "device_id": input.device_id,
                    "home_id": input.home_id,
                    "status": input.status,
                    "is_offline": input.is_offline,
                    "status_summary_json": as_dict(input.status_summary_json),
                    "runtime_state_json": as_dict(input.runtime_state_json),
                    "last_state_update_at": input.last_state_update_at,
                },
            )
            if owned:
                await session.commit()
