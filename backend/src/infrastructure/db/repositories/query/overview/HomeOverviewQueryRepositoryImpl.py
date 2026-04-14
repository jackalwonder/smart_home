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
                            id::text AS id,
                            home_id::text AS home_id,
                            layout_version,
                            background_asset_id::text AS background_asset_id,
                            effective_at::text AS effective_at
                        FROM v_current_layout_versions
                        WHERE home_id = :home_id
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
                            hotspot_id,
                            device_id::text AS device_id,
                            x::float8 AS x,
                            y::float8 AS y,
                            icon_type,
                            label_mode,
                            is_visible,
                            structure_order,
                            display_policy::text AS display_policy
                        FROM layout_hotspots
                        WHERE layout_version_id = :layout_version_id
                        ORDER BY structure_order ASC, created_at ASC
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
                            d.display_name,
                            d.device_type,
                            COALESCE(drs.status, 'UNKNOWN') AS status,
                            COALESCE(drs.is_offline, true) AS is_offline,
                            COALESCE(drs.status_summary_json, '{}'::jsonb) AS status_summary_json
                        FROM devices d
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

            badge_map: dict[str, list[dict]] = {}
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
                for row in badge_rows:
                    badge_map.setdefault(row["device_id"], []).append(
                        {
                            "code": row["code"],
                            "level": row["level"],
                            "text": row["text"],
                        }
                    )

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
                                homepage_display_policy_json
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
                                favorite_limit
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
                            drs.is_offline
                        FROM media_bindings mb
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
            ),
            hotspots=[
                {
                    "hotspot_id": row["hotspot_id"],
                    "device_id": row["device_id"],
                    "x": row["x"],
                    "y": row["y"],
                    "icon_type": row["icon_type"],
                    "label_mode": row["label_mode"],
                    "is_visible": row["is_visible"],
                    "structure_order": row["structure_order"],
                    "display_policy": row["display_policy"],
                }
                for row in hotspot_rows
            ],
            devices=[
                DeviceCardReadModel(
                    device_id=row["device_id"],
                    room_id=row["room_id"],
                    display_name=row["display_name"],
                    device_type=row["device_type"],
                    status=row["status"],
                    is_offline=row["is_offline"],
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
            page_settings=PageSettingsReadModel(
                room_label_mode=page_settings_row["room_label_mode"]
                if page_settings_row is not None
                else "ROOM_NAME",
                homepage_display_policy=as_dict(page_settings_row["homepage_display_policy_json"])
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
