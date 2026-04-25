from __future__ import annotations

from dataclasses import dataclass
from types import SimpleNamespace

import pytest

from src.modules.home_overview.services.DeviceCatalogService import DeviceCatalogService
from src.repositories.base.devices.DeviceCatalogCommandRepository import DeviceMappingSavedRow
from src.repositories.base.devices.DeviceRepository import DeviceMappingPatch
from src.repositories.query.overview.DeviceCatalogQueryRepository import (
    DeviceCatalogBadgeRow,
    DeviceCatalogDetailRow,
    DeviceCatalogDetailSnapshot,
    DeviceCatalogFavoriteRow,
    DeviceCatalogListRow,
    DeviceCatalogListSnapshot,
    DeviceCatalogPanelRow,
    DeviceCatalogPanelSnapshot,
    DeviceCatalogRoomRow,
    DeviceControlSchemaQueryRow,
    DeviceEditorHotspotQueryRow,
    DeviceEntityLinkQueryRow,
)
from src.repositories.rows.index import DeviceRow
from src.shared.errors.AppError import AppError
from src.shared.errors.ErrorCode import ErrorCode


@dataclass
class _QueryRepository:
    list_snapshot: DeviceCatalogListSnapshot | None = None
    detail_snapshot: DeviceCatalogDetailSnapshot | None = None
    panel_snapshot: DeviceCatalogPanelSnapshot | None = None
    rooms: list[DeviceCatalogRoomRow] | None = None

    async def list_devices_snapshot(self, **_kwargs):
        return self.list_snapshot or DeviceCatalogListSnapshot()

    async def list_rooms(self, **_kwargs):
        return self.rooms or []

    async def get_device_detail_snapshot(self, **_kwargs):
        return self.detail_snapshot or DeviceCatalogDetailSnapshot(device=None)

    async def get_panel_snapshot(self, **_kwargs):
        return self.panel_snapshot or DeviceCatalogPanelSnapshot()


class _CommandRepository:
    def __init__(self, *, room_exists: bool = True) -> None:
        self._room_exists = room_exists

    async def room_exists(self, **_kwargs) -> bool:
        return self._room_exists

    async def get_mapping_saved_row(self, **_kwargs):
        return DeviceMappingSavedRow(
            device_id="device-1",
            room_id="room-1",
            device_type="light",
            is_primary_device=True,
            default_control_target="light",
            updated_at="2026-04-14T10:00:00+00:00",
        )


class _UnitOfWork:
    async def run_in_transaction(self, func):
        return await func(SimpleNamespace(id="tx-1", session=None))


class _DeviceRepository:
    def __init__(self, *, found: bool = True) -> None:
        self._found = found
        self.patch: DeviceMappingPatch | None = None

    async def find_by_id(self, home_id, device_id, ctx=None):
        if not self._found:
            return None
        return DeviceRow(
            id=device_id,
            home_id=home_id,
            room_id="room-1",
            display_name="Lamp",
            raw_name=None,
            device_type="light",
            is_readonly_device=False,
            is_complex_device=False,
            entry_behavior="QUICK_ACTION",
        )

    async def update_mapping(self, _device_id, patch, ctx=None):
        self.patch = patch


class _PinGuard:
    async def require_active_session(self, _home_id, _terminal_id):
        return None


def _build_service(
    *,
    query_repository: _QueryRepository,
    command_repository: _CommandRepository | None = None,
    device_repository: _DeviceRepository | None = None,
):
    return DeviceCatalogService(
        device_catalog_query_repository=query_repository,
        device_catalog_command_repository=command_repository or _CommandRepository(),
        unit_of_work=_UnitOfWork(),
        device_repository=device_repository or _DeviceRepository(),
        management_pin_guard=_PinGuard(),
    )


