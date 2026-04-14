from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol

from src.repositories.rows.index import DeviceRuntimeStateRow
from src.shared.kernel.RepoContext import RepoContext


@dataclass(frozen=True)
class RuntimeStateUpsert:
    device_id: str
    home_id: str
    status: str
    is_offline: bool
    runtime_state_json: dict[str, Any]
    status_summary_json: dict[str, Any]
    last_state_update_at: str | None


class DeviceRuntimeStateRepository(Protocol):
    async def find_by_device_ids(
        self,
        home_id: str,
        device_ids: list[str],
        ctx: RepoContext | None = None,
    ) -> list[DeviceRuntimeStateRow]: ...

    async def upsert_runtime_state(
        self,
        input: RuntimeStateUpsert,
        ctx: RepoContext | None = None,
    ) -> None: ...
