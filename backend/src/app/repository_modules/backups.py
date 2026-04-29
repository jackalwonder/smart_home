from __future__ import annotations

from injector import Module, provider, singleton

from src.infrastructure.db.connection.Database import Database
from src.infrastructure.db.repositories.base.backups.BackupRepositoryImpl import (
    BackupRepositoryImpl,
)
from src.infrastructure.db.repositories.base.backups.BackupRestoreRepositoryImpl import (
    BackupRestoreRepositoryImpl,
)


class BackupRepositoryModule(Module):
    @provider
    @singleton
    def provide_backup_repository(self, db: Database) -> BackupRepositoryImpl:
        return BackupRepositoryImpl(db)

    @provider
    @singleton
    def provide_backup_restore_repository(
        self, db: Database
    ) -> BackupRestoreRepositoryImpl:
        return BackupRestoreRepositoryImpl(db)
