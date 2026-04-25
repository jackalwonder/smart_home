from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol


@dataclass(frozen=True)
class DeviceCatalogFavoriteRow:
    device_id: str
    selected: bool
    favorite_order: int | None


@dataclass(frozen=True)
class DeviceCatalogBadgeRow:
    code: str
    level: str
    text: str


@dataclass(frozen=True)
class DeviceCatalogListRow:
    device_id: str
    display_name: str
    raw_name: str | None
    device_type: str
    room_id: str | None
    room_name: str | None
    status: str
    is_offline: bool
    is_complex_device: bool
    is_readonly_device: bool
    confirmation_type: str | None
    entry_behavior: str | None
    default_control_target: str | None
    is_homepage_visible: bool
    is_primary_device: bool
    capabilities_json: Any
    status_summary_json: Any


@dataclass(frozen=True)
class DeviceCatalogListSnapshot:
    favorites: list[DeviceCatalogFavoriteRow] = field(default_factory=list)
    media_device_id: str | None = None
    devices: list[DeviceCatalogListRow] = field(default_factory=list)
    badge_map: dict[str, list[DeviceCatalogBadgeRow]] = field(default_factory=dict)


@dataclass(frozen=True)
class DeviceCatalogRoomRow:
    room_id: str
    room_name: str
    priority: int
    device_count: int
    homepage_device_count: int
    visible_in_editor: bool


@dataclass(frozen=True)
class DeviceCatalogDetailRow:
    device_id: str
    display_name: str
    raw_name: str | None
    device_type: str
    room_id: str | None
    room_name: str | None
    status: str
    is_offline: bool
    is_complex_device: bool
    is_readonly_device: bool
    confirmation_type: str | None
    entry_behavior: str | None
    default_control_target: str | None
    capabilities_json: Any
    source_meta_json: Any
    status_summary_json: Any
    runtime_state_json: Any
    aggregated_state: str | None
    aggregated_mode: str | None
    aggregated_position: float | None
    last_state_update_at: str | None


@dataclass(frozen=True)
class DeviceControlSchemaQueryRow:
    action_type: str
    target_scope: str | None
    target_key: str | None
    value_type: str | None
    value_range_json: Any
    allowed_values_json: Any
    unit: str | None
    is_quick_action: bool
    requires_detail_entry: bool


@dataclass(frozen=True)
class DeviceEntityLinkQueryRow:
    ha_entity_row_id: str | None
    entity_id: str
    platform: str | None
    domain: str | None
    raw_name: str | None
    state: str | None
    room_hint: str | None
    is_available: bool | None
    last_synced_at: str | None
    last_state_changed_at: str | None
    entity_role: str | None
    is_primary: bool
    sort_order: int | None


@dataclass(frozen=True)
class DeviceEditorHotspotQueryRow:
    hotspot_id: str
    x: float
    y: float
    icon_type: str | None
    icon_asset_id: str | None
    label_mode: str | None
    is_visible: bool
    structure_order: int


@dataclass(frozen=True)
class DeviceCatalogDetailSnapshot:
    device: DeviceCatalogDetailRow | None
    badges: list[DeviceCatalogBadgeRow] = field(default_factory=list)
    control_schema: list[DeviceControlSchemaQueryRow] = field(default_factory=list)
    entity_links: list[DeviceEntityLinkQueryRow] = field(default_factory=list)
    editor_hotspots: list[DeviceEditorHotspotQueryRow] | None = None


@dataclass(frozen=True)
class DeviceCatalogPanelRow:
    device_id: str
    display_name: str
    device_type: str
    room_id: str | None
    room_name: str | None
    status: str
    is_offline: bool
    is_complex_device: bool
    is_readonly_device: bool
    confirmation_type: str | None
    entry_behavior: str | None
    default_control_target: str | None
    runtime_state_json: Any


@dataclass(frozen=True)
class DeviceCatalogPanelSnapshot:
    favorites: list[DeviceCatalogFavoriteRow] = field(default_factory=list)
    media_device_id: str | None = None
    low_battery_threshold: float = 20.0
    devices: list[DeviceCatalogPanelRow] = field(default_factory=list)
    badge_map: dict[str, list[DeviceCatalogBadgeRow]] = field(default_factory=dict)


class DeviceCatalogQueryRepository(Protocol):
    async def list_devices_snapshot(
        self,
        *,
        home_id: str,
        room_id: str | None,
        device_type: str | None,
        status: str | None,
        keyword: str | None,
    ) -> DeviceCatalogListSnapshot: ...

    async def list_rooms(
        self,
        *,
        home_id: str,
        include_counts: bool,
    ) -> list[DeviceCatalogRoomRow]: ...

    async def get_device_detail_snapshot(
        self,
        *,
        home_id: str,
        device_id: str,
        include_editor_fields: bool,
    ) -> DeviceCatalogDetailSnapshot: ...

    async def get_panel_snapshot(
        self,
        *,
        home_id: str,
        room_id: str | None,
    ) -> DeviceCatalogPanelSnapshot: ...
