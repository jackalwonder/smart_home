from __future__ import annotations

from typing import Protocol

from src.repositories.rows.index import TerminalRow
from src.shared.kernel.RepoContext import RepoContext


class TerminalRepository(Protocol):
    async def find_by_id(self, terminal_id: str, ctx: RepoContext | None = None) -> TerminalRow | None: ...
    async def find_by_code(self, home_id: str, terminal_code: str, ctx: RepoContext | None = None) -> TerminalRow | None: ...
    async def touch_last_seen(
        self,
        terminal_id: str,
        seen_at: str,
        ip: str | None,
        ctx: RepoContext | None = None,
    ) -> None: ...
