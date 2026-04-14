from __future__ import annotations

from typing import Protocol

from src.repositories.query.overview.types import HomeOverviewReadModel
from src.shared.kernel.RepoContext import RepoContext


class HomeOverviewQueryRepository(Protocol):
    async def get_overview_context(
        self,
        home_id: str,
        ctx: RepoContext | None = None,
    ) -> HomeOverviewReadModel: ...
