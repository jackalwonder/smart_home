from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from src.repositories.query.settings.FavoritesQueryRepository import (
    FavoritesQueryRepository,
)


@dataclass(frozen=True)
class FavoritesQueryInput:
    home_id: str


class FavoritesQueryService:
    def __init__(self, favorites_query_repository: FavoritesQueryRepository) -> None:
        self._favorites_query_repository = favorites_query_repository

    async def get_favorites(self, input: FavoritesQueryInput) -> dict[str, Any]:
        snapshot = await self._favorites_query_repository.get_snapshot(input.home_id)
        favorite_map = {
            row.device_id: {
                "selected": row.selected,
                "favorite_order": row.favorite_order,
            }
            for row in snapshot.favorites
        }
        max_allowed = (
            snapshot.function_settings.favorite_limit
            if snapshot.function_settings is not None
            else 8
        )
        items: list[dict[str, Any]] = []
        selected_count = 0

        for row in snapshot.devices:
            favorite_entry = favorite_map.get(row.device_id)
            selected = bool(favorite_entry["selected"]) if favorite_entry is not None else False
            favorite_order = favorite_entry["favorite_order"] if favorite_entry is not None else None
            is_selectable = (
                not row.is_readonly_device and row.device_id != snapshot.media_device_id
            )
            exclude_reason = None
            if row.is_readonly_device:
                exclude_reason = "READONLY_DEVICE"
            elif row.device_id == snapshot.media_device_id:
                exclude_reason = "DEFAULT_MEDIA_DEVICE"

            if selected:
                selected_count += 1

            items.append(
                {
                    "device_id": row.device_id,
                    "display_name": row.display_name,
                    "device_type": row.device_type,
                    "room_id": row.room_id,
                    "room_name": row.room_name,
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
            "settings_version": snapshot.settings.settings_version
            if snapshot.settings is not None
            else None,
        }
