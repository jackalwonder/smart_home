from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from src.shared.kernel.RepoContext import RepoContext


@dataclass(frozen=True)
class FavoriteDeviceSnapshotRow:
    home_id: str
    settings_version_id: str
    device_id: str
    selected: bool
    favorite_order: int | None


class FavoriteDevicesRepository(Protocol):
    async def replace_for_settings_version(
        self,
        settings_version_id: str,
        favorites: list[FavoriteDeviceSnapshotRow],
        ctx: RepoContext | None = None,
    ) -> None: ...
