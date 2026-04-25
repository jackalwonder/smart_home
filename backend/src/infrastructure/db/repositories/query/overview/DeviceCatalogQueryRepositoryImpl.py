from __future__ import annotations

from src.infrastructure.db.connection.Database import Database
from src.infrastructure.db.repositories._support import session_scope
from src.infrastructure.db.repositories.query.overview.DeviceCatalogQuerySql import (
    ACTIVE_BADGES_SQL,
    CONTROL_SCHEMA_SQL,
    DETAIL_BADGES_SQL,
    DETAIL_SQL,
    EDITOR_HOTSPOTS_SQL,
    ENTITY_LINKS_SQL,
    FAVORITE_ROWS_SQL,
    LOW_BATTERY_THRESHOLD_SQL,
    MEDIA_DEVICE_ID_SQL,
    ROOMS_SQL,
    ROOMS_WITH_COUNTS_SQL,
    SETTINGS_ID_SQL,
    build_list_devices_statement,
    build_panel_devices_statement,
)
from src.infrastructure.db.repositories.query.overview.DeviceCatalogRowMapper import (
    badge_map,
    detail_snapshot,
    favorite_rows,
    list_rows,
    list_snapshot,
    panel_rows,
    panel_snapshot,
    room_rows,
)
from src.repositories.query.overview.DeviceCatalogQueryRepository import (
    DeviceCatalogBadgeRow,
    DeviceCatalogDetailSnapshot,
    DeviceCatalogFavoriteRow,
    DeviceCatalogListSnapshot,
    DeviceCatalogPanelSnapshot,
    DeviceCatalogRoomRow,
)


class DeviceCatalogQueryRepositoryImpl:
    def __init__(self, database: Database) -> None:
        self._database = database

    async def _settings_id(self, session, home_id: str) -> str | None:
        row = (
            await session.execute(SETTINGS_ID_SQL, {"home_id": home_id})
        ).mappings().one_or_none()
        return row["id"] if row is not None else None

    async def _favorite_rows(
        self,
        session,
        settings_version_id: str | None,
    ) -> list[DeviceCatalogFavoriteRow]:
        if settings_version_id is None:
            return []
        rows = (
            await session.execute(
                FAVORITE_ROWS_SQL,
                {"settings_version_id": settings_version_id},
            )
        ).mappings().all()
        return favorite_rows(list(rows))

    async def _media_device_id(self, session, home_id: str) -> str | None:
        row = (
            await session.execute(MEDIA_DEVICE_ID_SQL, {"home_id": home_id})
        ).mappings().one_or_none()
        return row["device_id"] if row is not None else None

    async def _active_badges(
        self,
        session,
        device_ids: list[str],
    ) -> dict[str, list[DeviceCatalogBadgeRow]]:
        if not device_ids:
            return {}
        rows = (
            await session.execute(ACTIVE_BADGES_SQL, {"device_ids": device_ids})
        ).mappings().all()
        return badge_map(list(rows))

    async def list_devices_snapshot(
        self,
        *,
        home_id: str,
        room_id: str | None,
        device_type: str | None,
        status: str | None,
        keyword: str | None,
    ) -> DeviceCatalogListSnapshot:
        async with session_scope(self._database) as (session, _):
            settings_id = await self._settings_id(session, home_id)
            favorites = await self._favorite_rows(session, settings_id)
            media_device_id = await self._media_device_id(session, home_id)
            stmt, params = build_list_devices_statement(
                home_id=home_id,
                room_id=room_id,
                device_type=device_type,
                status=status,
                keyword=keyword,
            )
            rows = (await session.execute(stmt, params)).mappings().all()
            devices = list_rows(list(rows))
            badges = await self._active_badges(
                session,
                [device.device_id for device in devices],
            )
        return list_snapshot(
            favorites=favorites,
            media_device_id=media_device_id,
            devices=devices,
            badges=badges,
        )

    async def list_rooms(
        self,
        *,
        home_id: str,
        include_counts: bool,
    ) -> list[DeviceCatalogRoomRow]:
        stmt = ROOMS_WITH_COUNTS_SQL if include_counts else ROOMS_SQL
        async with session_scope(self._database) as (session, _):
            rows = (await session.execute(stmt, {"home_id": home_id})).mappings().all()
        return room_rows(list(rows))

    async def get_device_detail_snapshot(
        self,
        *,
        home_id: str,
        device_id: str,
        include_editor_fields: bool,
    ) -> DeviceCatalogDetailSnapshot:
        params = {"home_id": home_id, "device_id": device_id}
        async with session_scope(self._database) as (session, _):
            row = (await session.execute(DETAIL_SQL, params)).mappings().one_or_none()
            if row is None:
                return detail_snapshot(
                    device_row=None,
                    badge_rows=[],
                    schema_rows=[],
                    entity_link_rows=[],
                    hotspot_rows=None,
                )

            badge_rows = (
                await session.execute(DETAIL_BADGES_SQL, {"device_id": device_id})
            ).mappings().all()
            schema_rows = (
                await session.execute(CONTROL_SCHEMA_SQL, {"device_id": device_id})
            ).mappings().all()
            entity_link_rows = (
                await session.execute(ENTITY_LINKS_SQL, params)
            ).mappings().all()
            hotspot_rows = None
            if include_editor_fields:
                hotspot_rows = (
                    await session.execute(EDITOR_HOTSPOTS_SQL, params)
                ).mappings().all()

        return detail_snapshot(
            device_row=row,
            badge_rows=list(badge_rows),
            schema_rows=list(schema_rows),
            entity_link_rows=list(entity_link_rows),
            hotspot_rows=list(hotspot_rows) if hotspot_rows is not None else None,
        )

    async def get_panel_snapshot(
        self,
        *,
        home_id: str,
        room_id: str | None,
    ) -> DeviceCatalogPanelSnapshot:
        async with session_scope(self._database) as (session, _):
            settings_id = await self._settings_id(session, home_id)
            favorites = await self._favorite_rows(session, settings_id)
            low_battery_threshold = 20.0
            if settings_id is not None:
                function_row = (
                    await session.execute(
                        LOW_BATTERY_THRESHOLD_SQL,
                        {"settings_version_id": settings_id},
                    )
                ).mappings().one_or_none()
                if function_row is not None:
                    low_battery_threshold = float(function_row["low_battery_threshold"])

            media_device_id = await self._media_device_id(session, home_id)
            stmt, params = build_panel_devices_statement(home_id=home_id, room_id=room_id)
            rows = (await session.execute(stmt, params)).mappings().all()
            devices = panel_rows(list(rows))
            badges = await self._active_badges(
                session,
                [device.device_id for device in devices],
            )
        return panel_snapshot(
            favorites=favorites,
            media_device_id=media_device_id,
            low_battery_threshold=low_battery_threshold,
            devices=devices,
            badges=badges,
        )
