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
    background_image_url: str | None = None
    background_image_width: int | None = None
    background_image_height: int | None = None


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
    room_name: str | None
    display_name: str
    raw_name: str | None
    device_type: str
    status: str
    is_offline: bool
    is_complex_device: bool
    is_readonly_device: bool
    confirmation_type: str | None
    entry_behavior: str
    default_control_target: str | None
    is_homepage_visible: bool
    is_primary_device: bool
    capabilities: dict[str, Any]
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
    icon_policy: dict[str, Any] | None = None
    layout_preference: dict[str, Any] | None = None


@dataclass(frozen=True)
class FunctionSettingsReadModel:
    music_enabled: bool
    low_battery_threshold: float
    offline_threshold_seconds: int
    favorite_limit: int
    quick_entry_policy: dict[str, Any] | None = None
    auto_home_timeout_seconds: int | None = None
    position_device_thresholds: dict[str, Any] | None = None


@dataclass(frozen=True)
class DefaultMediaReadModel:
    binding_status: str
    availability_status: str | None
    device_id: str | None
    display_name: str | None = None
    play_state: str | None = None
    track_title: str | None = None
    artist: str | None = None
    entry_behavior: str | None = None


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
    layout_meta: dict[str, Any]
    hotspots: list[dict[str, Any]]
    active_lease: DraftLeaseReadModel | None


@dataclass(frozen=True)
class DeviceControlResultReadModel:
    request_id: str
    device_id: str
    action_type: str
    payload: dict[str, Any]
    acceptance_status: str
    confirmation_type: str
    execution_status: str
    retry_count: int
    final_runtime_state: dict[str, Any] | None
    error_code: str | None
    error_message: str | None
    accepted_at: str | None
    completed_at: str | None
