from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol

from src.repositories.rows.index import DeviceControlRequestRow
from src.shared.kernel.RepoContext import RepoContext


@dataclass(frozen=True)
class NewDeviceControlRequestRow:
    home_id: str
    request_id: str
    device_id: str
    action_type: str
    payload_json: dict[str, Any]
    client_ts: str | None
    acceptance_status: str
    confirmation_type: str
    execution_status: str
    timeout_seconds: int


@dataclass(frozen=True)
class DeviceControlResultUpdate:
    home_id: str
    request_id: str
    execution_status: str
    final_runtime_state_json: dict[str, Any] | None
    error_code: str | None
    error_message: str | None
    completed_at: str | None


class DeviceControlRequestRepository(Protocol):
    async def find_by_request_id(
        self,
        home_id: str,
        request_id: str,
        ctx: RepoContext | None = None,
    ) -> DeviceControlRequestRow | None: ...

    async def insert(
        self,
        input: NewDeviceControlRequestRow,
        ctx: RepoContext | None = None,
    ) -> DeviceControlRequestRow: ...

    async def update_execution_result(
        self,
        input: DeviceControlResultUpdate,
        ctx: RepoContext | None = None,
    ) -> None: ...
