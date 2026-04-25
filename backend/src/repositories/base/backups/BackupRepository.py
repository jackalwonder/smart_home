from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol


@dataclass(frozen=True)
class BackupCreateRow:
    home_id: str
    backup_id: str
    status: str
    note: str | None
    snapshot_blob: bytes
    created_by_member_id: str | None
    created_by_terminal_id: str
    created_at: str


@dataclass(frozen=True)
class BackupListRow:
    backup_id: str
    created_at: str
    restored_at: str | None
    created_by: str | None
    status: str
    note: str | None
    snapshot_blob: Any
    current_settings_version: str | None
    current_layout_version: str | None


class BackupRepository(Protocol):
    async def build_current_snapshot(self, home_id: str) -> dict[str, Any]: ...

    async def create_backup(self, row: BackupCreateRow) -> None: ...

    async def list_backups(self, home_id: str) -> list[BackupListRow]: ...
