from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from src.repositories.rows.index import CurrentSettingsVersionRow
from src.shared.kernel.RepoContext import RepoContext


@dataclass(frozen=True)
class NewSettingsVersionRow:
    home_id: str
    settings_version: str
    updated_domains_json: list[str]
    effective_at: str
    saved_by_member_id: str | None
    saved_by_terminal_id: str | None


class SettingsVersionRepository(Protocol):
    async def find_current_by_home(
        self,
        home_id: str,
        ctx: RepoContext | None = None,
    ) -> CurrentSettingsVersionRow | None: ...

    async def insert(
        self,
        input: NewSettingsVersionRow,
        ctx: RepoContext | None = None,
    ) -> CurrentSettingsVersionRow: ...
