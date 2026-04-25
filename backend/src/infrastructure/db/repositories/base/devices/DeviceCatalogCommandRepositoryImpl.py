from __future__ import annotations

from sqlalchemy import text

from src.infrastructure.db.connection.Database import Database
from src.infrastructure.db.repositories._support import session_scope
from src.repositories.base.devices.DeviceCatalogCommandRepository import (
    DeviceMappingSavedRow,
)
from src.shared.kernel.RepoContext import RepoContext


class DeviceCatalogCommandRepositoryImpl:
    def __init__(self, database: Database) -> None:
        self._database = database

    async def room_exists(
        self,
        *,
        home_id: str,
        room_id: str,
        ctx: RepoContext | None = None,
    ) -> bool:
        stmt = text(
            """
            SELECT id::text AS room_id
            FROM rooms
            WHERE home_id = :home_id
              AND id::text = :room_id
            """
        )
        async with session_scope(self._database, ctx) as (session, _):
            row = (
                await session.execute(
                    stmt,
                    {"home_id": home_id, "room_id": room_id},
                )
            ).mappings().one_or_none()
        return row is not None

    async def get_mapping_saved_row(
        self,
        *,
        home_id: str,
        device_id: str,
        ctx: RepoContext | None = None,
    ) -> DeviceMappingSavedRow:
        stmt = text(
            """
            SELECT
                id::text AS device_id,
                room_id::text AS room_id,
                device_type,
                is_primary_device,
                default_control_target,
                updated_at::text AS updated_at
            FROM devices
            WHERE home_id = :home_id
              AND id = :device_id
            """
        )
        async with session_scope(self._database, ctx) as (session, _):
            row = (
                await session.execute(
                    stmt,
                    {"home_id": home_id, "device_id": device_id},
                )
            ).mappings().one()
        return DeviceMappingSavedRow(**dict(row))