def _list_row(
    device_id: str,
    *,
    readonly: bool = False,
    homepage_visible: bool = True,
) -> DeviceCatalogListRow:
    return DeviceCatalogListRow(
        device_id=device_id,
        display_name=f"Device {device_id}",
        raw_name=None,
        device_type="light",
        room_id="room-1",
        room_name="Living",
        status="ONLINE",
        is_offline=False,
        is_complex_device=False,
        is_readonly_device=readonly,
        confirmation_type=None,
        entry_behavior="QUICK_ACTION",
        default_control_target="light",
        is_homepage_visible=homepage_visible,
        is_primary_device=False,
        capabilities_json={"power": True},
        status_summary_json={"state": "on"},
    )


@pytest.mark.asyncio
async def test_list_devices_maps_favorites_badges_and_candidate_exclusions():
    service = _build_service(
        query_repository=_QueryRepository(
            list_snapshot=DeviceCatalogListSnapshot(
                favorites=[
                    DeviceCatalogFavoriteRow("device-1", True, 2),
                    DeviceCatalogFavoriteRow("device-3", False, None),
                ],
                media_device_id="device-2",
                devices=[
                    _list_row("device-1"),
                    _list_row("device-2"),
                    _list_row("device-3", readonly=True),
                ],
                badge_map={
                    "device-1": [DeviceCatalogBadgeRow("LOW_BATTERY", "warning", "Low")]
                },
            )
        )
    )

    result = await service.list_devices("home-1", page=1, page_size=10)

    assert result["page_info"] == {
        "page": 1,
        "page_size": 10,
        "total": 3,
        "has_next": False,
    }
    assert result["items"][0]["is_favorite"] is True
    assert result["items"][0]["favorite_order"] == 2
    assert result["items"][0]["is_favorite_candidate"] is True
    assert result["items"][0]["alert_badges"] == [
        {"code": "LOW_BATTERY", "level": "warning", "text": "Low"}
    ]
    assert result["items"][1]["favorite_exclude_reason"] == "DEFAULT_MEDIA_DEVICE"
    assert result["items"][2]["favorite_exclude_reason"] == "READONLY_DEVICE"


@pytest.mark.asyncio
async def test_get_device_detail_maps_runtime_schema_source_and_editor_fields():
    service = _build_service(
        query_repository=_QueryRepository(
            detail_snapshot=DeviceCatalogDetailSnapshot(
                device=DeviceCatalogDetailRow(
                    device_id="device-1",
                    display_name="Lamp",
                    raw_name="Raw Lamp",
                    device_type="light",
                    room_id="room-1",
                    room_name="Living",
                    status="ONLINE",
                    is_offline=False,
                    is_complex_device=False,
                    is_readonly_device=False,
                    confirmation_type=None,
                    entry_behavior="QUICK_ACTION",
                    default_control_target="light",
                    capabilities_json={"power": True},
                    source_meta_json={"source": "ha"},
                    status_summary_json={"state": "on"},
                    runtime_state_json={"state": "on", "attributes": {"brightness": 80}},
                    aggregated_state=None,
                    aggregated_mode=None,
                    aggregated_position=None,
                    last_state_update_at="2026-04-14T10:00:00+00:00",
                ),
                badges=[DeviceCatalogBadgeRow("ATTENTION", "info", "Attention")],
                control_schema=[
                    DeviceControlSchemaQueryRow(
                        action_type="SET_POWER_STATE",
                        target_scope="PRIMARY",
                        target_key="light.lamp",
                        value_type="BOOLEAN",
                        value_range_json=None,
                        allowed_values_json=[True, False],
                        unit=None,
                        is_quick_action=True,
                        requires_detail_entry=False,
                    )
                ],
                entity_links=[
                    DeviceEntityLinkQueryRow(
                        ha_entity_row_id="ha-1",
                        entity_id="light.lamp",
                        platform="ha",
                        domain="light",
                        raw_name="Lamp",
                        state="on",
                        room_hint="Living",
                        is_available=True,
                        last_synced_at="2026-04-14T10:00:00+00:00",
                        last_state_changed_at="2026-04-14T10:00:00+00:00",
                        entity_role="PRIMARY",
                        is_primary=True,
                        sort_order=1,
                    )
                ],
                editor_hotspots=[
                    DeviceEditorHotspotQueryRow(
                        hotspot_id="hotspot-1",
                        x=0.25,
                        y=0.5,
                        icon_type="light",
                        icon_asset_id="asset-1",
                        label_mode="AUTO",
                        is_visible=True,
                        structure_order=1,
                    )
                ],
            )
        )
    )

    result = await service.get_device_detail(
        "home-1",
        "device-1",
        include_editor_fields=True,
    )

    assert result["runtime_state"]["aggregated_state"] == "on"
    assert result["runtime_state"]["telemetry"] == {"brightness": 80}
    assert result["control_schema"][0]["allowed_values"] == [True, False]
    assert result["source_info"]["entity_links"][0]["entity_id"] == "light.lamp"
    assert result["editor_config"]["hotspots"][0]["icon_asset_url"] == (
        "/api/v1/page-assets/hotspot-icons/asset-1/file"
    )


