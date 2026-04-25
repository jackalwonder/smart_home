from __future__ import annotations

from psycopg.types.json import Jsonb
from sqlalchemy import bindparam, text

from src.infrastructure.db.connection.Database import Database
from src.infrastructure.db.repositories._support import as_dict, session_scope
from src.repositories.base.system.HaEntitySyncRepository import (
    DeviceEntityLinkSaveInput,
    HaDeviceSaveInput,
    HaEntitySaveInput,
    HaEntityStateUpdateInput,
    HaRuntimeStateInput,
    RuntimeEntityLinkRow,
    StateChangedEntityLinkRow,
)
from src.shared.kernel.RepoContext import RepoContext


class HaEntitySyncRepositoryImpl:
    def __init__(self, database: Database) -> None:
        self._database = database

    async def load_existing_rooms(self, home_id: str, ctx: RepoContext | None = None) -> dict[str, str]:
        stmt = text(
            """
            SELECT id::text AS id, room_name
            FROM rooms
            WHERE home_id = :home_id
            """
        )
        async with session_scope(self._database, ctx) as (session, _):
            rows = (await session.execute(stmt, {"home_id": home_id})).mappings().all()
        return {str(row["room_name"]): str(row["id"]) for row in rows}

    async def ensure_room(
        self,
        home_id: str,
        room_name: str,
        ctx: RepoContext | None = None,
    ) -> str:
        stmt = text(
            """
            INSERT INTO rooms (
                home_id,
                room_name,
                priority,
                visible_in_editor,
                sort_order,
                created_at,
                updated_at
            ) VALUES (
                :home_id,
                :room_name,
                0,
                true,
                0,
                now(),
                now()
            )
            ON CONFLICT (home_id, room_name) DO UPDATE
            SET updated_at = now()
            RETURNING id::text AS id
            """
        )
        async with session_scope(self._database, ctx) as (session, owned):
            row = (
                await session.execute(stmt, {"home_id": home_id, "room_name": room_name})
            ).mappings().one()
            if owned:
                await session.commit()
        return str(row["id"])

    async def load_existing_devices(self, home_id: str, ctx: RepoContext | None = None) -> dict[str, str]:
        stmt = text(
            """
            SELECT
                id::text AS id,
                source_meta_json ->> 'ha_device_id' AS ha_device_id
            FROM devices
            WHERE home_id = :home_id
            """
        )
        async with session_scope(self._database, ctx) as (session, _):
            rows = (await session.execute(stmt, {"home_id": home_id})).mappings().all()
        return {
            str(row["ha_device_id"]): str(row["id"])
            for row in rows
            if row["ha_device_id"] is not None
        }

    async def load_existing_entities(
        self,
        home_id: str,
        entity_ids: list[str],
        ctx: RepoContext | None = None,
    ) -> dict[str, str]:
        if not entity_ids:
            return {}
        stmt = text(
            """
            SELECT id::text AS id, entity_id
            FROM ha_entities
            WHERE home_id = :home_id
              AND entity_id IN :entity_ids
            """
        ).bindparams(bindparam("entity_ids", expanding=True))
        async with session_scope(self._database, ctx) as (session, _):
            rows = (
                await session.execute(stmt, {"home_id": home_id, "entity_ids": entity_ids})
            ).mappings().all()
        return {str(row["entity_id"]): str(row["id"]) for row in rows}

    async def save_device(
        self,
        home_id: str,
        device_id: str | None,
        input: HaDeviceSaveInput,
        ctx: RepoContext | None = None,
    ) -> str:
        params = {
            "home_id": home_id,
            "device_id": device_id,
            "room_id": input.room_id,
            "display_name": input.display_name,
            "raw_name": input.raw_name,
            "device_type": input.device_type,
            "is_complex_device": input.is_complex_device,
            "is_readonly_device": input.is_readonly_device,
            "entry_behavior": input.entry_behavior,
            "default_control_target": input.default_control_target,
            "capabilities_json": Jsonb(input.capabilities_json),
            "source_meta_json": Jsonb(input.source_meta_json),
        }
        if device_id is not None:
            stmt = text(
                """
                UPDATE devices
                SET
                    room_id = :room_id,
                    display_name = :display_name,
                    raw_name = :raw_name,
                    device_type = :device_type,
                    is_complex_device = :is_complex_device,
                    is_readonly_device = :is_readonly_device,
                    entry_behavior = :entry_behavior,
                    default_control_target = :default_control_target,
                    is_homepage_visible = true,
                    capabilities_json = :capabilities_json,
                    source_meta_json = :source_meta_json,
                    updated_at = now()
                WHERE id = :device_id
                """
            )
            async with session_scope(self._database, ctx) as (session, owned):
                await session.execute(stmt, params)
                if owned:
                    await session.commit()
            return device_id

        stmt = text(
            """
            INSERT INTO devices (
                home_id,
                room_id,
                display_name,
                raw_name,
                device_type,
                is_complex_device,
                is_readonly_device,
                confirmation_type,
                entry_behavior,
                default_control_target,
                is_primary_device,
                is_homepage_visible,
                capabilities_json,
                source_meta_json,
                created_at,
                updated_at
            ) VALUES (
                :home_id,
                :room_id,
                :display_name,
                :raw_name,
                :device_type,
                :is_complex_device,
                :is_readonly_device,
                'ACK_DRIVEN',
                :entry_behavior,
                :default_control_target,
                false,
                true,
                :capabilities_json,
                :source_meta_json,
                now(),
                now()
            )
            RETURNING id::text AS id
            """
        )
        async with session_scope(self._database, ctx) as (session, owned):
            row = (await session.execute(stmt, params)).mappings().one()
            if owned:
                await session.commit()
        return str(row["id"])

    async def upsert_runtime_state(
        self,
        input: HaRuntimeStateInput,
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
                    "status_summary_json": Jsonb(input.status_summary_json),
                    "runtime_state_json": Jsonb(input.runtime_state_json),
                    "last_state_update_at": input.last_state_update_at,
                },
            )
            if owned:
                await session.commit()

    async def save_ha_entity(
        self,
        home_id: str,
        entity_id: str,
        ha_entity_id: str | None,
        input: HaEntitySaveInput,
        ctx: RepoContext | None = None,
    ) -> str:
        params = {
            "home_id": home_id,
            "id": ha_entity_id,
            "entity_id": entity_id,
            "platform": input.platform,
            "domain": input.domain,
            "raw_name": input.raw_name,
            "state": input.state,
            "attributes_json": Jsonb(input.attributes_json),
            "last_state_changed_at": input.last_state_changed_at,
            "room_hint": input.room_hint,
            "is_available": input.is_available,
        }
        if ha_entity_id is not None:
            stmt = text(
                """
                UPDATE ha_entities
                SET
                    platform = :platform,
                    domain = :domain,
                    raw_name = :raw_name,
                    state = :state,
                    attributes_json = :attributes_json,
                    last_synced_at = now(),
                    last_state_changed_at = :last_state_changed_at,
                    room_hint = :room_hint,
                    is_available = :is_available,
                    updated_at = now()
                WHERE id = :id
                """
            )
            async with session_scope(self._database, ctx) as (session, owned):
                await session.execute(stmt, params)
                if owned:
                    await session.commit()
            return ha_entity_id

        stmt = text(
            """
            INSERT INTO ha_entities (
                home_id,
                entity_id,
                platform,
                domain,
                raw_name,
                state,
                attributes_json,
                last_synced_at,
                last_state_changed_at,
                room_hint,
                is_available,
                created_at,
                updated_at
            ) VALUES (
                :home_id,
                :entity_id,
                :platform,
                :domain,
                :raw_name,
                :state,
                :attributes_json,
                now(),
                :last_state_changed_at,
                :room_hint,
                :is_available,
                now(),
                now()
            )
            ON CONFLICT (home_id, entity_id) DO UPDATE SET
                platform = EXCLUDED.platform,
                domain = EXCLUDED.domain,
                raw_name = EXCLUDED.raw_name,
                state = EXCLUDED.state,
                attributes_json = EXCLUDED.attributes_json,
                last_synced_at = now(),
                last_state_changed_at = EXCLUDED.last_state_changed_at,
                room_hint = EXCLUDED.room_hint,
                is_available = EXCLUDED.is_available,
                updated_at = now()
            RETURNING id::text AS id
            """
        )
        async with session_scope(self._database, ctx) as (session, owned):
            row = (await session.execute(stmt, params)).mappings().one()
            if owned:
                await session.commit()
        return str(row["id"])

    async def upsert_device_entity_link(
        self,
        input: DeviceEntityLinkSaveInput,
        ctx: RepoContext | None = None,
    ) -> None:
        stmt = text(
            """
            INSERT INTO device_entity_links (
                home_id,
                device_id,
                ha_entity_id,
                entity_role,
                is_primary,
                sort_order,
                created_at,
                updated_at
            ) VALUES (
                :home_id,
                :device_id,
                :ha_entity_id,
                :entity_role,
                :is_primary,
                :sort_order,
                now(),
                now()
            )
            ON CONFLICT (ha_entity_id) DO UPDATE SET
                home_id = EXCLUDED.home_id,
                device_id = EXCLUDED.device_id,
                entity_role = EXCLUDED.entity_role,
                is_primary = EXCLUDED.is_primary,
                sort_order = EXCLUDED.sort_order,
                updated_at = now()
            """
        )
        async with session_scope(self._database, ctx) as (session, owned):
            await session.execute(stmt, input.__dict__)
            if owned:
                await session.commit()

    async def delete_stale_device_entity_links(
        self,
        device_id: str,
        current_ha_entity_ids: list[str],
        ctx: RepoContext | None = None,
    ) -> None:
        if not current_ha_entity_ids:
            return
        stmt = text(
            """
            DELETE FROM device_entity_links
            WHERE device_id = :device_id
              AND ha_entity_id NOT IN :ha_entity_ids
            """
        ).bindparams(bindparam("ha_entity_ids", expanding=True))
        async with session_scope(self._database, ctx) as (session, owned):
            await session.execute(
                stmt,
                {"device_id": device_id, "ha_entity_ids": current_ha_entity_ids},
            )
            if owned:
                await session.commit()

    async def find_state_changed_entity(
        self,
        home_id: str,
        entity_id: str,
        ctx: RepoContext | None = None,
    ) -> StateChangedEntityLinkRow | None:
        stmt = text(
            """
            SELECT
                he.id::text AS ha_entity_id,
                he.state AS current_state,
                he.last_state_changed_at::text AS current_last_state_changed_at,
                del.device_id::text AS device_id
            FROM ha_entities he
            JOIN device_entity_links del ON del.ha_entity_id = he.id
            WHERE he.home_id = :home_id
              AND he.entity_id = :entity_id
            """
        )
        async with session_scope(self._database, ctx) as (session, _):
            row = (
                await session.execute(stmt, {"home_id": home_id, "entity_id": entity_id})
            ).mappings().one_or_none()
        return StateChangedEntityLinkRow(**row) if row is not None else None

    async def update_ha_entity_state(
        self,
        input: HaEntityStateUpdateInput,
        ctx: RepoContext | None = None,
    ) -> None:
        stmt = text(
            """
            UPDATE ha_entities
            SET
                state = :state,
                attributes_json = :attributes_json,
                last_synced_at = now(),
                last_state_changed_at = :last_state_changed_at,
                is_available = :is_available,
                updated_at = now()
            WHERE id = :ha_entity_id
            """
        )
        async with session_scope(self._database, ctx) as (session, owned):
            await session.execute(
                stmt,
                {
                    "ha_entity_id": input.ha_entity_id,
                    "state": input.state,
                    "attributes_json": Jsonb(input.attributes_json),
                    "last_state_changed_at": input.last_state_changed_at,
                    "is_available": input.is_available,
                },
            )
            if owned:
                await session.commit()

    async def list_runtime_entity_links(
        self,
        home_id: str,
        device_id: str,
        ctx: RepoContext | None = None,
    ) -> list[RuntimeEntityLinkRow]:
        stmt = text(
            """
            SELECT
                d.id::text AS device_id,
                d.home_id::text AS home_id,
                d.display_name,
                d.device_type,
                he.entity_id,
                he.domain,
                he.state,
                he.attributes_json,
                he.last_state_changed_at::text AS last_state_changed_at,
                del.is_primary,
                del.sort_order
            FROM devices d
            JOIN device_entity_links del ON del.device_id = d.id
            JOIN ha_entities he ON he.id = del.ha_entity_id
            WHERE d.home_id = :home_id
              AND d.id = :device_id
            ORDER BY del.is_primary DESC, del.sort_order ASC, he.entity_id ASC
            """
        )
        async with session_scope(self._database, ctx) as (session, _):
            rows = (
                await session.execute(stmt, {"home_id": home_id, "device_id": device_id})
            ).mappings().all()
        return [
            RuntimeEntityLinkRow(
                device_id=str(row["device_id"]),
                home_id=str(row["home_id"]),
                display_name=str(row["display_name"]),
                device_type=str(row["device_type"]),
                entity_id=str(row["entity_id"]),
                domain=str(row["domain"]),
                state=row["state"],
                attributes_json=as_dict(row["attributes_json"]),
                last_state_changed_at=row["last_state_changed_at"],
                is_primary=bool(row["is_primary"]),
                sort_order=int(row["sort_order"]),
            )
            for row in rows
        ]
