from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol

from src.shared.kernel.RepoContext import RepoContext


@dataclass(frozen=True)
class HaDeviceSaveInput:
    room_id: str | None
    display_name: str
    raw_name: str | None
    device_type: str
    is_complex_device: bool
    is_readonly_device: bool
    entry_behavior: str
    default_control_target: str
    capabilities_json: dict[str, Any]
    source_meta_json: dict[str, Any]


@dataclass(frozen=True)
class HaRuntimeStateInput:
    device_id: str
    home_id: str
    status: str
    is_offline: bool
    status_summary_json: dict[str, Any]
    runtime_state_json: dict[str, Any]
    last_state_update_at: str | None


@dataclass(frozen=True)
class HaEntitySaveInput:
    platform: str
    domain: str
    raw_name: str | None
    state: str
    attributes_json: dict[str, Any]
    last_state_changed_at: str | None
    room_hint: str | None
    is_available: bool


@dataclass(frozen=True)
class DeviceEntityLinkSaveInput:
    home_id: str
    device_id: str
    ha_entity_id: str
    entity_role: str
    is_primary: bool
    sort_order: int


@dataclass(frozen=True)
class HaEntityStateUpdateInput:
    ha_entity_id: str
    state: str
    attributes_json: dict[str, Any]
    last_state_changed_at: str | None
    is_available: bool


@dataclass(frozen=True)
class StateChangedEntityLinkRow:
    ha_entity_id: str
    current_state: str | None
    current_last_state_changed_at: str | None
    device_id: str


@dataclass(frozen=True)
class RuntimeEntityLinkRow:
    device_id: str
    home_id: str
    display_name: str
    device_type: str
    entity_id: str
    domain: str
    state: str | None
    attributes_json: dict[str, Any]
    last_state_changed_at: str | None
    is_primary: bool
    sort_order: int


class HaEntitySyncRepository(Protocol):
    async def load_existing_rooms(self, home_id: str, ctx: RepoContext | None = None) -> dict[str, str]: ...

    async def ensure_room(
        self,
        home_id: str,
        room_name: str,
        ctx: RepoContext | None = None,
    ) -> str: ...

    async def load_existing_devices(self, home_id: str, ctx: RepoContext | None = None) -> dict[str, str]: ...

    async def load_existing_entities(
        self,
        home_id: str,
        entity_ids: list[str],
        ctx: RepoContext | None = None,
    ) -> dict[str, str]: ...

    async def save_device(
        self,
        home_id: str,
        device_id: str | None,
        input: HaDeviceSaveInput,
        ctx: RepoContext | None = None,
    ) -> str: ...

    async def upsert_runtime_state(
        self,
        input: HaRuntimeStateInput,
        ctx: RepoContext | None = None,
    ) -> None: ...

    async def save_ha_entity(
        self,
        home_id: str,
        entity_id: str,
        ha_entity_id: str | None,
        input: HaEntitySaveInput,
        ctx: RepoContext | None = None,
    ) -> str: ...

    async def upsert_device_entity_link(
        self,
        input: DeviceEntityLinkSaveInput,
        ctx: RepoContext | None = None,
    ) -> None: ...

    async def delete_stale_device_entity_links(
        self,
        device_id: str,
        current_ha_entity_ids: list[str],
        ctx: RepoContext | None = None,
    ) -> None: ...

    async def find_state_changed_entity(
        self,
        home_id: str,
        entity_id: str,
        ctx: RepoContext | None = None,
    ) -> StateChangedEntityLinkRow | None: ...

    async def update_ha_entity_state(
        self,
        input: HaEntityStateUpdateInput,
        ctx: RepoContext | None = None,
    ) -> None: ...

    async def list_runtime_entity_links(
        self,
        home_id: str,
        device_id: str,
        ctx: RepoContext | None = None,
    ) -> list[RuntimeEntityLinkRow]: ...
