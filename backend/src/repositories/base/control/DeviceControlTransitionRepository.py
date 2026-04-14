from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol

from src.repositories.rows.index import DeviceControlTransitionRow
from src.shared.kernel.RepoContext import RepoContext


@dataclass(frozen=True)
class NewDeviceControlTransitionRow:
    control_request_id: str
    from_status: str | None
    to_status: str
    reason: str | None
    error_code: str | None
    payload_json: dict[str, Any]


class DeviceControlTransitionRepository(Protocol):
    async def insert(
        self,
        input: NewDeviceControlTransitionRow,
        ctx: RepoContext | None = None,
    ) -> DeviceControlTransitionRow: ...

    async def list_by_control_request_id(
        self,
        control_request_id: str,
        ctx: RepoContext | None = None,
    ) -> list[DeviceControlTransitionRow]: ...
