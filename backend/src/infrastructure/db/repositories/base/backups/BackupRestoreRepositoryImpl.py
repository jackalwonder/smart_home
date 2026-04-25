from __future__ import annotations

from sqlalchemy import text

from src.infrastructure.db.connection.Database import Database
from src.infrastructure.db.repositories._support import session_scope, to_jsonb
from src.repositories.base.backups.BackupRestoreRepository import (
    BackupRestoreAuditRow,
    BackupRestoreBackupRow,
    BackupRestoreFailureAuditInput,
    BackupRestoreSuccessAuditInput,
)
from src.shared.kernel.RepoContext import RepoContext


class BackupRestoreRepositoryImpl:
    def __init__(self, database: Database) -> None:
        self._database = database

    async def list_restore_audits(
        self,
        *,
        home_id: str,
        limit: int,
    ) -> list[BackupRestoreAuditRow]:
        stmt = text(
            """
            SELECT
                al.id::text AS audit_id,
                al.target_id AS backup_id,
                al.created_at::text AS restored_at,
                al.operator_id::text AS operator_id,
                m.display_name AS operator_name,
                al.terminal_id::text AS terminal_id,
                al.before_version,
                COALESCE(al.payload_json ->> 'settings_version', al.after_version) AS settings_version,
                al.payload_json ->> 'layout_version' AS layout_version,
                al.result_status,
                al.error_code,
                al.payload_json ->> 'error_message' AS error_message,
                al.payload_json ->> 'failure_reason' AS failure_reason
            FROM audit_logs al
            LEFT JOIN members m
              ON m.id = al.operator_id
            WHERE al.home_id = :home_id
              AND al.action_type = 'BACKUP_RESTORE'
              AND al.target_type = 'SYSTEM_BACKUP'
            ORDER BY al.created_at DESC
            LIMIT :limit
            """
        )
        async with session_scope(self._database) as (session, _):
            rows = (
                await session.execute(
                    stmt,
                    {
                        "home_id": home_id,
                        "limit": limit,
                    },
                )
            ).mappings().all()
        return [BackupRestoreAuditRow(**dict(row)) for row in rows]

    async def get_backup(
        self,
        *,
        home_id: str,
        backup_id: str,
    ) -> BackupRestoreBackupRow | None:
        stmt = text(
            """
            SELECT status, snapshot_blob
            FROM system_backups
            WHERE home_id = :home_id
              AND backup_id = :backup_id
            """
        )
        async with session_scope(self._database) as (session, _):
            row = (
                await session.execute(
                    stmt,
                    {"home_id": home_id, "backup_id": backup_id},
                )
            ).mappings().one_or_none()
        return BackupRestoreBackupRow(**dict(row)) if row is not None else None

    async def insert_restore_failure_audit(
        self,
        input: BackupRestoreFailureAuditInput,
    ) -> None:
        stmt = text(
            """
            INSERT INTO audit_logs (
                home_id,
                operator_id,
                terminal_id,
                action_type,
                target_type,
                target_id,
                before_version,
                result_status,
                error_code,
                payload_json,
                created_at
            ) VALUES (
                :home_id,
                :operator_id,
                :terminal_id,
                :action_type,
                :target_type,
                :target_id,
                :before_version,
                :result_status,
                :error_code,
                :payload_json,
                :created_at
            )
            """
        )
        async with session_scope(self._database) as (session, owned):
            await session.execute(
                stmt,
                {
                    "home_id": input.home_id,
                    "operator_id": input.operator_id,
                    "terminal_id": input.terminal_id,
                    "action_type": "BACKUP_RESTORE",
                    "target_type": "SYSTEM_BACKUP",
                    "target_id": input.backup_id,
                    "before_version": input.backup_id,
                    "result_status": "FAILED",
                    "error_code": input.error_code,
                    "payload_json": to_jsonb(
                        {
                            "backup_id": input.backup_id,
                            "error_message": input.error_message,
                            "failure_reason": input.failure_reason,
                            "details": input.details_json,
                            "restored_by_terminal_id": input.terminal_id,
                        }
                    ),
                    "created_at": input.created_at,
                },
            )
            if owned:
                await session.commit()

    async def insert_restore_success_audit(
        self,
        input: BackupRestoreSuccessAuditInput,
        ctx: RepoContext | None = None,
    ) -> str:
        stmt = text(
            """
            INSERT INTO audit_logs (
                home_id,
                operator_id,
                terminal_id,
                action_type,
                target_type,
                target_id,
                before_version,
                after_version,
                result_status,
                payload_json,
                created_at
            ) VALUES (
                :home_id,
                :operator_id,
                :terminal_id,
                :action_type,
                :target_type,
                :target_id,
                :before_version,
                :after_version,
                :result_status,
                :payload_json,
                :created_at
            )
            RETURNING id::text AS audit_id
            """
        )
        async with session_scope(self._database, ctx) as (session, _):
            row = (
                await session.execute(
                    stmt,
                    {
                        "home_id": input.home_id,
                        "operator_id": input.operator_id,
                        "terminal_id": input.terminal_id,
                        "action_type": "BACKUP_RESTORE",
                        "target_type": "SYSTEM_BACKUP",
                        "target_id": input.backup_id,
                        "before_version": input.backup_id,
                        "after_version": input.settings_version,
                        "result_status": "SUCCESS",
                        "payload_json": to_jsonb(
                            {
                                "backup_id": input.backup_id,
                                "settings_version": input.settings_version,
                                "layout_version": input.layout_version,
                                "restored_by_terminal_id": input.terminal_id,
                            }
                        ),
                        "created_at": input.created_at,
                    },
                )
            ).mappings().one()
        return str(row["audit_id"])

    async def mark_backup_restored(
        self,
        *,
        home_id: str,
        backup_id: str,
        restored_at: str,
        ctx: RepoContext | None = None,
    ) -> None:
        stmt = text(
            """
            UPDATE system_backups
            SET restored_at = :restored_at
            WHERE home_id = :home_id
              AND backup_id = :backup_id
            """
        )
        async with session_scope(self._database, ctx) as (session, _):
            await session.execute(
                stmt,
                {
                    "home_id": home_id,
                    "backup_id": backup_id,
                    "restored_at": restored_at,
                },
            )
