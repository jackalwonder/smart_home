from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol


@dataclass(frozen=True)
class HaConnectionTestInput:
    base_url: str
    auth_payload: dict[str, Any]


@dataclass(frozen=True)
class HaConnectionTestResult:
    success: bool
    status: str
    message: str | None = None


class HaConnectionGateway(Protocol):
    async def test_connection(self, input: HaConnectionTestInput) -> HaConnectionTestResult: ...
    async def trigger_full_reload(self, home_id: str) -> None: ...
