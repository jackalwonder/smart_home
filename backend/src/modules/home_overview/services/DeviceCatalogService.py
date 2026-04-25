from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import AbstractSet, Any

from src.modules.auth.services.guard.ManagementPinGuard import ManagementPinGuard
from src.repositories.base.devices.DeviceCatalogCommandRepository import (
    DeviceCatalogCommandRepository,
)
from src.repositories.base.devices.DeviceRepository import DeviceMappingPatch
from src.repositories.base.devices.DeviceRepository import DeviceRepository
from src.repositories.query.overview.DeviceCatalogQueryRepository import (
    DeviceCatalogBadgeRow,
    DeviceCatalogQueryRepository,
)
from src.shared.errors.AppError import AppError
from src.shared.errors.ErrorCode import ErrorCode
from src.shared.kernel.RepoContext import RepoContext
from src.shared.kernel.UnitOfWork import UnitOfWork


@dataclass(frozen=True)
class DeviceMappingSaveView:
    saved: bool
    device_id: str
    room_id: str | None
    device_type: str | None
    is_primary_device: bool
    default_control_target: str | None
    updated_at: str


def _as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _badge_view(badge: DeviceCatalogBadgeRow) -> dict[str, str]:
    return {
        "code": badge.code,
        "level": badge.level,
        "text": badge.text,
    }


