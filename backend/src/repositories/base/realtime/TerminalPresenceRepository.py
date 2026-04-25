from __future__ import annotations

from typing import Protocol


class TerminalPresenceRepository(Protocol):
    async def touch_terminal(
        self,
        *,
        terminal_id: str,
        client_host: str | None,
    ) -> None: ...
