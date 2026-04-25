from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class RequestContextLookupRow:
    home_id: str | None
    terminal_id: str | None
    operator_id: str | None = None


class RequestContextRepository(Protocol):
    async def find_terminal_context(
        self,
        terminal_id: str,
    ) -> RequestContextLookupRow | None: ...

    async def find_session_context(
        self,
        session_token: str,
    ) -> RequestContextLookupRow | None: ...

    async def find_home_id_by_device_id(self, device_id: str) -> str | None: ...

    async def find_home_id_by_control_request_id(self, request_id: str) -> str | None: ...
