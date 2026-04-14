from __future__ import annotations

from sqlalchemy import text

from src.infrastructure.db.connection.Database import Database
from src.infrastructure.db.repositories._support import as_dict, as_list, session_scope
from src.repositories.rows.index import DeviceControlSchemaRow
from src.shared.kernel.RepoContext import RepoContext


class DeviceControlSchemaRepositoryImpl:
    def __init__(self, database: Database) -> None:
        self._database = database

    async def list_by_device_id(
        self,
        device_id: str,
        ctx: RepoContext | None = None,
    ) -> list[DeviceControlSchemaRow]:
        stmt = text(
            """
            SELECT
                id::text AS id,
                device_id::text AS device_id,
                action_type,
                target_scope,
                target_key,
                value_type,
                value_range_json,
                allowed_values_json
            FROM device_control_schemas
            WHERE device_id = :device_id
            ORDER BY sort_order ASC, created_at ASC
            """
        )
        async with session_scope(self._database, ctx) as (session, _):
            rows = (await session.execute(stmt, {"device_id": device_id})).mappings().all()
        return [
            DeviceControlSchemaRow(
                id=row["id"],
                device_id=row["device_id"],
                action_type=row["action_type"],
                target_scope=row["target_scope"],
                target_key=row["target_key"],
                value_type=row["value_type"],
                value_range_json=as_dict(row["value_range_json"]) if row["value_range_json"] is not None else None,
                allowed_values_json=as_list(row["allowed_values_json"]) if row["allowed_values_json"] is not None else None,
            )
            for row in rows
        ]