class DeviceCatalogService:
    def __init__(
        self,
        device_catalog_query_repository: DeviceCatalogQueryRepository,
        device_catalog_command_repository: DeviceCatalogCommandRepository,
        unit_of_work: UnitOfWork,
        device_repository: DeviceRepository,
        management_pin_guard: ManagementPinGuard,
    ) -> None:
        self._device_catalog_query_repository = device_catalog_query_repository
        self._device_catalog_command_repository = device_catalog_command_repository
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
        snapshot = await self._device_catalog_query_repository.list_devices_snapshot(
            home_id=home_id,
            room_id=room_id,
            device_type=device_type,
            status=status,
            keyword=keyword,
        )
        favorite_map = {
            row.device_id: {
                "selected": row.selected,
                "favorite_order": row.favorite_order,
            }
            for row in snapshot.favorites
        }
        media_device_id = snapshot.media_device_id
        items: list[dict[str, Any]] = []
        for row in snapshot.devices:
            favorite_entry = favorite_map.get(row.device_id)
            is_favorite = bool(favorite_entry["selected"]) if favorite_entry is not None else False
            favorite_order = favorite_entry["favorite_order"] if favorite_entry is not None else None
            is_favorite_candidate = not row.is_readonly_device and row.device_id != media_device_id
            favorite_exclude_reason = None
            if row.is_readonly_device:
                favorite_exclude_reason = "READONLY_DEVICE"
            elif row.device_id == media_device_id:
                favorite_exclude_reason = "DEFAULT_MEDIA_DEVICE"

            item = {
                "device_id": row.device_id,
                "display_name": row.display_name,
                "raw_name": row.raw_name,
                "device_type": row.device_type,
                "room_id": row.room_id,
                "room_name": row.room_name,
                "status": row.status,
                "is_offline": row.is_offline,
                "is_complex_device": row.is_complex_device,
                "is_readonly_device": row.is_readonly_device,
                "confirmation_type": row.confirmation_type,
                "entry_behavior": row.entry_behavior,
                "default_control_target": row.default_control_target,
                "is_homepage_visible": row.is_homepage_visible,
                "is_primary_device": row.is_primary_device,
                "is_favorite": is_favorite,
                "favorite_order": favorite_order,
                "is_favorite_candidate": is_favorite_candidate,
                "favorite_exclude_reason": favorite_exclude_reason,
                "capabilities": _as_dict(row.capabilities_json),
                "alert_badges": [
                    _badge_view(badge) for badge in snapshot.badge_map.get(row.device_id, [])
                ],
                "status_summary": _as_dict(row.status_summary_json),
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
            ctx = RepoContext(tx=tx)
            device = await self._device_repository.find_by_id(
                home_id,
                device_id,
                ctx=ctx,
            )
            if device is None:
                raise AppError(ErrorCode.DEVICE_NOT_FOUND, "device not found")

            if "room_id" in provided_fields and room_id is not None:
                room_exists = await self._device_catalog_command_repository.room_exists(
                    home_id=home_id,
                    room_id=room_id,
                    ctx=ctx,
                )
                if not room_exists:
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
                ctx=ctx,
            )
            row = await self._device_catalog_command_repository.get_mapping_saved_row(
                home_id=home_id,
                device_id=device_id,
                ctx=ctx,
            )
            return asdict(
                DeviceMappingSaveView(
                    saved=True,
                    device_id=row.device_id,
                    room_id=row.room_id,
                    device_type=row.device_type,
                    is_primary_device=row.is_primary_device,
                    default_control_target=row.default_control_target,
                    updated_at=row.updated_at,
                )
            )

        return await self._unit_of_work.run_in_transaction(_transaction)

    async def list_rooms(self, home_id: str, include_counts: bool = True) -> list[dict[str, Any]]:
        rows = await self._device_catalog_query_repository.list_rooms(
            home_id=home_id,
            include_counts=include_counts,
        )
        return [
            {
                "room_id": row.room_id,
                "room_name": row.room_name,
                "priority": row.priority,
                "device_count": row.device_count,
                "homepage_device_count": row.homepage_device_count,
                "visible_in_editor": row.visible_in_editor,
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
        snapshot = await self._device_catalog_query_repository.get_device_detail_snapshot(
            home_id=home_id,
            device_id=device_id,
            include_editor_fields=include_editor_fields,
        )
        row = snapshot.device
        if row is None:
            raise AppError(ErrorCode.DEVICE_NOT_FOUND, "device not found")

        editor_config = None
        if snapshot.editor_hotspots is not None:
            editor_config = {
                "hotspots": [
                    {
                        "hotspot_id": hotspot.hotspot_id,
                        "x": hotspot.x,
                        "y": hotspot.y,
                        "icon_type": hotspot.icon_type,
                        "icon_asset_id": hotspot.icon_asset_id,
                        "icon_asset_url": (
                            f"/api/v1/page-assets/hotspot-icons/{hotspot.icon_asset_id}/file"
                            if hotspot.icon_asset_id is not None
                            else None
                        ),
                        "label_mode": hotspot.label_mode,
                        "is_visible": hotspot.is_visible,
                        "structure_order": hotspot.structure_order,
                    }
                    for hotspot in snapshot.editor_hotspots
                ]
            }

        alert_badges = [_badge_view(badge) for badge in snapshot.badges]
        runtime_state = None
        if include_runtime_fields:
            runtime_payload = _as_dict(row.runtime_state_json)
            runtime_state = {
                "last_state_update_at": row.last_state_update_at,
                "aggregated_state": row.aggregated_state or runtime_payload.get("state"),
                "aggregated_mode": row.aggregated_mode,
                "aggregated_position": row.aggregated_position,
                "telemetry": _as_dict(runtime_payload.get("attributes")),
                "alerts": alert_badges,
            }

        source_info = _as_dict(row.source_meta_json)
        source_info["entity_links"] = [
            {
                "ha_entity_row_id": entity.ha_entity_row_id,
                "entity_id": entity.entity_id,
                "platform": entity.platform,
                "domain": entity.domain,
                "raw_name": entity.raw_name,
                "state": entity.state,
                "room_hint": entity.room_hint,
                "is_available": entity.is_available,
                "last_synced_at": entity.last_synced_at,
                "last_state_changed_at": entity.last_state_changed_at,
                "entity_role": entity.entity_role,
                "is_primary": entity.is_primary,
                "sort_order": entity.sort_order,
            }
            for entity in snapshot.entity_links
        ]

        return {
            "device_id": row.device_id,
            "display_name": row.display_name,
            "raw_name": row.raw_name,
            "device_type": row.device_type,
            "room_id": row.room_id,
            "room_name": row.room_name,
            "status": row.status,
            "is_offline": row.is_offline,
            "is_complex_device": row.is_complex_device,
            "is_readonly_device": row.is_readonly_device,
            "confirmation_type": row.confirmation_type,
            "entry_behavior": row.entry_behavior,
            "default_control_target": row.default_control_target,
            "capabilities": _as_dict(row.capabilities_json),
            "alert_badges": alert_badges,
            "status_summary": _as_dict(row.status_summary_json),
            "runtime_state": runtime_state,
            "control_schema": []
            if row.is_readonly_device
            else [
                {
                    "action_type": schema.action_type,
                    "target_scope": schema.target_scope,
                    "target_key": schema.target_key,
                    "value_type": schema.value_type,
                    "value_range": _as_dict(schema.value_range_json)
                    if schema.value_range_json is not None
                    else None,
                    "allowed_values": _as_list(schema.allowed_values_json)
                    if schema.allowed_values_json is not None
                    else None,
                    "unit": schema.unit,
                    "is_quick_action": schema.is_quick_action,
                    "requires_detail_entry": schema.requires_detail_entry,
                }
                for schema in snapshot.control_schema
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
        snapshot = await self._device_catalog_query_repository.get_panel_snapshot(
            home_id=home_id,
            room_id=room_id,
        )
        favorites_map = {
            row.device_id: {
                "selected": row.selected,
                "favorite_order": row.favorite_order,
            }
            for row in snapshot.favorites
        }
        media_device_id = snapshot.media_device_id
        items: list[dict[str, Any]] = []
        for row in snapshot.devices:
            runtime_state = _as_dict(row.runtime_state_json)
            badges = [_badge_view(badge) for badge in snapshot.badge_map.get(row.device_id, [])]
            favorite_entry = favorites_map.get(row.device_id)
            favorite_selected = bool(favorite_entry["selected"]) if favorite_entry is not None else False
            favorite_order = favorite_entry["favorite_order"] if favorite_entry is not None else None
            battery_level = runtime_state.get("attributes", {}).get("battery")
            if battery_level is None:
                battery_level = runtime_state.get("attributes", {}).get("battery_level")
            is_selectable = not row.is_readonly_device and row.device_id != media_device_id
            exclude_reason = None
            if row.is_readonly_device:
                exclude_reason = "READONLY_DEVICE"
            elif row.device_id == media_device_id:
                exclude_reason = "DEFAULT_MEDIA_DEVICE"
            item = {
                "device_id": row.device_id,
                "display_name": row.display_name,
                "device_type": row.device_type,
                "room_id": row.room_id,
                "room_name": row.room_name,
                "status": row.status,
                "is_offline": row.is_offline,
                "is_complex_device": row.is_complex_device,
                "is_readonly_device": row.is_readonly_device,
                "entry_behavior": row.entry_behavior,
                "confirmation_type": row.confirmation_type,
                "alert_badges": badges,
                "favorite_order": favorite_order,
                "is_selectable": is_selectable,
                "exclude_reason": exclude_reason,
                "_favorite_selected": favorite_selected,
                "_battery_level": battery_level,
                "_badge_codes": {badge["code"] for badge in badges},
                "_default_control_target": row.default_control_target,
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
                        and float(item["_battery_level"]) <= snapshot.low_battery_threshold
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
