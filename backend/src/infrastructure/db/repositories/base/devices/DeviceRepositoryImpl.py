from __future__ import annotations

from sqlalchemy import text

from src.infrastructure.db.connection.Database import Database
from src.infrastructure.db.repositories._support import as_dict, session_scope
from src.repositories.base.devices.DeviceRepository import DeviceListFilter, DeviceMappingPatch
from src.repositories.rows.index import DeviceRow
from src.shared.kernel.RepoContext import RepoContext


class DeviceRepositoryImpl:
    def __init__(self, database: Database) -> None:
        self._database = database

    async def find_by_id(
        self,
        home_id: str,
        device_id: str,
        ctx: RepoContext | None = None,
    ) -> DeviceRow | None:
        stmt = text(
            """
            SELECT
                id::text AS id,
                home_id::text AS home_id,
                room_id::text AS room_id,
                display_name,
                raw_name,
                device_type,
                is_readonly_device,
                is_complex_device,
                confirmation_type::text AS confirmation_type,
                entry_behavior::text AS entry_behavior,
                default_control_target,
                is_homepage_visible,
                is_primary_device,
                capabilities_json,
                source_meta_json
            FROM devices
            WHERE home_id = :home_id
              AND id = :device_id
            """
        )
        async with session_scope(self._database, ctx) as (session, _):
            row = (await session.execute(stmt, {"home_id": home_id, "device_id": device_id})).mappings().one_or_none()
        if row is None:
            return None
        return DeviceRow(
            id=row["id"],
            home_id=row["home_id"],
            room_id=row["room_id"],
            display_name=row["display_name"],
            raw_name=row["raw_name"],
            device_type=row["device_type"],
            is_readonly_device=row["is_readonly_device"],
            is_complex_device=row["is_complex_device"],
            entry_behavior=row["entry_behavior"],
            confirmation_type=row["confirmation_type"],
            default_control_target=row["default_control_target"],
            is_homepage_visible=row["is_homepage_visible"],
            is_primary_device=row["is_primary_device"],
            capabilities_json=as_dict(row["capabilities_json"]),
            source_meta_json=as_dict(row["source_meta_json"]),
        )

    async def list_by_home(
        self,
        home_id: str,
        filter: DeviceListFilter,
        ctx: RepoContext | None = None,
    ) -> list[DeviceRow]:
        clauses = ["home_id = :home_id"]
        params: dict[str, object] = {"home_id": home_id}
        if filter.room_id is not None:
            clauses.append("room_id = :room_id")
            params["room_id"] = filter.room_id
        if filter.device_type is not None:
            clauses.append("device_type = :device_type")
            params["device_type"] = filter.device_type
        if filter.keyword is not None:
            clauses.append("(display_name ILIKE :keyword OR COALESCE(raw_name, '') ILIKE :keyword)")
            params["keyword"] = f"%{filter.keyword}%"

        sql = f"""
            SELECT
                id::text AS id,
                home_id::text AS home_id,
                room_id::text AS room_id,
                display_name,
                raw_name,
                device_type,
                is_readonly_device,
                is_complex_device,
                confirmation_type::text AS confirmation_type,
                entry_behavior::text AS entry_behavior,
                default_control_target,
                is_homepage_visible,
                is_primary_device,
                capabilities_json,
                source_meta_json
            FROM devices
            WHERE {' AND '.join(clauses)}
            ORDER BY display_name ASC, id ASC
        """
        if filter.page is not None and filter.page_size is not None:
            offset = max(filter.page - 1, 0) * filter.page_size
            sql += "\nLIMIT :limit OFFSET :offset"
            params["limit"] = filter.page_size
            params["offset"] = offset

        stmt = text(sql)
        async with session_scope(self._database, ctx) as (session, _):
            rows = (await session.execute(stmt, params)).mappings().all()
        return [
            DeviceRow(
                id=row["id"],
                home_id=row["home_id"],
                room_id=row["room_id"],
                display_name=row["display_name"],
                raw_name=row["raw_name"],
                device_type=row["device_type"],
                is_readonly_device=row["is_readonly_device"],
                is_complex_device=row["is_complex_device"],
                entry_behavior=row["entry_behavior"],
                confirmation_type=row["confirmation_type"],
                default_control_target=row["default_control_target"],
                is_homepage_visible=row["is_homepage_visible"],
                is_primary_device=row["is_primary_device"],
                capabilities_json=as_dict(row["capabilities_json"]),
                source_meta_json=as_dict(row["source_meta_json"]),
            )
            for row in rows
        ]

    async def update_mapping(
        self,
        device_id: str,
        patch: DeviceMappingPatch,
        ctx: RepoContext | None = None,
    ) -> None:
        set_clauses: list[str] = []
        params: dict[str, object] = {"device_id": device_id}
        if patch.room_id_provided:
            set_clauses.append("room_id = :room_id")
            params["room_id"] = patch.room_id
        if patch.device_type_provided:
            set_clauses.append("device_type = :device_type")
            params["device_type"] = patch.device_type
        if patch.is_primary_device_provided:
            set_clauses.append("is_primary_device = :is_primary_device")
            params["is_primary_device"] = patch.is_primary_device
        if patch.default_control_target_provided:
            set_clauses.append("default_control_target = :default_control_target")
            params["default_control_target"] = patch.default_control_target
        if patch.source_meta_json is not None:
            set_clauses.append("source_meta_json = :source_meta_json")
            params["source_meta_json"] = as_dict(patch.source_meta_json)
        if not set_clauses:
            return
        set_clauses.append("updated_at = now()")

        stmt = text(
            f"""
            UPDATE devices
            SET {', '.join(set_clauses)}
            WHERE id = :device_id
            """
        )
        async with session_scope(self._database, ctx) as (session, owned):
            await session.execute(stmt, params)
            if owned:
                await session.commit()
