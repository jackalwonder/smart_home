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


class HaControlGateway(Protocol):
    async def submit_control(self, command: HaControlCommand) -> None: ...
