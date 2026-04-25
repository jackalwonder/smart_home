from __future__ import annotations

from typing import Any

from sqlalchemy import bindparam, text

from src.infrastructure.db.connection.Database import Database
from src.infrastructure.db.repositories._support import session_scope
from src.repositories.query.overview.DeviceCatalogQueryRepository import (
    DeviceCatalogBadgeRow,
    DeviceCatalogDetailRow,
    DeviceCatalogDetailSnapshot,
    DeviceCatalogFavoriteRow,
    DeviceCatalogListRow,
    DeviceCatalogListSnapshot,
    DeviceCatalogPanelRow,
    DeviceCatalogPanelSnapshot,
    DeviceCatalogRoomRow,
    DeviceControlSchemaQueryRow,
    DeviceEditorHotspotQueryRow,
    DeviceEntityLinkQueryRow,
)


def _badge_map(rows: list[Any]) -> dict[str, list[DeviceCatalogBadgeRow]]:
    result: dict[str, list[DeviceCatalogBadgeRow]] = {}
    for row in rows:
        result.setdefault(row["device_id"], []).append(
            DeviceCatalogBadgeRow(
                code=row["code"],
                level=row["level"],
                text=row["text"],
            )
        )
    return result


class DeviceCatalogQueryRepositoryImpl:
    def __init__(self, database: Database) -> None:
        self._database = database

    async def _settings_id(self, session, home_id: str) -> str | None:
        row = (
            await session.execute(
                text(
                    """
                    SELECT id::text AS id
                    FROM v_current_settings_versions
                    WHERE home_id = :home_id
                    """
                ),
                {"home_id": home_id},
            )
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
                text(
                    """
                    SELECT
                        device_id::text AS device_id,
                        selected,
                        favorite_order
                    FROM favorite_devices
                    WHERE settings_version_id = :settings_version_id
                    """
                ),
                {"settings_version_id": settings_version_id},
            )
        ).mappings().all()
        return [
            DeviceCatalogFavoriteRow(
                device_id=row["device_id"],
                selected=bool(row["selected"]),
                favorite_order=row["favorite_order"],
            )
            for row in rows
        ]

    async def _media_device_id(self, session, home_id: str) -> str | None:
        row = (
            await session.execute(
                text(
                    """
                    SELECT device_id::text AS device_id
                    FROM media_bindings
                    WHERE home_id = :home_id
                      AND binding_status = 'MEDIA_SET'
                    """
                ),
                {"home_id": home_id},
            )
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
            await session.execute(
                text(
                    """
                    SELECT
                        device_id::text AS device_id,
                        code,
                        level,
                        text
                    FROM device_alert_badges
                    WHERE is_active = true
                      AND device_id IN :device_ids
                    ORDER BY created_at ASC
                    """
                ).bindparams(bindparam("device_ids", expanding=True)),
                {"device_ids": device_ids},
            )
        ).mappings().all()
        return _badge_map(rows)

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

            clauses = ["d.home_id = :home_id"]
            params: dict[str, Any] = {"home_id": home_id}
            if room_id is not None:
                clauses.append("d.room_id = :room_id")
                params["room_id"] = room_id
            if device_type is not None:
                clauses.append("d.device_type = :device_type")
                params["device_type"] = device_type
            if status is not None:
                clauses.append("COALESCE(drs.status, 'UNKNOWN') = :status")
                params["status"] = status
            if keyword is not None:
                clauses.append(
                    "(d.display_name ILIKE :keyword OR COALESCE(d.raw_name, '') ILIKE :keyword)"
                )
                params["keyword"] = f"%{keyword}%"

            rows = (
                await session.execute(
                    text(
                        f"""
                        SELECT
                            d.id::text AS device_id,
                            d.display_name,
                            d.raw_name,
                            d.device_type,
                            d.room_id::text AS room_id,
                            r.room_name,
                            COALESCE(drs.status, 'UNKNOWN') AS status,
                            COALESCE(drs.is_offline, true) AS is_offline,
                            d.is_complex_device,
                            d.is_readonly_device,
                            d.confirmation_type::text AS confirmation_type,
                            d.entry_behavior::text AS entry_behavior,
                            d.default_control_target,
                            d.is_homepage_visible,
                            d.is_primary_device,
                            COALESCE(d.capabilities_json, '{{}}'::jsonb) AS capabilities_json,
                            COALESCE(drs.status_summary_json, '{{}}'::jsonb) AS status_summary_json
                        FROM devices d
                        LEFT JOIN rooms r
                          ON r.id = d.room_id
                        LEFT JOIN device_runtime_states drs
                          ON drs.device_id = d.id
                        WHERE {' AND '.join(clauses)}
                        ORDER BY d.display_name ASC, d.id ASC
                        """
                    ),
                    params,
                )
            ).mappings().all()
            devices = [DeviceCatalogListRow(**dict(row)) for row in rows]
            badge_map = await self._active_badges(
                session,
                [device.device_id for device in devices],
            )
        return DeviceCatalogListSnapshot(
            favorites=favorites,
            media_device_id=media_device_id,
            devices=devices,
            badge_map=badge_map,
        )

    async def list_rooms(
        self,
        *,
        home_id: str,
        include_counts: bool,
    ) -> list[DeviceCatalogRoomRow]:
        if include_counts:
            stmt = text(
                """
                SELECT
                    r.id::text AS room_id,
                    r.room_name,
                    r.priority,
                    r.visible_in_editor,
                    COUNT(d.id)::int AS device_count,
                    COUNT(*) FILTER (WHERE d.is_homepage_visible = true)::int AS homepage_device_count
                FROM rooms r
                LEFT JOIN devices d
                  ON d.room_id = r.id
                WHERE r.home_id = :home_id
                GROUP BY r.id, r.room_name, r.priority, r.visible_in_editor, r.sort_order, r.created_at
                ORDER BY r.priority DESC, r.room_name ASC, r.created_at ASC
                """
            )
        else:
            stmt = text(
                """
                SELECT
                    r.id::text AS room_id,
                    r.room_name,
                    r.priority,
                    r.visible_in_editor,
                    0::int AS device_count,
                    0::int AS homepage_device_count
                FROM rooms r
                WHERE r.home_id = :home_id
                ORDER BY r.priority DESC, r.room_name ASC, r.created_at ASC
                """
            )
        async with session_scope(self._database) as (session, _):
            rows = (await session.execute(stmt, {"home_id": home_id})).mappings().all()
        return [DeviceCatalogRoomRow(**dict(row)) for row in rows]

    async def get_device_detail_snapshot(
        self,
        *,
        home_id: str,
        device_id: str,
        include_editor_fields: bool,
    ) -> DeviceCatalogDetailSnapshot:
        async with session_scope(self._database) as (session, _):
            row = (
                await session.execute(
                    text(
                        """
                        SELECT
                            d.id::text AS device_id,
                            d.display_name,
                            d.raw_name,
                            d.device_type,
                            d.room_id::text AS room_id,
                            r.room_name,
                            COALESCE(drs.status, 'UNKNOWN') AS status,
                            COALESCE(drs.is_offline, true) AS is_offline,
                            d.is_complex_device,
                            d.is_readonly_device,
                            d.confirmation_type::text AS confirmation_type,
                            d.entry_behavior::text AS entry_behavior,
                            d.default_control_target,
                            d.capabilities_json,
                            d.source_meta_json,
                            drs.status_summary_json,
                            drs.runtime_state_json,
                            drs.aggregated_state,
                            drs.aggregated_mode,
                            drs.aggregated_position::float8 AS aggregated_position,
                            drs.last_state_update_at::text AS last_state_update_at
                        FROM devices d
                        LEFT JOIN rooms r
                          ON r.id = d.room_id
                        LEFT JOIN device_runtime_states drs
                          ON drs.device_id = d.id
                        WHERE d.home_id = :home_id
                          AND d.id = :device_id
                        """
                    ),
                    {"home_id": home_id, "device_id": device_id},
                )
            ).mappings().one_or_none()
            if row is None:
                return DeviceCatalogDetailSnapshot(device=None)

            badge_rows = (
                await session.execute(
                    text(
                        """
                        SELECT code, level, text
                        FROM device_alert_badges
                        WHERE device_id = :device_id
                          AND is_active = true
                        ORDER BY created_at ASC
                        """
                    ),
                    {"device_id": device_id},
                )
            ).mappings().all()
            schema_rows = (
                await session.execute(
                    text(
                        """
                        SELECT
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
                    ),
                    {"device_id": device_id},
                )
            ).mappings().all()
            entity_link_rows = (
                await session.execute(
                    text(
                        """
                        SELECT
                            he.id::text AS ha_entity_row_id,
                            he.entity_id,
                            he.platform,
                            he.domain,
                            he.raw_name,
                            he.state,
                            he.room_hint,
                            he.is_available,
                            he.last_synced_at::text AS last_synced_at,
                            he.last_state_changed_at::text AS last_state_changed_at,
                            del.entity_role::text AS entity_role,
                            del.is_primary,
                            del.sort_order
                        FROM device_entity_links del
                        JOIN ha_entities he
                          ON he.id = del.ha_entity_id
                        WHERE del.home_id = :home_id
                          AND del.device_id = :device_id
                        ORDER BY del.sort_order ASC, del.is_primary DESC, he.entity_id ASC
                        """
                    ),
                    {"home_id": home_id, "device_id": device_id},
                )
            ).mappings().all()
            hotspot_rows = None
            if include_editor_fields:
                hotspot_rows = (
                    await session.execute(
                        text(
                            """
                            SELECT
                                lh.hotspot_id,
                                lh.x::float8 AS x,
                                lh.y::float8 AS y,
                                lh.icon_type,
                                lh.icon_asset_id::text AS icon_asset_id,
                                lh.label_mode,
                                lh.is_visible,
                                lh.structure_order
                            FROM v_current_layout_versions clv
                            JOIN layout_hotspots lh
                              ON lh.layout_version_id = clv.id
                            WHERE clv.home_id = :home_id
                              AND lh.device_id = :device_id
                            ORDER BY lh.structure_order ASC, lh.hotspot_id ASC
                            """
                        ),
                        {"home_id": home_id, "device_id": device_id},
                    )
                ).mappings().all()

        return DeviceCatalogDetailSnapshot(
            device=DeviceCatalogDetailRow(**dict(row)),
            badges=[DeviceCatalogBadgeRow(**dict(badge)) for badge in badge_rows],
            control_schema=[
                DeviceControlSchemaQueryRow(**dict(schema)) for schema in schema_rows
            ],
            entity_links=[
                DeviceEntityLinkQueryRow(**dict(entity)) for entity in entity_link_rows
            ],
            editor_hotspots=[
                DeviceEditorHotspotQueryRow(**dict(hotspot)) for hotspot in hotspot_rows
            ]
            if hotspot_rows is not None
            else None,
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
                        text(
                            """
                            SELECT low_battery_threshold::float8 AS low_battery_threshold
                            FROM function_settings
                            WHERE settings_version_id = :settings_version_id
                            """
                        ),
                        {"settings_version_id": settings_id},
                    )
                ).mappings().one_or_none()
                if function_row is not None:
                    low_battery_threshold = float(function_row["low_battery_threshold"])

            media_device_id = await self._media_device_id(session, home_id)
            params: dict[str, Any] = {"home_id": home_id}
            room_clause = ""
            if room_id is not None:
                params["room_id"] = room_id
                room_clause = "AND d.room_id = :room_id"
            rows = (
                await session.execute(
                    text(
                        f"""
                        SELECT
                            d.id::text AS device_id,
                            d.display_name,
                            d.device_type,
                            d.room_id::text AS room_id,
                            r.room_name,
                            COALESCE(drs.status, 'UNKNOWN') AS status,
                            COALESCE(drs.is_offline, true) AS is_offline,
                            d.is_complex_device,
                            d.is_readonly_device,
                            d.confirmation_type::text AS confirmation_type,
                            d.entry_behavior::text AS entry_behavior,
                            d.default_control_target,
                            drs.runtime_state_json
                        FROM devices d
                        LEFT JOIN rooms r
                          ON r.id = d.room_id
                        LEFT JOIN device_runtime_states drs
                          ON drs.device_id = d.id
                        WHERE d.home_id = :home_id
                        {room_clause}
                        ORDER BY d.display_name ASC, d.id ASC
                        """
                    ),
                    params,
                )
            ).mappings().all()
            devices = [DeviceCatalogPanelRow(**dict(row)) for row in rows]
            badge_map = await self._active_badges(
                session,
                [device.device_id for device in devices],
            )
        return DeviceCatalogPanelSnapshot(
            favorites=favorites,
            media_device_id=media_device_id,
            low_battery_threshold=low_battery_threshold,
            devices=devices,
            badge_map=badge_map,
        )
