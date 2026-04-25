from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol


@dataclass(frozen=True)
class FavoriteSettingsRow:
    id: str
    settings_version: str


@dataclass(frozen=True)
class FavoriteFunctionSettingsRow:
    favorite_limit: int


@dataclass(frozen=True)
class FavoriteSelectionRow:
    device_id: str
    selected: bool
    favorite_order: int | None


@dataclass(frozen=True)
class FavoriteDeviceRow:
    device_id: str
    display_name: str
    device_type: str
    room_id: str | None
    room_name: str | None
    is_readonly_device: bool


@dataclass(frozen=True)
class FavoritesQuerySnapshot:
    settings: FavoriteSettingsRow | None
    function_settings: FavoriteFunctionSettingsRow | None = None
    favorites: list[FavoriteSelectionRow] = field(default_factory=list)
    media_device_id: str | None = None
    devices: list[FavoriteDeviceRow] = field(default_factory=list)


class FavoritesQueryRepository(Protocol):
    async def get_snapshot(self, home_id: str) -> FavoritesQuerySnapshot: ...
