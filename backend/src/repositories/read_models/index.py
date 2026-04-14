from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class CurrentLayoutVersion:
    id: str
    home_id: str
    layout_version: str
    background_asset_id: str | None
    effective_at: str


@dataclass(frozen=True)
class CurrentSettingsVersion:
    id: str
    home_id: str
    settings_version: str
    effective_at: str


@dataclass(frozen=True)
class DeviceCardReadModel:
    device_id: str
    room_id: str | None
    display_name: str
    device_type: str
    status: str
    is_offline: bool
    status_summary: dict[str, Any]
    alert_badges: list[dict[str, Any]]


@dataclass(frozen=True)
class FavoriteDeviceReadModel:
    device_id: str
    selected: bool
    favorite_order: int | None


@dataclass(frozen=True)
class PageSettingsReadModel:
    room_label_mode: str
    homepage_display_policy: dict[str, Any]


@dataclass(frozen=True)
class FunctionSettingsReadModel:
    music_enabled: bool
    low_battery_threshold: int
    offline_threshold_seconds: int
    favorite_limit: int


@dataclass(frozen=True)
class DefaultMediaReadModel:
    binding_status: str
    availability_status: str | None
    device_id: str | None


@dataclass(frozen=True)
class DraftLeaseReadModel:
    lease_id: str
    terminal_id: str
    member_id: str | None
    lease_status: str
    is_active: bool
    lease_expires_at: str
    last_heartbeat_at: str


@dataclass(frozen=True)
class EditorDraftReadModel:
    draft_id: str
    home_id: str
    draft_version: str
    base_layout_version: str
    background_asset_id: str | None
    hotspots: list[dict[str, Any]]
    active_lease: DraftLeaseReadModel | None


@dataclass(frozen=True)
class DeviceControlResultReadModel:
    request_id: str
    device_id: str
    acceptance_status: str
    execution_status: str
    final_runtime_state: dict[str, Any] | None
    error_code: str | None
    error_message: str | None
    accepted_at: str | None
    completed_at: str | None
