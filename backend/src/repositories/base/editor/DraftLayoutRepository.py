from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol

from src.repositories.rows.index import DraftLayoutRow
from src.shared.kernel.RepoContext import RepoContext


@dataclass(frozen=True)
class DraftLayoutUpsertRow:
    home_id: str
    draft_version: str
    base_layout_version: str
    background_asset_id: str | None
    layout_meta_json: dict[str, Any]
    readonly_snapshot_json: dict[str, Any] | None
    updated_by_member_id: str | None
    updated_by_terminal_id: str | None


class DraftLayoutRepository(Protocol):
    async def find_by_home_id(
        self,
        home_id: str,
        ctx: RepoContext | None = None,
    ) -> DraftLayoutRow | None: ...

    async def upsert(
        self,
        input: DraftLayoutUpsertRow,
        ctx: RepoContext | None = None,
    ) -> DraftLayoutRow: ...

    async def delete_by_home_id(
        self,
        home_id: str,
        ctx: RepoContext | None = None,
    ) -> None: ...
