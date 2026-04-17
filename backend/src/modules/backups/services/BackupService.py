from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from sqlalchemy import text

from src.infrastructure.db.connection.Database import Database
from src.infrastructure.db.repositories._support import as_dict, session_scope
from src.modules.auth.services.guard.ManagementPinGuard import ManagementPinGuard
from src.shared.kernel.Clock import Clock


@dataclass(frozen=True)
class BackupCreateView:
    backup_id: str
    created_at: str
    status: str


class BackupService:
    def __init__(
        self,
        database: Database,
        management_pin_guard: ManagementPinGuard,
        clock: Clock,
    ) -> None:
        self._database = database
        self._management_pin_guard = management_pin_guard
        self._clock = clock

    async def _build_snapshot(self, home_id: str) -> dict[str, Any]:
        async with session_scope(self._database) as (session, _):
            settings_row = (
                await session.execute(
                    text(
                        """
                        SELECT id::text AS id, settings_version
                        FROM v_current_settings_versions
                        WHERE home_id = :home_id
                        """
                    ),
                    {"home_id": home_id},
                )
            ).mappings().one_or_none()
            page_settings = None
            function_settings = None
            favorites: list[dict[str, Any]] = []
            if settings_row is not None:
                page_settings = (
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
                function_settings = (
                    await session.execute(
                        text(
                            """
                            SELECT
                                low_battery_threshold,
                                offline_threshold_seconds,
                                quick_entry_policy_json,
                                music_enabled,
                                favorite_limit,
                                auto_home_timeout_seconds,
                                position_device_thresholds_json
                            FROM function_settings
                            WHERE settings_version_id = :settings_version_id
                            """
                        ),
                        {"settings_version_id": settings_row["id"]},
                    )
                ).mappings().one_or_none()
                favorites = [
                    dict(row)
                    for row in (
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
                ]

            layout_row = (
                await session.execute(
                    text(
                        """
                        SELECT
                            id::text AS id,
                            layout_version,
                            background_asset_id::text AS background_asset_id,
                            layout_meta_json
                        FROM v_current_layout_versions
                        WHERE home_id = :home_id
                        """
                    ),
                    {"home_id": home_id},
                )
            ).mappings().one_or_none()
            hotspots: list[dict[str, Any]] = []
            if layout_row is not None:
                hotspots = [
                    {
                        "hotspot_id": row["hotspot_id"],
                        "device_id": row["device_id"],
                        "x": float(row["x"]),
                        "y": float(row["y"]),
                        "icon_type": row["icon_type"],
                        "label_mode": row["label_mode"],
                        "is_visible": row["is_visible"],
                        "structure_order": row["structure_order"],
                        "display_policy": row["display_policy"],
                    }
                    for row in (
                        await session.execute(
                            text(
                                """
                                SELECT
                                    hotspot_id,
                                    device_id::text AS device_id,
                                    x,
                                    y,
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
                ]

        return {
            "settings": {
                "settings_version": settings_row["settings_version"] if settings_row is not None else None,
                "page_settings": {
                    "room_label_mode": page_settings["room_label_mode"],
                    "homepage_display_policy": as_dict(page_settings["homepage_display_policy_json"]),
                    "icon_policy": as_dict(page_settings["icon_policy_json"]),
                    "layout_preference": as_dict(page_settings["layout_preference_json"]),
                }
                if page_settings is not None
                else None,
                "function_settings": {
                    "low_battery_threshold": float(function_settings["low_battery_threshold"]),
                    "offline_threshold_seconds": int(function_settings["offline_threshold_seconds"]),
                    "quick_entry_policy": as_dict(function_settings["quick_entry_policy_json"]),
                    "music_enabled": bool(function_settings["music_enabled"]),
                    "favorite_limit": int(function_settings["favorite_limit"]),
                    "auto_home_timeout_seconds": int(function_settings["auto_home_timeout_seconds"]),
                    "position_device_thresholds": as_dict(
                        function_settings["position_device_thresholds_json"]
                    ),
                }
                if function_settings is not None
                else None,
                "favorites": favorites,
            },
            "layout": {
                "layout_version": layout_row["layout_version"] if layout_row is not None else None,
                "background_asset_id": layout_row["background_asset_id"] if layout_row is not None else None,
                "layout_meta": as_dict(layout_row["layout_meta_json"]) if layout_row is not None else {},
                "hotspots": hotspots,
            },
        }

    async def create_backup(
        self,
        *,
        home_id: str,
        terminal_id: str,
        operator_id: str | None,
        note: str | None,
    ) -> BackupCreateView:
        await self._management_pin_guard.require_active_session(home_id, terminal_id)
        snapshot = await self._build_snapshot(home_id)
        backup_id = f"bk_{self._clock.now().strftime('%Y%m%d%H%M%S%f')}"
        now_iso = self._clock.now().isoformat()
        snapshot_blob = json.dumps(snapshot, sort_keys=True, ensure_ascii=True).encode("utf-8")
        stmt = text(
            """
            INSERT INTO system_backups (
                home_id,
                backup_id,
                status,
                note,
                snapshot_blob,
                created_by_member_id,
                created_by_terminal_id,
                created_at
            ) VALUES (
                :home_id,
                :backup_id,
                :status,
                :note,
                :snapshot_blob,
                :created_by_member_id,
                :created_by_terminal_id,
                :created_at
            )
            """
        )
        async with session_scope(self._database) as (session, owned):
            await session.execute(
                stmt,
                {
                    "home_id": home_id,
                    "backup_id": backup_id,
                    "status": "READY",
                    "note": note,
                    "snapshot_blob": snapshot_blob,
                    "created_by_member_id": operator_id,
                    "created_by_terminal_id": terminal_id,
                    "created_at": now_iso,
                },
            )
            if owned:
                await session.commit()
        return BackupCreateView(backup_id=backup_id, created_at=now_iso, status="READY")

    async def list_backups(
        self,
        *,
        home_id: str,
        terminal_id: str,
    ) -> dict[str, Any]:
        await self._management_pin_guard.require_active_session(home_id, terminal_id)
        stmt = text(
            """
            SELECT
                sb.backup_id,
                sb.created_at::text AS created_at,
                sb.restored_at::text AS restored_at,
                sb.status,
                sb.note,
                m.display_name AS created_by
            FROM system_backups sb
            LEFT JOIN members m
              ON m.id = sb.created_by_member_id
            WHERE sb.home_id = :home_id
            ORDER BY sb.created_at DESC
            """
        )
        async with session_scope(self._database) as (session, _):
            rows = (await session.execute(stmt, {"home_id": home_id})).mappings().all()
        return {
            "items": [
                {
                    "backup_id": row["backup_id"],
                    "created_at": row["created_at"],
                    "restored_at": row["restored_at"],
                    "created_by": row["created_by"],
                    "status": row["status"],
                    "note": row["note"],
                }
                for row in rows
            ]
        }
