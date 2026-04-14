from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol

from src.shared.kernel.RepoContext import RepoContext


@dataclass(frozen=True)
class PageSettingsSnapshotRow:
    home_id: str
    settings_version_id: str
    room_label_mode: str
    homepage_display_policy_json: dict[str, Any]
    icon_policy_json: dict[str, Any]
    layout_preference_json: dict[str, Any]


class PageSettingsRepository(Protocol):
    async def upsert_for_settings_version(
        self,
        input: PageSettingsSnapshotRow,
        ctx: RepoContext | None = None,
    ) -> None: ...
