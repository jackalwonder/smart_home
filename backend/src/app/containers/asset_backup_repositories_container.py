from __future__ import annotations

from functools import lru_cache

from src.app.containers import core_container
from src.infrastructure.db.repositories.base.backups.BackupRepositoryImpl import (
    BackupRepositoryImpl,
)
from src.infrastructure.db.repositories.base.backups.BackupRestoreRepositoryImpl import (
    BackupRestoreRepositoryImpl,
)
from src.infrastructure.db.repositories.base.energy.EnergyAccountRepositoryImpl import (
    EnergyAccountRepositoryImpl,
)
from src.infrastructure.db.repositories.base.energy.EnergySnapshotRepositoryImpl import (
    EnergySnapshotRepositoryImpl,
)
from src.infrastructure.db.repositories.base.page_assets.PageAssetRepositoryImpl import (
    PageAssetRepositoryImpl,
)
from src.infrastructure.db.unit_of_work.PostgresUnitOfWork import PostgresUnitOfWork


def _database():
    return core_container.get_database()


@lru_cache(maxsize=1)
def get_energy_account_repository() -> EnergyAccountRepositoryImpl:
    return EnergyAccountRepositoryImpl(_database())


@lru_cache(maxsize=1)
def get_energy_snapshot_repository() -> EnergySnapshotRepositoryImpl:
    return EnergySnapshotRepositoryImpl(_database())


@lru_cache(maxsize=1)
def get_backup_repository() -> BackupRepositoryImpl:
    return BackupRepositoryImpl(_database())


@lru_cache(maxsize=1)
def get_backup_restore_repository() -> BackupRestoreRepositoryImpl:
    return BackupRestoreRepositoryImpl(_database())


@lru_cache(maxsize=1)
def get_page_asset_repository() -> PageAssetRepositoryImpl:
    return PageAssetRepositoryImpl(_database())


@lru_cache(maxsize=1)
def get_unit_of_work() -> PostgresUnitOfWork:
    return PostgresUnitOfWork(_database())
