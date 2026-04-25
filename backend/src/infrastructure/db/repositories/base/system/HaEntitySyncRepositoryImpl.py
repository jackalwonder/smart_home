from __future__ import annotations

from psycopg.types.json import Jsonb

from src.infrastructure.db.connection.Database import Database
from src.infrastructure.db.repositories._support import session_scope
from src.infrastructure.db.repositories.base.system.HaEntitySyncRowMapper import (
    device_id_by_ha_device_id,
    entity_row_id_by_entity_id,
    room_id_by_name,
    runtime_entity_links,
)
from src.infrastructure.db.repositories.base.system.HaEntitySyncSql import (
    DELETE_STALE_DEVICE_ENTITY_LINKS_SQL,
    ENSURE_ROOM_SQL,
    FIND_STATE_CHANGED_ENTITY_SQL,
    INSERT_DEVICE_SQL,
    LOAD_DEVICES_SQL,
    LOAD_ENTITIES_SQL,
    LOAD_ROOMS_SQL,
    RUNTIME_ENTITY_LINKS_SQL,
    UPDATE_DEVICE_SQL,
    UPDATE_HA_ENTITY_SQL,
    UPDATE_HA_ENTITY_STATE_SQL,
    UPSERT_DEVICE_ENTITY_LINK_SQL,
    UPSERT_HA_ENTITY_SQL,
    UPSERT_RUNTIME_STATE_SQL,
)
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

    async def load_existing_rooms(
        self,
        home_id: str,
        ctx: RepoContext | None = None,
    ) -> dict[str, str]:
        async with session_scope(self._database, ctx) as (session, _):
            rows = (await session.execute(LOAD_ROOMS_SQL, {"home_id": home_id})).mappings().all()
        return room_id_by_name(list(rows))

    async def ensure_room(
        self,
        home_id: str,
        room_name: str,
        ctx: RepoContext | None = None,
    ) -> str:
        async with session_scope(self._database, ctx) as (session, owned):
            row = (
                await session.execute(ENSURE_ROOM_SQL, {"home_id": home_id, "room_name": room_name})
            ).mappings().one()
            if owned:
                await session.commit()
        return str(row["id"])

    async def load_existing_devices(
        self,
        home_id: str,
        ctx: RepoContext | None = None,
    ) -> dict[str, str]:
        async with session_scope(self._database, ctx) as (session, _):
            rows = (await session.execute(LOAD_DEVICES_SQL, {"home_id": home_id})).mappings().all()
        return device_id_by_ha_device_id(list(rows))

    async def load_existing_entities(
        self,
        home_id: str,
        entity_ids: list[str],
        ctx: RepoContext | None = None,
    ) -> dict[str, str]:
        if not entity_ids:
            return {}
        async with session_scope(self._database, ctx) as (session, _):
            rows = (
                await session.execute(
                    LOAD_ENTITIES_SQL,
                    {"home_id": home_id, "entity_ids": entity_ids},
                )
            ).mappings().all()
        return entity_row_id_by_entity_id(list(rows))

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
        stmt = UPDATE_DEVICE_SQL if device_id is not None else INSERT_DEVICE_SQL
        async with session_scope(self._database, ctx) as (session, owned):
            result = await session.execute(stmt, params)
            new_device_id = (
                device_id if device_id is not None else str(result.mappings().one()["id"])
            )
            if owned:
                await session.commit()
        return new_device_id

    async def upsert_runtime_state(
        self,
        input: HaRuntimeStateInput,
        ctx: RepoContext | None = None,
    ) -> None:
        async with session_scope(self._database, ctx) as (session, owned):
            await session.execute(
                UPSERT_RUNTIME_STATE_SQL,
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
        stmt = UPDATE_HA_ENTITY_SQL if ha_entity_id is not None else UPSERT_HA_ENTITY_SQL
        async with session_scope(self._database, ctx) as (session, owned):
            result = await session.execute(stmt, params)
            new_entity_id = (
                ha_entity_id
                if ha_entity_id is not None
                else str(result.mappings().one()["id"])
            )
            if owned:
                await session.commit()
        return new_entity_id

    async def upsert_device_entity_link(
        self,
        input: DeviceEntityLinkSaveInput,
        ctx: RepoContext | None = None,
    ) -> None:
        async with session_scope(self._database, ctx) as (session, owned):
            await session.execute(UPSERT_DEVICE_ENTITY_LINK_SQL, input.__dict__)
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
        async with session_scope(self._database, ctx) as (session, owned):
            await session.execute(
                DELETE_STALE_DEVICE_ENTITY_LINKS_SQL,
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
        async with session_scope(self._database, ctx) as (session, _):
            row = (
                await session.execute(
                    FIND_STATE_CHANGED_ENTITY_SQL,
                    {"home_id": home_id, "entity_id": entity_id},
                )
            ).mappings().one_or_none()
        return StateChangedEntityLinkRow(**row) if row is not None else None

    async def update_ha_entity_state(
        self,
        input: HaEntityStateUpdateInput,
        ctx: RepoContext | None = None,
    ) -> None:
        async with session_scope(self._database, ctx) as (session, owned):
            await session.execute(
                UPDATE_HA_ENTITY_STATE_SQL,
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
        async with session_scope(self._database, ctx) as (session, _):
            rows = (
                await session.execute(
                    RUNTIME_ENTITY_LINKS_SQL,
                    {"home_id": home_id, "device_id": device_id},
                )
            ).mappings().all()
        return runtime_entity_links(list(rows))
