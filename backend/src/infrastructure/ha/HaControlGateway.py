from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol


@dataclass(frozen=True)
class HaControlCommand:
    home_id: str
    device_id: str
    request_id: str
    action_type: str
    payload: dict[str, Any]


@dataclass(frozen=True)
class HaControlSubmitResult:
    submitted: bool
    status: str
    reason: str
    message: str | None = None


class HaControlGateway(Protocol):
    async def submit_control(self, command: HaControlCommand) -> HaControlSubmitResult: ...
