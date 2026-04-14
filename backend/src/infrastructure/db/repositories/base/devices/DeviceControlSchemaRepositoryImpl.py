from __future__ import annotations

from sqlalchemy import text

from src.infrastructure.db.connection.Database import Database
from src.infrastructure.db.repositories._support import as_dict, as_list, session_scope, to_jsonb, to_jsonb_list
from src.repositories.base.devices.DeviceControlSchemaRepository import NewDeviceControlSchemaRow
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
                allowed_values_json,
                unit,
                is_quick_action,
                requires_detail_entry
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
                unit=row["unit"],
                is_quick_action=row["is_quick_action"],
                requires_detail_entry=row["requires_detail_entry"],
            )
            for row in rows
        ]

    async def replace_for_device(
        self,
        device_id: str,
        schemas: list[NewDeviceControlSchemaRow],
        ctx: RepoContext | None = None,
    ) -> None:
        delete_stmt = text("DELETE FROM device_control_schemas WHERE device_id = :device_id")
        insert_stmt = text(
            """
            INSERT INTO device_control_schemas (
                device_id,
                action_type,
                target_scope,
                target_key,
                value_type,
                value_range_json,
                allowed_values_json,
                unit,
                is_quick_action,
                requires_detail_entry,
                sort_order,
                created_at,
                updated_at
            ) VALUES (
                :device_id,
                :action_type,
                :target_scope,
                :target_key,
                :value_type,
                :value_range_json,
                :allowed_values_json,
                :unit,
                :is_quick_action,
                :requires_detail_entry,
                :sort_order,
                now(),
                now()
            )
            """
        )
        async with session_scope(self._database, ctx) as (session, owned):
            await session.execute(delete_stmt, {"device_id": device_id})
            for schema in schemas:
                await session.execute(
                    insert_stmt,
                    {
                        "device_id": schema.device_id,
                        "action_type": schema.action_type,
                        "target_scope": schema.target_scope,
                        "target_key": schema.target_key,
                        "value_type": schema.value_type,
                        "value_range_json": to_jsonb(schema.value_range_json)
                        if schema.value_range_json is not None
                        else None,
                        "allowed_values_json": to_jsonb_list(schema.allowed_values_json)
                        if schema.allowed_values_json is not None
                        else None,
                        "unit": schema.unit,
                        "is_quick_action": schema.is_quick_action,
                        "requires_detail_entry": schema.requires_detail_entry,
                        "sort_order": schema.sort_order,
                    },
                )
            if owned:
                await session.commit()
