from __future__ import annotations

from typing import Protocol

from src.repositories.rows.index import HomeRow
from src.shared.kernel.RepoContext import RepoContext


class HomeRepository(Protocol):
    async def find_by_id(self, home_id: str, ctx: RepoContext | None = None) -> HomeRow | None: ...
