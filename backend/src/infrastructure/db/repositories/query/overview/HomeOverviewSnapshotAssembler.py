from __future__ import annotations

from decimal import Decimal
from typing import Any

from src.infrastructure.db.repositories._support import as_dict
from src.repositories.query.overview.types import (
    EnergySummaryReadModel,
    HomeOverviewReadModel,
    SystemConnectionSummaryReadModel,
)
from src.repositories.read_models.index import (
    CurrentLayoutVersion,
    DefaultMediaReadModel,
    DeviceCardReadModel,
    FavoriteDeviceCardReadModel,
    FavoriteDeviceReadModel,
    FunctionSettingsReadModel,
    PageSettingsReadModel,
)


def _to_float(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return float(value)
    return float(value)


def build_badge_map(rows: list[Any]) -> dict[str, list[dict[str, Any]]]:
    badge_map: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        badge_map.setdefault(row["device_id"], []).append(
            {
                "code": row["code"],
                "level": row["level"],
                "text": row["text"],
            }
        )
    return badge_map


def assemble_home_overview(
    *,
    layout_row: Any,
    settings_row: Any | None,
    hotspot_rows: list[Any],
    device_rows: list[Any],
    favorite_rows: list[Any],
    favorite_device_rows: list[Any],
    favorite_order_map: dict[str, int | None],
    badge_map: dict[str, list[dict[str, Any]]],
    page_settings_row: Any | None,
    function_settings_row: Any | None,
    energy_row: Any | None,
    media_row: Any | None,
    system_connection_row: Any | None,
) -> HomeOverviewReadModel:
    return HomeOverviewReadModel(
        layout=CurrentLayoutVersion(
            id=layout_row["id"],
            home_id=layout_row["home_id"],
            layout_version=layout_row["layout_version"],
            background_asset_id=layout_row["background_asset_id"],
            effective_at=layout_row["effective_at"],
            background_image_url=layout_row["background_image_url"],
            background_image_width=layout_row["background_image_width"],
            background_image_height=layout_row["background_image_height"],
        ),
        settings_version=settings_row["settings_version"] if settings_row is not None else None,
        hotspots=[
            {
                "hotspot_id": row["hotspot_id"],
                "device_id": row["device_id"],
                "display_name": row["display_name"],
                "device_type": row["device_type"],
                "x": row["x"],
                "y": row["y"],
                "icon_type": row["icon_type"],
                "icon_asset_id": row["icon_asset_id"],
                "icon_asset_url": (
                    f"/api/v1/page-assets/hotspot-icons/{row['icon_asset_id']}/file"
                    if row["icon_asset_id"] is not None
                    else None
                ),
                "label_mode": row["label_mode"],
                "status": row["status"],
                "is_offline": row["is_offline"],
                "is_complex_device": row["is_complex_device"],
                "is_readonly_device": row["is_readonly_device"],
                "entry_behavior": row["entry_behavior"],
                "alert_badges": badge_map.get(row["device_id"], []),
                "status_summary": as_dict(row["status_summary_json"]),
                "default_control_target": row["default_control_target"],
                "display_policy": row["display_policy"],
            }
            for row in hotspot_rows
        ],
        devices=[
            DeviceCardReadModel(
                device_id=row["device_id"],
                room_id=row["room_id"],
                room_name=row["room_name"],
                display_name=row["display_name"],
                raw_name=row["raw_name"],
                device_type=row["device_type"],
                status=row["status"],
                is_offline=row["is_offline"],
                is_complex_device=row["is_complex_device"],
                is_readonly_device=row["is_readonly_device"],
                confirmation_type=row["confirmation_type"],
                entry_behavior=row["entry_behavior"],
                default_control_target=row["default_control_target"],
                is_homepage_visible=row["is_homepage_visible"],
                is_primary_device=row["is_primary_device"],
                capabilities=as_dict(row["capabilities_json"]),
                status_summary=as_dict(row["status_summary_json"]),
                alert_badges=badge_map.get(row["device_id"], []),
            )
            for row in device_rows
        ],
        favorites=[
            FavoriteDeviceReadModel(
                device_id=row["device_id"],
                selected=row["selected"],
                favorite_order=row["favorite_order"],
            )
            for row in favorite_rows
        ],
        favorite_devices=sorted(
            [
                FavoriteDeviceCardReadModel(
                    device_id=row["device_id"],
                    room_id=row["room_id"],
                    room_name=row["room_name"],
                    display_name=row["display_name"],
                    raw_name=row["raw_name"],
                    device_type=row["device_type"],
                    status=row["status"],
                    is_offline=row["is_offline"],
                    is_complex_device=row["is_complex_device"],
                    is_readonly_device=row["is_readonly_device"],
                    confirmation_type=row["confirmation_type"],
                    entry_behavior=row["entry_behavior"],
                    default_control_target=row["default_control_target"],
                    is_homepage_visible=row["is_homepage_visible"],
                    is_primary_device=row["is_primary_device"],
                    capabilities=as_dict(row["capabilities_json"]),
                    status_summary=as_dict(row["status_summary_json"]),
                    alert_badges=badge_map.get(row["device_id"], []),
                    favorite_order=favorite_order_map.get(row["device_id"]),
                )
                for row in favorite_device_rows
            ],
            key=lambda item: (
                item.favorite_order if item.favorite_order is not None else 1_000_000,
                item.display_name,
                item.device_id,
            ),
        ),
        page_settings=PageSettingsReadModel(
            room_label_mode=page_settings_row["room_label_mode"]
            if page_settings_row is not None
            else "ROOM_NAME",
            homepage_display_policy=as_dict(page_settings_row["homepage_display_policy_json"])
            if page_settings_row is not None
            else {},
            icon_policy=as_dict(page_settings_row["icon_policy_json"])
            if page_settings_row is not None
            else {},
            layout_preference=as_dict(page_settings_row["layout_preference_json"])
            if page_settings_row is not None
            else {},
        ),
        function_settings=FunctionSettingsReadModel(
            music_enabled=function_settings_row["music_enabled"]
            if function_settings_row is not None
            else False,
            low_battery_threshold=function_settings_row["low_battery_threshold"]
            if function_settings_row is not None
            else 20,
            offline_threshold_seconds=function_settings_row["offline_threshold_seconds"]
            if function_settings_row is not None
            else 300,
            favorite_limit=function_settings_row["favorite_limit"]
            if function_settings_row is not None
            else 8,
            quick_entry_policy=as_dict(function_settings_row["quick_entry_policy_json"])
            if function_settings_row is not None
            else {},
            auto_home_timeout_seconds=function_settings_row["auto_home_timeout_seconds"]
            if function_settings_row is not None
            else 30,
            position_device_thresholds=as_dict(
                function_settings_row["position_device_thresholds_json"]
            )
            if function_settings_row is not None
            else {},
        ),
        energy=EnergySummaryReadModel(
            binding_status=energy_row["binding_status"],
            refresh_status=energy_row["refresh_status"],
            yesterday_usage=_to_float(energy_row["yesterday_usage"]),
            monthly_usage=_to_float(energy_row["monthly_usage"]),
            yearly_usage=_to_float(energy_row["yearly_usage"]),
            balance=_to_float(energy_row["balance"]),
            updated_at=energy_row["updated_at"],
            source_updated_at=energy_row["source_updated_at"],
        )
        if energy_row is not None
        else None,
        media=DefaultMediaReadModel(
            binding_status=media_row["binding_status"]
            if media_row is not None
            else "MEDIA_UNSET",
            availability_status=(
                "OFFLINE"
                if media_row is not None
                and media_row["device_id"] is not None
                and media_row["is_offline"]
                else "ONLINE"
                if media_row is not None and media_row["device_id"] is not None
                else None
            ),
            device_id=media_row["device_id"] if media_row is not None else None,
            display_name=media_row["display_name"] if media_row is not None else None,
            play_state=(
                as_dict(media_row["runtime_state_json"]).get("state")
                if media_row is not None and media_row["runtime_state_json"] is not None
                else None
            ),
            track_title=(
                as_dict(media_row["runtime_state_json"]).get("attributes", {}).get("media_title")
                if media_row is not None and media_row["runtime_state_json"] is not None
                else None
            ),
            artist=(
                as_dict(media_row["runtime_state_json"]).get("attributes", {}).get("media_artist")
                if media_row is not None and media_row["runtime_state_json"] is not None
                else None
            ),
            entry_behavior=media_row["entry_behavior"] if media_row is not None else None,
        ),
        system_connection=SystemConnectionSummaryReadModel(
            system_type=system_connection_row["system_type"],
            connection_status=system_connection_row["connection_status"],
            auth_configured=system_connection_row["auth_configured"],
            last_test_at=system_connection_row["last_test_at"],
            last_sync_at=system_connection_row["last_sync_at"],
        )
        if system_connection_row is not None
        else None,
    )
