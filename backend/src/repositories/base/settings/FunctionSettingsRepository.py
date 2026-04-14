from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol

from src.shared.kernel.RepoContext import RepoContext


@dataclass(frozen=True)
class FunctionSettingsSnapshotRow:
    home_id: str
    settings_version_id: str
    low_battery_threshold: float
    offline_threshold_seconds: int
    quick_entry_policy_json: dict[str, Any]
    music_enabled: bool
    favorite_limit: int
    auto_home_timeout_seconds: int
    position_device_thresholds_json: dict[str, Any]


class FunctionSettingsRepository(Protocol):
    async def upsert_for_settings_version(
        self,
        input: FunctionSettingsSnapshotRow,
        ctx: RepoContext | None = None,
    ) -> None: ...
