from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sqlalchemy import text

from src.infrastructure.db.connection.Database import Database
from src.infrastructure.db.repositories._support import as_dict, session_scope


@dataclass(frozen=True)
class FavoritesQueryInput:
    home_id: str


class FavoritesQueryService:
    def __init__(self, database: Database) -> None:
        self._database = database

    async def get_favorites(self, input: FavoritesQueryInput) -> dict[str, Any]:
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
                    {"home_id": input.home_id},
                )
            ).mappings().one_or_none()

            function_row = None
            favorite_rows: list[dict[str, Any]] = []
            if settings_row is not None:
                function_row = (
                    await session.execute(
                        text(
                            """
                            SELECT favorite_limit
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
                    {"home_id": input.home_id},
                )
            ).mappings().one_or_none()

            device_rows = (
                await session.execute(
                    text(
                        """
                        SELECT
                            d.id::text AS device_id,
                            d.display_name,
                            d.device_type,
                            d.room_id::text AS room_id,
                            r.room_name,
                            d.is_readonly_device
                        FROM devices d
                        LEFT JOIN rooms r
                          ON r.id = d.room_id
                        WHERE d.home_id = :home_id
                        ORDER BY d.display_name ASC, d.id ASC
                        """
                    ),
                    {"home_id": input.home_id},
                )
            ).mappings().all()

        favorite_map = {
            row["device_id"]: {
                "selected": row["selected"],
                "favorite_order": row["favorite_order"],
            }
            for row in favorite_rows
        }
        media_device_id = media_row["device_id"] if media_row is not None else None
        max_allowed = int(function_row["favorite_limit"]) if function_row is not None else 8
        items: list[dict[str, Any]] = []
        selected_count = 0

        for row in device_rows:
            favorite_entry = favorite_map.get(row["device_id"])
            selected = bool(favorite_entry["selected"]) if favorite_entry is not None else False
            favorite_order = favorite_entry["favorite_order"] if favorite_entry is not None else None
            is_selectable = not row["is_readonly_device"] and row["device_id"] != media_device_id
            exclude_reason = None
            if row["is_readonly_device"]:
                exclude_reason = "READONLY_DEVICE"
            elif row["device_id"] == media_device_id:
                exclude_reason = "DEFAULT_MEDIA_DEVICE"

            if selected:
                selected_count += 1

            items.append(
                {
                    "device_id": row["device_id"],
                    "display_name": row["display_name"],
                    "device_type": row["device_type"],
                    "room_id": row["room_id"],
                    "room_name": row["room_name"],
                    "selected": selected,
                    "favorite_order": favorite_order,
                    "is_selectable": is_selectable,
                    "exclude_reason": exclude_reason,
                }
            )

        items.sort(
            key=lambda item: (
                not item["selected"],
                item["favorite_order"] if item["favorite_order"] is not None else 1_000_000,
                item["display_name"],
                item["device_id"],
            )
        )

        return {
            "items": items,
            "selected_count": selected_count,
            "max_recommended": max_allowed,
            "max_allowed": max_allowed,
            "settings_version": settings_row["settings_version"] if settings_row is not None else None,
        }
