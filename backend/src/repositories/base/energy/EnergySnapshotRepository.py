from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from src.shared.kernel.RepoContext import RepoContext


@dataclass(frozen=True)
class EnergySnapshotRow:
    id: str
    home_id: str
    binding_status: str
    refresh_status: str
    yesterday_usage: float | None
    monthly_usage: float | None
    yearly_usage: float | None
    balance: float | None
    cache_mode: bool
    last_error_code: str | None
    source_updated_at: str | None
    created_at: str


@dataclass(frozen=True)
class NewEnergySnapshotRow:
    home_id: str
    binding_status: str
    refresh_status: str
    yesterday_usage: float | None
    monthly_usage: float | None
    yearly_usage: float | None
    balance: float | None
    cache_mode: bool
    last_error_code: str | None
    source_updated_at: str | None


class EnergySnapshotRepository(Protocol):
    async def find_latest_by_home_id(
        self,
        home_id: str,
        ctx: RepoContext | None = None,
    ) -> EnergySnapshotRow | None: ...

    async def insert(
        self,
        input: NewEnergySnapshotRow,
        ctx: RepoContext | None = None,
    ) -> EnergySnapshotRow: ...
