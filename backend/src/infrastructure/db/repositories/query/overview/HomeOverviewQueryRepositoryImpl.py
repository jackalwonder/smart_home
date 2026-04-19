from __future__ import annotations

from decimal import Decimal

from sqlalchemy import bindparam, text

from src.infrastructure.db.connection.Database import Database
from src.infrastructure.db.repositories._support import as_dict, session_scope
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
from src.shared.kernel.RepoContext import RepoContext


def _to_float(value) -> float | None:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return float(value)
    return float(value)


class HomeOverviewQueryRepositoryImpl:
    def __init__(self, database: Database) -> None:
        self._database = database

    async def get_overview_context(
        self,
        home_id: str,
        ctx: RepoContext | None = None,
    ) -> HomeOverviewReadModel:
        async with session_scope(self._database, ctx) as (session, _):
            layout_row = (
                await session.execute(
                    text(
                        """
                        SELECT
                            vclv.id::text AS id,
                            vclv.home_id::text AS home_id,
                            vclv.layout_version,
                            vclv.background_asset_id::text AS background_asset_id,
                            vclv.effective_at::text AS effective_at,
                            pa.file_url AS background_image_url,
                            pa.width AS background_image_width,
                            pa.height AS background_image_height
                        FROM v_current_layout_versions vclv
                        LEFT JOIN page_assets pa
                          ON pa.id = vclv.background_asset_id
                        WHERE vclv.home_id = :home_id
                        """
                    ),
                    {"home_id": home_id},
                )
            ).mappings().one()

            hotspot_rows = (
                await session.execute(
                    text(
                        """
                        SELECT
                            layout_hotspots.hotspot_id,
                            layout_hotspots.device_id::text AS device_id,
                            COALESCE(
                                lv.layout_meta_json -> 'hotspot_labels' ->> layout_hotspots.hotspot_id,
                                d.display_name
                            ) AS display_name,
                            d.device_type,
                            layout_hotspots.x::float8 AS x,
                            layout_hotspots.y::float8 AS y,
                            layout_hotspots.icon_type,
                            layout_hotspots.label_mode,
                            COALESCE(drs.status, 'UNKNOWN') AS status,
                            COALESCE(drs.is_offline, true) AS is_offline,
                            d.is_complex_device,
                            d.is_readonly_device,
                            d.entry_behavior::text AS entry_behavior,
                            d.default_control_target,
                            COALESCE(drs.status_summary_json, '{}'::jsonb) AS status_summary_json,
                            layout_hotspots.display_policy::text AS display_policy
                        FROM layout_hotspots
                        JOIN layout_versions lv
                          ON lv.id = layout_hotspots.layout_version_id
                        JOIN devices d
                          ON d.id = layout_hotspots.device_id
                        LEFT JOIN device_runtime_states drs
                          ON drs.device_id = d.id
                        WHERE layout_hotspots.layout_version_id = :layout_version_id
                          AND layout_hotspots.is_visible = true
                        ORDER BY layout_hotspots.structure_order ASC, layout_hotspots.created_at ASC
                        """
                    ),
                    {"layout_version_id": layout_row["id"]},
                )
            ).mappings().all()

            device_rows = (
                await session.execute(
                    text(
                        """
                        SELECT
                            d.id::text AS device_id,
                            d.room_id::text AS room_id,
                            r.room_name,
                            d.display_name,
                            d.raw_name,
                            d.device_type,
                            COALESCE(drs.status, 'UNKNOWN') AS status,
                            COALESCE(drs.is_offline, true) AS is_offline,
                            d.is_complex_device,
                            d.is_readonly_device,
                            d.confirmation_type::text AS confirmation_type,
                            d.entry_behavior::text AS entry_behavior,
                            d.default_control_target,
                            d.is_homepage_visible,
                            d.is_primary_device,
                            COALESCE(d.capabilities_json, '{}'::jsonb) AS capabilities_json,
                            COALESCE(drs.status_summary_json, '{}'::jsonb) AS status_summary_json
                        FROM devices d
                        LEFT JOIN rooms r
                          ON r.id = d.room_id
                        LEFT JOIN device_runtime_states drs
                          ON drs.device_id = d.id
                        WHERE d.home_id = :home_id
                          AND d.is_homepage_visible = true
                        ORDER BY d.display_name ASC, d.id ASC
                        """
                    ),
                    {"home_id": home_id},
                )
            ).mappings().all()
            device_ids = [row["device_id"] for row in device_rows]

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

            page_settings_row = None
            function_settings_row = None
            favorite_rows = []
            if settings_row is not None:
                page_settings_row = (
                    await session.execute(
                        text(
                            """
                            SELECT
                                room_label_mode,
                                homepage_display_policy_json,
                                icon_policy_json,
                                layout_preference_json
                            FROM page_settings
                            WHERE settings_version_id = :settings_version_id
                            """
                        ),
                        {"settings_version_id": settings_row["id"]},
                    )
                ).mappings().one_or_none()
                function_settings_row = (
                    await session.execute(
                        text(
                            """
                            SELECT
                                music_enabled,
                                low_battery_threshold::float8 AS low_battery_threshold,
                                offline_threshold_seconds,
                                favorite_limit,
                                quick_entry_policy_json,
                                auto_home_timeout_seconds,
                                position_device_thresholds_json
                            FROM function_settings
                            WHERE settings_version_id = :settings_version_id
                            """
                        ),
                        {"settings_version_id": settings_row["id"]},
                    )
                ).mappings().one_or_none()
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
                            ORDER BY favorite_order ASC NULLS LAST, created_at ASC
                            """
                        ),
                        {"settings_version_id": settings_row["id"]},
                    )
                ).mappings().all()

            selected_favorite_rows = [row for row in favorite_rows if row["selected"]]
            favorite_order_map = {
                row["device_id"]: row["favorite_order"] for row in selected_favorite_rows
            }
            favorite_device_rows = []
            if favorite_order_map:
                favorite_device_rows = (
                    await session.execute(
                        text(
                            """
                            SELECT
                                d.id::text AS device_id,
                                d.room_id::text AS room_id,
                                r.room_name,
                                d.display_name,
                                d.raw_name,
                                d.device_type,
                                COALESCE(drs.status, 'UNKNOWN') AS status,
                                COALESCE(drs.is_offline, true) AS is_offline,
                                d.is_complex_device,
                                d.is_readonly_device,
                                d.confirmation_type::text AS confirmation_type,
                                d.entry_behavior::text AS entry_behavior,
                                d.default_control_target,
                                d.is_homepage_visible,
                                d.is_primary_device,
                                COALESCE(d.capabilities_json, '{}'::jsonb) AS capabilities_json,
                                COALESCE(drs.status_summary_json, '{}'::jsonb) AS status_summary_json
                            FROM devices d
                            LEFT JOIN rooms r
                              ON r.id = d.room_id
                            LEFT JOIN device_runtime_states drs
                              ON drs.device_id = d.id
                            WHERE d.home_id = :home_id
                              AND d.id::text IN :favorite_device_ids
                            """
                        ).bindparams(bindparam("favorite_device_ids", expanding=True)),
                        {
                            "home_id": home_id,
                            "favorite_device_ids": list(favorite_order_map.keys()),
                        },
                    )
                ).mappings().all()

            badge_map: dict[str, list[dict]] = {}
            badge_device_ids = sorted(
                set(device_ids)
                | {row["device_id"] for row in favorite_device_rows}
            )
            if badge_device_ids:
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
                        {"device_ids": badge_device_ids},
                    )
                ).mappings().all()
                for row in badge_rows:
                    badge_map.setdefault(row["device_id"], []).append(
                        {
                            "code": row["code"],
                            "level": row["level"],
                            "text": row["text"],
                        }
                    )

            energy_row = (
                await session.execute(
                    text(
                        """
                        SELECT
                            binding_status::text AS binding_status,
                            refresh_status::text AS refresh_status,
                            yesterday_usage,
                            monthly_usage,
                            yearly_usage,
                            balance
                        FROM energy_snapshots
                        WHERE home_id = :home_id
                        ORDER BY created_at DESC
                        LIMIT 1
                        """
                    ),
                    {"home_id": home_id},
                )
            ).mappings().one_or_none()

            media_row = (
                await session.execute(
                    text(
                        """
                        SELECT
                            mb.binding_status::text AS binding_status,
                            mb.device_id::text AS device_id,
                            d.display_name,
                            d.entry_behavior::text AS entry_behavior,
                            drs.is_offline,
                            drs.runtime_state_json
                        FROM media_bindings mb
                        LEFT JOIN devices d
                          ON d.id = mb.device_id
                        LEFT JOIN device_runtime_states drs
                          ON drs.device_id = mb.device_id
                        WHERE mb.home_id = :home_id
                        """
                    ),
                    {"home_id": home_id},
                )
            ).mappings().one_or_none()

            system_connection_row = (
                await session.execute(
                    text(
                        """
                        SELECT
                            system_type::text AS system_type,
                            connection_status::text AS connection_status,
                            auth_configured,
                            last_test_at::text AS last_test_at,
                            last_sync_at::text AS last_sync_at
                        FROM system_connections
                        WHERE home_id = :home_id
                        ORDER BY updated_at DESC
                        LIMIT 1
                        """
                    ),
                    {"home_id": home_id},
                )
            ).mappings().one_or_none()

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
            )
            if energy_row is not None
            else None,
            media=DefaultMediaReadModel(
                binding_status=media_row["binding_status"]
                if media_row is not None
                else "MEDIA_UNSET",
                availability_status=(
                    "OFFLINE"
                    if media_row is not None and media_row["device_id"] is not None and media_row["is_offline"]
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
