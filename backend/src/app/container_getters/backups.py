from __future__ import annotations

from src.app.container_getters._shared import resolve
from src.infrastructure.db.repositories.base.backups.BackupRepositoryImpl import (
    BackupRepositoryImpl,
)
from src.infrastructure.db.repositories.base.backups.BackupRestoreRepositoryImpl import (
    BackupRestoreRepositoryImpl,
)
from src.modules.backups.services.BackupRestoreService import BackupRestoreService
from src.modules.backups.services.BackupService import BackupService


def get_backup_repository() -> BackupRepositoryImpl:
    return resolve(BackupRepositoryImpl)


def get_backup_restore_repository() -> BackupRestoreRepositoryImpl:
    return resolve(BackupRestoreRepositoryImpl)


def get_backup_service() -> BackupService:
    return resolve(BackupService)


def get_backup_restore_service() -> BackupRestoreService:
    return resolve(BackupRestoreService)


__all__ = [
    "get_backup_repository",
    "get_backup_restore_repository",
    "get_backup_restore_service",
    "get_backup_service",
]

