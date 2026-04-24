from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, AbstractSet

from sqlalchemy import bindparam, text

from src.infrastructure.db.connection.Database import Database
from src.infrastructure.db.repositories._support import as_dict, as_list, session_scope
from src.modules.auth.services.guard.ManagementPinGuard import ManagementPinGuard
from src.repositories.base.devices.DeviceRepository import DeviceMappingPatch
from src.repositories.base.devices.DeviceRepository import DeviceRepository
from src.shared.errors.AppError import AppError
from src.shared.errors.ErrorCode import ErrorCode
from src.shared.kernel.RepoContext import RepoContext
from src.shared.kernel.UnitOfWork import UnitOfWork


@dataclass(frozen=True)
class DeviceCatalogItem:
    id: str
    room_id: str | None
    display_name: str
    raw_name: str | None
    device_type: str
    is_readonly_device: bool
    is_complex_device: bool
    entry_behavior: str


@dataclass(frozen=True)
class DeviceMappingSaveView:
    saved: bool
    device_id: str
    room_id: str | None
    device_type: str | None
    is_primary_device: bool
    default_control_target: str | None
    updated_at: str


class DeviceCatalogService:
    def __init__(
        self,
        database: Database,
        unit_of_work: UnitOfWork,
        device_repository: DeviceRepository,
        management_pin_guard: ManagementPinGuard,
    ) -> None:
        self._database = database
        self._unit_of_work = unit_of_work
        self._device_repository = device_repository
        self._management_pin_guard = management_pin_guard

    async def list_devices(
        self,
        home_id: str,
        *,
        room_id: str | None = None,
        device_type: str | None = None,
        status: str | None = None,
        keyword: str | None = None,
        only_homepage_candidate: bool = False,
        only_favorite_candidate: bool = False,
        page: int = 1,
        page_size: int = 20,
    ) -> dict[str, Any]:
        normalized_page = max(page, 1)
        normalized_page_size = max(page_size, 1)
        async with session_scope(self._database) as (session, _):
            settings_row = (
                await session.execute(
                    text(
                        """
                        SELECT
                            id::text AS id,
                            settings_version
                        FROM v_current_settings_versions
                        WHERE home_id = :home_id
                        """
                    ),
                    {"home_id": home_id},
                )
            ).mappings().one_or_none()
            favorite_rows: list[dict[str, Any]] = []
            if settings_row is not None:
                favorite_rows = (
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
                        {"settings_version_id": settings_row["id"]},
                    )
                ).mappings().all()

            media_row = (
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

            device_ids = [row["device_id"] for row in rows]
            badge_map: dict[str, list[dict[str, Any]]] = {}
            if device_ids:
                badge_rows = (
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
                for badge in badge_rows:
                    badge_map.setdefault(badge["device_id"], []).append(
                        {
                            "code": badge["code"],
                            "level": badge["level"],
                            "text": badge["text"],
                        }
                    )

        favorite_map = {
            row["device_id"]: {
                "selected": row["selected"],
                "favorite_order": row["favorite_order"],
            }
            for row in favorite_rows
        }
        media_device_id = media_row["device_id"] if media_row is not None else None
        items: list[dict[str, Any]] = []
        for row in rows:
            favorite_entry = favorite_map.get(row["device_id"])
            is_favorite = bool(favorite_entry["selected"]) if favorite_entry is not None else False
            favorite_order = favorite_entry["favorite_order"] if favorite_entry is not None else None
            is_favorite_candidate = not row["is_readonly_device"] and row["device_id"] != media_device_id
            favorite_exclude_reason = None
            if row["is_readonly_device"]:
                favorite_exclude_reason = "READONLY_DEVICE"
            elif row["device_id"] == media_device_id:
                favorite_exclude_reason = "DEFAULT_MEDIA_DEVICE"

            item = {
                "device_id": row["device_id"],
                "display_name": row["display_name"],
                "raw_name": row["raw_name"],
                "device_type": row["device_type"],
                "room_id": row["room_id"],
                "room_name": row["room_name"],
                "status": row["status"],
                "is_offline": row["is_offline"],
                "is_complex_device": row["is_complex_device"],
                "is_readonly_device": row["is_readonly_device"],
                "confirmation_type": row["confirmation_type"],
                "entry_behavior": row["entry_behavior"],
                "default_control_target": row["default_control_target"],
                "is_homepage_visible": row["is_homepage_visible"],
                "is_primary_device": row["is_primary_device"],
                "is_favorite": is_favorite,
                "favorite_order": favorite_order,
                "is_favorite_candidate": is_favorite_candidate,
                "favorite_exclude_reason": favorite_exclude_reason,
                "capabilities": as_dict(row["capabilities_json"]),
                "alert_badges": badge_map.get(row["device_id"], []),
                "status_summary": as_dict(row["status_summary_json"]),
            }
            if only_homepage_candidate and not item["is_homepage_visible"]:
                continue
            if only_favorite_candidate and not item["is_favorite_candidate"]:
                continue
            items.append(item)

        total = len(items)
        start = (normalized_page - 1) * normalized_page_size
        paged_items = items[start : start + normalized_page_size]
        return {
            "items": paged_items,
            "page_info": {
                "page": normalized_page,
                "page_size": normalized_page_size,
                "total": total,
                "has_next": start + normalized_page_size < total,
            },
        }

    async def update_mapping(
        self,
        home_id: str,
        terminal_id: str,
        device_id: str,
        room_id: str | None,
        device_type: str | None,
        is_primary_device: bool | None,
        default_control_target: str | None,
        provided_fields: AbstractSet[str],
    ) -> dict[str, Any]:
        await self._management_pin_guard.require_active_session(home_id, terminal_id)

        async def _transaction(tx):
            device = await self._device_repository.find_by_id(
                home_id,
                device_id,
                ctx=RepoContext(tx=tx),
            )
            if device is None:
                raise AppError(ErrorCode.DEVICE_NOT_FOUND, "device not found")

            if "room_id" in provided_fields and room_id is not None:
                room_row = (
                    await tx.session.execute(
                        text(
                            """
                            SELECT id::text AS room_id
                            FROM rooms
                            WHERE home_id = :home_id
                              AND id::text = :room_id
                            """
                        ),
                        {"home_id": home_id, "room_id": room_id},
                    )
                ).mappings().one_or_none()
                if room_row is None:
                    raise AppError(
                        ErrorCode.INVALID_PARAMS,
                        "room_id is invalid",
                        details={"fields": [{"field": "room_id", "reason": "not_found"}]},
                    )

            await self._device_repository.update_mapping(
                device_id,
                DeviceMappingPatch(
                    room_id=room_id,
                    room_id_provided="room_id" in provided_fields,
                    device_type=device_type,
                    device_type_provided="device_type" in provided_fields,
                    is_primary_device=is_primary_device,
                    is_primary_device_provided="is_primary_device" in provided_fields,
                    default_control_target=default_control_target,
                    default_control_target_provided="default_control_target" in provided_fields,
                ),
                ctx=RepoContext(tx=tx),
            )
            row = (
                await tx.session.execute(
                    text(
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
                    ),
                    {"home_id": home_id, "device_id": device_id},
                )
            ).mappings().one()
            return asdict(
                DeviceMappingSaveView(
                    saved=True,
                    device_id=row["device_id"],
                    room_id=row["room_id"],
                    device_type=row["device_type"],
                    is_primary_device=row["is_primary_device"],
                    default_control_target=row["default_control_target"],
                    updated_at=row["updated_at"],
                )
            )

        return await self._unit_of_work.run_in_transaction(_transaction)

    async def list_rooms(self, home_id: str, include_counts: bool = True) -> list[dict[str, Any]]:
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
        return [
            {
                "room_id": row["room_id"],
                "room_name": row["room_name"],
                "priority": row["priority"],
                "device_count": row["device_count"],
                "homepage_device_count": row["homepage_device_count"],
                "visible_in_editor": row["visible_in_editor"],
            }
            for row in rows
        ]

    async def get_device_detail(
        self,
        home_id: str,
        device_id: str,
        *,
        include_runtime_fields: bool = True,
        include_editor_fields: bool = False,
    ) -> dict[str, Any]:
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
                raise AppError(ErrorCode.DEVICE_NOT_FOUND, "device not found")

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

            editor_config = None
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
                editor_config = {
                    "hotspots": [
                        {
                            "hotspot_id": hotspot["hotspot_id"],
                            "x": hotspot["x"],
                            "y": hotspot["y"],
                            "icon_type": hotspot["icon_type"],
                            "icon_asset_id": hotspot["icon_asset_id"],
                            "icon_asset_url": (
                                f"/api/v1/page-assets/hotspot-icons/{hotspot['icon_asset_id']}/file"
                                if hotspot["icon_asset_id"] is not None
                                else None
                            ),
                            "label_mode": hotspot["label_mode"],
                            "is_visible": hotspot["is_visible"],
                            "structure_order": hotspot["structure_order"],
                        }
                        for hotspot in hotspot_rows
                    ]
                }

        alert_badges = [
            {
                "code": badge["code"],
                "level": badge["level"],
                "text": badge["text"],
            }
            for badge in badge_rows
        ]
        runtime_state = None
        if include_runtime_fields:
            runtime_payload = as_dict(row["runtime_state_json"])
            runtime_state = {
                "last_state_update_at": row["last_state_update_at"],
                "aggregated_state": row["aggregated_state"] or runtime_payload.get("state"),
                "aggregated_mode": row["aggregated_mode"],
                "aggregated_position": row["aggregated_position"],
                "telemetry": as_dict(runtime_payload.get("attributes")),
                "alerts": alert_badges,
            }

        source_info = as_dict(row["source_meta_json"])
        source_info["entity_links"] = [
            {
                "ha_entity_row_id": entity["ha_entity_row_id"],
                "entity_id": entity["entity_id"],
                "platform": entity["platform"],
                "domain": entity["domain"],
                "raw_name": entity["raw_name"],
                "state": entity["state"],
                "room_hint": entity["room_hint"],
                "is_available": entity["is_available"],
                "last_synced_at": entity["last_synced_at"],
                "last_state_changed_at": entity["last_state_changed_at"],
                "entity_role": entity["entity_role"],
                "is_primary": entity["is_primary"],
                "sort_order": entity["sort_order"],
            }
            for entity in entity_link_rows
        ]

        return {
            "device_id": row["device_id"],
            "display_name": row["display_name"],
            "raw_name": row["raw_name"],
            "device_type": row["device_type"],
            "room_id": row["room_id"],
            "room_name": row["room_name"],
            "status": row["status"],
            "is_offline": row["is_offline"],
            "is_complex_device": row["is_complex_device"],
            "is_readonly_device": row["is_readonly_device"],
            "confirmation_type": row["confirmation_type"],
            "entry_behavior": row["entry_behavior"],
            "default_control_target": row["default_control_target"],
            "capabilities": as_dict(row["capabilities_json"]),
            "alert_badges": alert_badges,
            "status_summary": as_dict(row["status_summary_json"]),
            "runtime_state": runtime_state,
            "control_schema": []
            if row["is_readonly_device"]
            else [
                {
                    "action_type": schema["action_type"],
                    "target_scope": schema["target_scope"],
                    "target_key": schema["target_key"],
                    "value_type": schema["value_type"],
                    "value_range": as_dict(schema["value_range_json"])
                    if schema["value_range_json"] is not None
                    else None,
                    "allowed_values": as_list(schema["allowed_values_json"])
                    if schema["allowed_values_json"] is not None
                    else None,
                    "unit": schema["unit"],
                    "is_quick_action": schema["is_quick_action"],
                    "requires_detail_entry": schema["requires_detail_entry"],
                }
                for schema in schema_rows
            ],
            "editor_config": editor_config,
            "source_info": source_info,
        }

    async def get_panel(
        self,
        home_id: str,
        panel_type: str,
        *,
        room_id: str | None = None,
        page: int | None = None,
        page_size: int | None = None,
    ) -> dict[str, Any]:
        normalized_panel_type = panel_type.upper()
        async with session_scope(self._database) as (session, _):
            settings_row = (
                await session.execute(
                    text(
                        """
                        SELECT
                            id::text AS id,
                            settings_version
                        FROM v_current_settings_versions
                        WHERE home_id = :home_id
                        """
                    ),
                    {"home_id": home_id},
                )
            ).mappings().one_or_none()
            favorite_rows: list[dict[str, Any]] = []
            low_battery_threshold = 20.0
            if settings_row is not None:
                favorite_rows = (
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
                        {"settings_version_id": settings_row["id"]},
                    )
                ).mappings().all()
                function_row = (
                    await session.execute(
                        text(
                            """
                            SELECT low_battery_threshold::float8 AS low_battery_threshold
                            FROM function_settings
                            WHERE settings_version_id = :settings_version_id
                            """
                        ),
                        {"settings_version_id": settings_row["id"]},
                    )
                ).mappings().one_or_none()
                if function_row is not None:
                    low_battery_threshold = float(function_row["low_battery_threshold"])

            media_row = (
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
            device_ids = [row["device_id"] for row in rows]
            badge_map: dict[str, list[dict[str, Any]]] = {}
            if device_ids:
                badge_rows = (
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
                for badge in badge_rows:
                    badge_map.setdefault(badge["device_id"], []).append(
                        {
                            "code": badge["code"],
                            "level": badge["level"],
                            "text": badge["text"],
                        }
                    )

        favorites_map = {
            row["device_id"]: {
                "selected": row["selected"],
                "favorite_order": row["favorite_order"],
            }
            for row in favorite_rows
        }
        media_device_id = media_row["device_id"] if media_row is not None else None
        items: list[dict[str, Any]] = []
        for row in rows:
            runtime_state = as_dict(row["runtime_state_json"])
            badges = badge_map.get(row["device_id"], [])
            favorite_entry = favorites_map.get(row["device_id"])
            favorite_selected = bool(favorite_entry["selected"]) if favorite_entry is not None else False
            favorite_order = favorite_entry["favorite_order"] if favorite_entry is not None else None
            battery_level = runtime_state.get("attributes", {}).get("battery")
            if battery_level is None:
                battery_level = runtime_state.get("attributes", {}).get("battery_level")
            is_selectable = not row["is_readonly_device"] and row["device_id"] != media_device_id
            exclude_reason = None
            if row["is_readonly_device"]:
                exclude_reason = "READONLY_DEVICE"
            elif row["device_id"] == media_device_id:
                exclude_reason = "DEFAULT_MEDIA_DEVICE"
            item = {
                "device_id": row["device_id"],
                "display_name": row["display_name"],
                "device_type": row["device_type"],
                "room_id": row["room_id"],
                "room_name": row["room_name"],
                "status": row["status"],
                "is_offline": row["is_offline"],
                "is_complex_device": row["is_complex_device"],
                "is_readonly_device": row["is_readonly_device"],
                "entry_behavior": row["entry_behavior"],
                "confirmation_type": row["confirmation_type"],
                "alert_badges": badges,
                "favorite_order": favorite_order,
                "is_selectable": is_selectable,
                "exclude_reason": exclude_reason,
                "_favorite_selected": favorite_selected,
                "_battery_level": battery_level,
                "_badge_codes": {badge["code"] for badge in badges},
                "_default_control_target": row["default_control_target"],
            }
            items.append(item)

        if normalized_panel_type == "LIGHTS":
            items = [
                item
                for item in items
                if item["device_type"] in {"light", "switch"}
                or item["_default_control_target"] in {"light", "switch"}
            ]
        elif normalized_panel_type == "ACS":
            items = [
                item
                for item in items
                if item["device_type"] in {"climate", "ac"}
                or item["_default_control_target"] == "climate"
            ]
        elif normalized_panel_type == "LOW_BATTERY":
            items = [
                item
                for item in items
                if not item["is_offline"]
                and (
                    "LOW_BATTERY" in item["_badge_codes"]
                    or (
                        isinstance(item["_battery_level"], (int, float))
                        and float(item["_battery_level"]) <= low_battery_threshold
                    )
                )
            ]
        elif normalized_panel_type == "OFFLINE":
            items = [item for item in items if item["is_offline"]]
        elif normalized_panel_type == "FAVORITES":
            items = [item for item in items if item["_favorite_selected"]]
            items.sort(
                key=lambda item: (
                    item["favorite_order"] if item["favorite_order"] is not None else 1_000_000,
                    item["display_name"],
                    item["device_id"],
                )
            )
        else:
            raise AppError(
                ErrorCode.INVALID_PARAMS,
                "panel_type is invalid",
                details={"fields": [{"field": "panel_type", "reason": "unsupported_enum"}]},
            )

        for item in items:
            item.pop("_favorite_selected", None)
            item.pop("_battery_level", None)
            item.pop("_badge_codes", None)
            item.pop("_default_control_target", None)

        total_count = len(items)
        if page is not None and page_size is not None and page > 0 and page_size > 0:
            start = (page - 1) * page_size
            items = items[start : start + page_size]

        return {
            "panel_type": normalized_panel_type,
            "title": {
                "LIGHTS": "Lights",
                "ACS": "Air Conditioners",
                "LOW_BATTERY": "Low Battery",
                "OFFLINE": "Offline Devices",
                "FAVORITES": "Favorites",
            }[normalized_panel_type],
            "items": items,
            "summary": {"count": total_count},
            "cache_mode": False,
        }