@pytest.mark.asyncio
async def test_get_panel_filters_low_battery_against_threshold():
    service = _build_service(
        query_repository=_QueryRepository(
            panel_snapshot=DeviceCatalogPanelSnapshot(
                low_battery_threshold=20,
                devices=[
                    DeviceCatalogPanelRow(
                        device_id="device-low",
                        display_name="Low",
                        device_type="sensor",
                        room_id="room-1",
                        room_name="Living",
                        status="ONLINE",
                        is_offline=False,
                        is_complex_device=False,
                        is_readonly_device=True,
                        confirmation_type=None,
                        entry_behavior="DETAIL_ENTRY",
                        default_control_target=None,
                        runtime_state_json={"attributes": {"battery": 10}},
                    ),
                    DeviceCatalogPanelRow(
                        device_id="device-ok",
                        display_name="Ok",
                        device_type="sensor",
                        room_id="room-1",
                        room_name="Living",
                        status="ONLINE",
                        is_offline=False,
                        is_complex_device=False,
                        is_readonly_device=True,
                        confirmation_type=None,
                        entry_behavior="DETAIL_ENTRY",
                        default_control_target=None,
                        runtime_state_json={"attributes": {"battery_level": 90}},
                    ),
                ],
            )
        )
    )

    result = await service.get_panel("home-1", "LOW_BATTERY")

    assert result["summary"] == {"count": 1}
    assert result["items"][0]["device_id"] == "device-low"


@pytest.mark.asyncio
async def test_update_mapping_rejects_room_outside_home():
    service = _build_service(
        query_repository=_QueryRepository(),
        command_repository=_CommandRepository(room_exists=False),
    )

    with pytest.raises(AppError) as exc_info:
        await service.update_mapping(
            "home-1",
            "terminal-1",
            "device-1",
            "room-other",
            None,
            None,
            None,
            {"room_id"},
        )

    assert exc_info.value.code == ErrorCode.INVALID_PARAMS
    assert exc_info.value.details == {
        "fields": [{"field": "room_id", "reason": "not_found"}]
    }


@pytest.mark.asyncio
async def test_update_mapping_returns_saved_row_and_preserves_patch_fields():
    device_repository = _DeviceRepository()
    service = _build_service(
        query_repository=_QueryRepository(),
        device_repository=device_repository,
    )

    result = await service.update_mapping(
        "home-1",
        "terminal-1",
        "device-1",
        "room-1",
        "light",
        True,
        "light",
        {"room_id", "device_type", "is_primary_device", "default_control_target"},
    )

    assert result == {
        "saved": True,
        "device_id": "device-1",
        "room_id": "room-1",
        "device_type": "light",
        "is_primary_device": True,
        "default_control_target": "light",
        "updated_at": "2026-04-14T10:00:00+00:00",
    }
    assert device_repository.patch == DeviceMappingPatch(
        room_id="room-1",
        room_id_provided=True,
        device_type="light",
        device_type_provided=True,
        is_primary_device=True,
        is_primary_device_provided=True,
        default_control_target="light",
        default_control_target_provided=True,
    )
