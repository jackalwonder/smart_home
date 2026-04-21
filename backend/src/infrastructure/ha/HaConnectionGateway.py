from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any, Protocol


@dataclass(frozen=True)
class HaConnectionTestInput:
    base_url: str
    auth_payload: dict[str, Any]


@dataclass(frozen=True)
class HaConnectionTestResult:
    success: bool
    status: str
    message: str | None = None


@dataclass(frozen=True)
class HaRegistryEntry:
    payload: dict[str, Any]


@dataclass(frozen=True)
class HaStateEntry:
    payload: dict[str, Any]


@dataclass(frozen=True)
class HaSyncSnapshot:
    states: list[HaStateEntry]
    entity_registry: list[HaRegistryEntry]
    device_registry: list[HaRegistryEntry]
    area_registry: list[HaRegistryEntry]


@dataclass(frozen=True)
class HaRealtimeEvent:
    event_type: str
    payload: dict[str, Any]
    time_fired: str | None
    origin: str | None


class HaConnectionGateway(Protocol):
    async def test_connection(self, input: HaConnectionTestInput) -> HaConnectionTestResult: ...
    async def trigger_full_reload(self, home_id: str) -> None: ...
    async def fetch_states(self, home_id: str) -> list[HaStateEntry] | None: ...
    async def call_service_response(
        self,
        home_id: str,
        domain: str,
        service: str,
        payload: dict[str, Any],
    ) -> dict[str, Any] | None: ...
    async def fetch_sync_snapshot(self, home_id: str) -> HaSyncSnapshot: ...
    async def stream_realtime_events(self, home_id: str) -> AsyncIterator[HaRealtimeEvent]: ...
