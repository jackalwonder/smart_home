from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from src.repositories.read_models.index import (
    CurrentSettingsVersion,
    FavoriteDeviceReadModel,
    FunctionSettingsReadModel,
    PageSettingsReadModel,
)
from src.shared.kernel.RepoContext import RepoContext


@dataclass(frozen=True)
class SettingsSnapshotReadModel:
    current_settings_version: CurrentSettingsVersion | None
    page_settings: PageSettingsReadModel | None
    function_settings: FunctionSettingsReadModel | None
    favorites: list[FavoriteDeviceReadModel]


class SettingsSnapshotQueryRepository(Protocol):
    async def get_current_settings_snapshot(
        self,
        home_id: str,
        ctx: RepoContext | None = None,
    ) -> SettingsSnapshotReadModel: ...
