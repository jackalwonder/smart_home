from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from src.shared.kernel.RepoContext import RepoContext


@dataclass(frozen=True)
class EnergyAccountRow:
    id: str
    home_id: str
    binding_status: str
    account_payload_encrypted: str | None
    updated_at: str


@dataclass(frozen=True)
class EnergyAccountUpsertRow:
    home_id: str
    binding_status: str
    account_payload_encrypted: str | None
    updated_by_member_id: str | None
    updated_by_terminal_id: str | None


class EnergyAccountRepository(Protocol):
    async def find_by_home_id(
        self,
        home_id: str,
        ctx: RepoContext | None = None,
    ) -> EnergyAccountRow | None: ...

    async def upsert(
        self,
        input: EnergyAccountUpsertRow,
        ctx: RepoContext | None = None,
    ) -> EnergyAccountRow: ...
