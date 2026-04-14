from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

from src.repositories.read_models.index import DraftLeaseReadModel
from src.shared.kernel.RepoContext import RepoContext

DerivedEditorLockStatus = str


@dataclass(frozen=True)
class EditorLeaseContextReadModel:
    active_lease: DraftLeaseReadModel | None
    derived_lock_status: DerivedEditorLockStatus


class EditorLeaseQueryRepository(Protocol):
    async def get_lease_context(
        self,
        home_id: str,
        terminal_id: str,
        now: datetime,
        ctx: RepoContext | None = None,
    ) -> EditorLeaseContextReadModel: ...
