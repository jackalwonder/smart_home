from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol

from src.shared.kernel.RepoContext import RepoContext


@dataclass(frozen=True)
class BackupRestoreBackupRow:
    status: str
    snapshot_blob: Any


@dataclass(frozen=True)
class BackupRestoreAuditRow:
    audit_id: str
    backup_id: str
    restored_at: str
    operator_id: str | None
    operator_name: str | None
    terminal_id: str | None
    before_version: str | None
    settings_version: str | None
    layout_version: str | None
    result_status: str
    error_code: str | None
    error_message: str | None
    failure_reason: str | None


@dataclass(frozen=True)
class BackupRestoreFailureAuditInput:
    home_id: str
    backup_id: str
    terminal_id: str
    operator_id: str | None
    error_code: str
    error_message: str
    failure_reason: str | None
    details_json: dict[str, Any]
    created_at: str


@dataclass(frozen=True)
class BackupRestoreSuccessAuditInput:
    home_id: str
    backup_id: str
    terminal_id: str
    operator_id: str | None
    settings_version: str
    layout_version: str
    created_at: str


class BackupRestoreRepository(Protocol):
    async def list_restore_audits(
        self,
        *,
        home_id: str,
        limit: int,
    ) -> list[BackupRestoreAuditRow]: ...

    async def get_backup(
        self,
        *,
        home_id: str,
        backup_id: str,
    ) -> BackupRestoreBackupRow | None: ...

    async def insert_restore_failure_audit(
        self,
        input: BackupRestoreFailureAuditInput,
    ) -> None: ...

    async def insert_restore_success_audit(
        self,
        input: BackupRestoreSuccessAuditInput,
        ctx: RepoContext | None = None,
    ) -> str: ...

    async def mark_backup_restored(
        self,
        *,
        home_id: str,
        backup_id: str,
        restored_at: str,
        ctx: RepoContext | None = None,
    ) -> None: ...
