from __future__ import annotations

from typing import Protocol

from src.repositories.rows.index import HomeAuthConfigRow
from src.shared.kernel.RepoContext import RepoContext


class HomeAuthConfigRepository(Protocol):
    async def find_by_home_id(
        self,
        home_id: str,
        ctx: RepoContext | None = None,
    ) -> HomeAuthConfigRow | None: ...
