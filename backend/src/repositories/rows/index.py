from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class HomeRow:
    id: str
    home_code: str | None
    display_name: str
    timezone: str
    status: str


@dataclass(frozen=True)
class TerminalRow:
    id: str
    home_id: str
    terminal_code: str
    terminal_mode: str
    terminal_name: str


@dataclass(frozen=True)
class HomeAuthConfigRow:
    id: str
    home_id: str
    login_mode: str
    pin_retry_limit: int
    pin_lock_minutes: int
    pin_session_ttl_seconds: int


@dataclass(frozen=True)
class PinSessionRow:
    id: str
    home_id: str
    terminal_id: str
    member_id: str | None
    verified_for_action: str | None
    is_active: bool
    verified_at: str
    expires_at: str


@dataclass(frozen=True)
class PinLockRow:
    id: str
    home_id: str
    terminal_id: str
    failed_attempts: int
    locked_until: str | None
    last_failed_at: str | None


@dataclass(frozen=True)
class DeviceRow:
    id: str
    home_id: str
    room_id: str | None
    display_name: str
    raw_name: str | None
    device_type: str
    is_readonly_device: bool
    is_complex_device: bool
    entry_behavior: str


@dataclass(frozen=True)
class DeviceRuntimeStateRow:
    device_id: str
    home_id: str
    status: str
    is_offline: bool
    runtime_state_json: dict[str, Any]
    status_summary_json: dict[str, Any]
    last_state_update_at: str | None


@dataclass(frozen=True)
class DeviceControlSchemaRow:
    id: str
    device_id: str
    action_type: str
    target_scope: str | None
    target_key: str | None
    value_type: str | None
    value_range_json: dict[str, Any] | None
    allowed_values_json: list[Any] | None


@dataclass(frozen=True)
class CurrentLayoutVersionRow:
    id: str
    home_id: str
    layout_version: str
    background_asset_id: str | None
    effective_at: str


@dataclass(frozen=True)
class CurrentSettingsVersionRow:
    id: str
    home_id: str
    settings_version: str
    effective_at: str


@dataclass(frozen=True)
class DraftLeaseRow:
    id: str
    home_id: str
    lease_id: str
    terminal_id: str
    member_id: str | None
    lease_status: str
    is_active: bool
    lease_expires_at: str
    last_heartbeat_at: str


@dataclass(frozen=True)
class DeviceControlRequestRow:
    id: str
    home_id: str
    request_id: str
    device_id: str
    action_type: str
    payload_json: dict[str, Any]
    acceptance_status: str
    execution_status: str
    final_runtime_state_json: dict[str, Any] | None
    error_code: str | None
    error_message: str | None
    accepted_at: str | None
    completed_at: str | None


@dataclass(frozen=True)
class DeviceControlTransitionRow:
    id: str
    control_request_id: str
    from_status: str | None
    to_status: str
    reason: str | None
    error_code: str | None
    payload_json: dict[str, Any]
    created_at: str


@dataclass(frozen=True)
class WsEventOutboxRow:
    id: str
    home_id: str
    event_id: str
    event_type: str
    change_domain: str
    snapshot_required: bool
    payload_json: dict[str, Any]
    delivery_status: str
    occurred_at: str
    created_at: str
