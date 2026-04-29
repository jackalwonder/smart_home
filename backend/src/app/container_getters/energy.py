from __future__ import annotations

from src.app.container_getters._shared import resolve
from src.infrastructure.db.repositories.base.energy.EnergyAccountRepositoryImpl import (
    EnergyAccountRepositoryImpl,
)
from src.infrastructure.db.repositories.base.energy.EnergySnapshotRepositoryImpl import (
    EnergySnapshotRepositoryImpl,
)
from src.modules.energy.services.EnergyAutoRefreshService import EnergyAutoRefreshService
from src.modules.energy.services.EnergyBindingService import EnergyBindingService
from src.modules.energy.services.EnergyRefreshCoordinator import EnergyRefreshCoordinator
from src.modules.energy.services.EnergyService import EnergyService
from src.modules.energy.services.EnergyUpstreamReader import EnergyUpstreamReader


def get_energy_account_repository() -> EnergyAccountRepositoryImpl:
    return resolve(EnergyAccountRepositoryImpl)


def get_energy_snapshot_repository() -> EnergySnapshotRepositoryImpl:
    return resolve(EnergySnapshotRepositoryImpl)


def get_energy_upstream_reader() -> EnergyUpstreamReader:
    return resolve(EnergyUpstreamReader)


def get_energy_binding_service() -> EnergyBindingService:
    return resolve(EnergyBindingService)


def get_energy_refresh_coordinator() -> EnergyRefreshCoordinator:
    return resolve(EnergyRefreshCoordinator)


def get_energy_service() -> EnergyService:
    return resolve(EnergyService)


def get_energy_auto_refresh_service() -> EnergyAutoRefreshService:
    return resolve(EnergyAutoRefreshService)


__all__ = [
    "get_energy_account_repository",
    "get_energy_auto_refresh_service",
    "get_energy_binding_service",
    "get_energy_refresh_coordinator",
    "get_energy_service",
    "get_energy_snapshot_repository",
    "get_energy_upstream_reader",
]

