from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from src.shared.kernel.RepoContext import RepoContext


@dataclass(frozen=True)
class SystemConnectionRow:
    id: str
    home_id: str
    system_type: str
    connection_mode: str
    base_url_encrypted: str | None
    auth_payload_encrypted: str | None
    auth_configured: bool
    connection_status: str
    last_test_at: str | None
    last_test_result: str | None
    last_sync_at: str | None
    last_sync_result: str | None
    updated_at: str


@dataclass(frozen=True)
class SystemConnectionUpsertRow:
    home_id: str
    system_type: str
    connection_mode: str
    base_url_encrypted: str | None
    auth_payload_encrypted: str | None
    auth_configured: bool
    connection_status: str
    last_test_at: str | None = None
    last_test_result: str | None = None
    last_sync_at: str | None = None
    last_sync_result: str | None = None


class SystemConnectionRepository(Protocol):
    async def find_by_home_and_type(
        self,
        home_id: str,
        system_type: str,
        ctx: RepoContext | None = None,
    ) -> SystemConnectionRow | None: ...

    async def upsert(
        self,
        input: SystemConnectionUpsertRow,
        ctx: RepoContext | None = None,
    ) -> SystemConnectionRow: ...
