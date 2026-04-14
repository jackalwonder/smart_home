from __future__ import annotations

from typing import Protocol

from src.repositories.read_models.index import EditorDraftReadModel
from src.shared.kernel.RepoContext import RepoContext


class EditorDraftQueryRepository(Protocol):
    async def get_draft_context(
        self,
        home_id: str,
        ctx: RepoContext | None = None,
    ) -> EditorDraftReadModel | None: ...
