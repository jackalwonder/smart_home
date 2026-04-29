from __future__ import annotations

from injector import Module, provider, singleton

from src.infrastructure.db.connection.Database import Database
from src.infrastructure.db.repositories.base.energy.EnergyAccountRepositoryImpl import (
    EnergyAccountRepositoryImpl,
)
from src.infrastructure.db.repositories.base.energy.EnergySnapshotRepositoryImpl import (
    EnergySnapshotRepositoryImpl,
)


class EnergyRepositoryModule(Module):
    @provider
    @singleton
    def provide_energy_account_repository(
        self, db: Database
    ) -> EnergyAccountRepositoryImpl:
        return EnergyAccountRepositoryImpl(db)

    @provider
    @singleton
    def provide_energy_snapshot_repository(
        self, db: Database
    ) -> EnergySnapshotRepositoryImpl:
        return EnergySnapshotRepositoryImpl(db)
