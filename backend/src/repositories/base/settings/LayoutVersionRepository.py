from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol

from src.repositories.rows.index import CurrentLayoutVersionRow
from src.shared.kernel.RepoContext import RepoContext


@dataclass(frozen=True)
class NewLayoutVersionRow:
    home_id: str
    layout_version: str
    background_asset_id: str | None
    layout_meta_json: dict[str, Any]
    effective_at: str
    published_by_member_id: str | None
    published_by_terminal_id: str | None


class LayoutVersionRepository(Protocol):
    async def find_current_by_home(
        self,
        home_id: str,
        ctx: RepoContext | None = None,
    ) -> CurrentLayoutVersionRow | None: ...

    async def find_by_home_and_layout_version(
        self,
        home_id: str,
        layout_version: str,
        ctx: RepoContext | None = None,
    ) -> CurrentLayoutVersionRow | None: ...

    async def insert(
        self,
        input: NewLayoutVersionRow,
        ctx: RepoContext | None = None,
    ) -> CurrentLayoutVersionRow: ...
