from __future__ import annotations

from src.app.container import get_device_catalog_service
from src.app.container import get_home_overview_query_service
from src.app.container import get_request_context_service
from src.infrastructure.weather.WeatherProvider import WeatherSnapshot
from src.modules.auth.services.query.RequestContextService import RequestContext
from src.modules.home_overview.services.query.HomeOverviewQueryService import HomeOverviewView
from src.repositories.query.overview.types import (
    EnergySummaryReadModel,
    HomeOverviewReadModel,
    SystemConnectionSummaryReadModel,
)
from src.repositories.read_models.index import (
    CurrentLayoutVersion,
    DefaultMediaReadModel,
    DeviceCardReadModel,
    FavoriteDeviceCardReadModel,
    FavoriteDeviceReadModel,
    FunctionSettingsReadModel,
    PageSettingsReadModel,
)


class FakeDeviceCatalogService:
    async def list_devices(self, _home_id, **_kwargs):
        return {
            "items": [
                {
                    "device_id": "device-1",
                    "display_name": "Living Room Lamp",
                    "raw_name": "lamp.raw",
                    "device_type": "light",
                    "room_id": "room-1",
                    "room_name": "Living Room",
                    "status": "ON",
                    "is_offline": False,
                    "is_complex_device": False,
                    "is_readonly_device": False,
                    "confirmation_type": "ACK_DRIVEN",
                    "entry_behavior": "QUICK_ACTION",
                    "default_control_target": "light",
                    "is_homepage_visible": True,
                    "is_primary_device": True,
                    "is_favorite": True,
                    "favorite_order": 1,
                    "is_favorite_candidate": True,
                    "favorite_exclude_reason": None,
                    "capabilities": {"brightness": True},
                    "alert_badges": [],
                    "status_summary": {"state": "ON"},
                }
            ],
            "page_info": {"page": 1, "page_size": 20, "total": 1, "has_next": False},
        }

    async def list_rooms(self, _home_id, include_counts=True):
        return [
            {
                "room_id": "room-1",
                "room_name": "Living Room",
                "priority": 1,
                "device_count": 2 if include_counts else 0,
                "homepage_device_count": 1 if include_counts else 0,
                "visible_in_editor": True,
            }
        ]

    async def get_device_detail(
        self,
        _home_id,
        _device_id,
        *,
        include_runtime_fields=True,
        include_editor_fields=False,
    ):
        return {
            "device_id": "device-1",
            "display_name": "Living Room Lamp",
            "raw_name": "lamp.raw",
            "device_type": "light",
            "room_id": "room-1",
            "room_name": "Living Room",
            "status": "ON",
            "is_offline": False,
            "is_complex_device": False,
            "is_readonly_device": False,
            "confirmation_type": "ACK_DRIVEN",
            "entry_behavior": "QUICK_ACTION",
            "default_control_target": "light",
            "capabilities": {"brightness": True},
            "alert_badges": [],
            "status_summary": {"state": "ON"},
            "runtime_state": {"aggregated_state": "ON"} if include_runtime_fields else None,
            "control_schema": [
                {
                    "action_type": "SET_VALUE",
                    "target_scope": "PRIMARY",
                    "target_key": "entity.light_1",
                    "value_type": "NUMBER",
                    "value_range": {"min": 0, "max": 100, "step": 1},
                    "allowed_values": None,
                    "unit": "%",
                    "is_quick_action": True,
                    "requires_detail_entry": False,
                }
            ],
            "editor_config": {"hotspots": []} if include_editor_fields else None,
            "source_info": {
                "ha_device_id": "ha-1",
                "entity_links": [
                    {
                        "entity_id": "light.living_room",
                        "domain": "light",
                        "platform": "xiaomi_home",
                        "entity_role": "PRIMARY",
                        "is_primary": True,
                    }
                ],
            },
        }

    async def get_panel(self, _home_id, panel_type, *, room_id=None, page=None, page_size=None):
        return {
            "panel_type": panel_type.upper(),
            "title": "Favorites",
            "items": [
                {
                    "device_id": "device-1",
                    "display_name": "Living Room Lamp",
                    "device_type": "light",
                    "room_id": room_id,
                    "room_name": "Living Room",
                    "status": "ON",
                    "is_offline": False,
                    "is_complex_device": False,
                    "is_readonly_device": False,
                    "entry_behavior": "QUICK_ACTION",
                    "confirmation_type": "ACK_DRIVEN",
                    "alert_badges": [],
                    "favorite_order": 1,
                    "is_selectable": True,
                    "exclude_reason": None,
                }
            ],
            "summary": {"count": 1},
            "cache_mode": False,
        }

    async def update_mapping(self, **_kwargs):
        return {
            "saved": True,
            "device_id": "device-1",
            "room_id": "room-1",
            "device_type": "light",
            "is_primary_device": True,
            "default_control_target": "light",
            "updated_at": "2026-04-14T10:00:00Z",
        }


class FakeHomeOverviewQueryService:
    async def get_overview(self, _input):
        return HomeOverviewView(
            overview=HomeOverviewReadModel(
                layout=CurrentLayoutVersion(
                    id="layout-row-1",
                    home_id="home-1",
                    layout_version="layout-v1",
                    background_asset_id="asset-1",
                    effective_at="2026-04-14T10:00:00Z",
                    background_image_url="https://example.com/floorplan.png",
                    background_image_width=1920,
                    background_image_height=1080,
                ),
                settings_version="settings-v1",
                hotspots=[
                    {
                        "hotspot_id": "hotspot-1",
                        "device_id": "device-1",
                        "display_name": "Living Room Lamp",
                        "device_type": "light",
                        "x": 0.25,
                        "y": 0.5,
                        "icon_type": "light",
                        "status": "ON",
                        "is_offline": False,
                        "is_complex_device": False,
                        "is_readonly_device": False,
                        "entry_behavior": "QUICK_ACTION",
                        "alert_badges": [],
                        "status_summary": {"state": "ON"},
                        "default_control_target": "light",
                        "display_policy": "ICON_ONLY",
                    }
                ],
                devices=[
                    DeviceCardReadModel(
                        device_id="device-1",
                        room_id="room-1",
                        room_name="Living Room",
                        display_name="Living Room Lamp",
                        raw_name="lamp.raw",
                        device_type="light",
                        status="ON",
                        is_offline=False,
                        is_complex_device=False,
                        is_readonly_device=False,
                        confirmation_type="ACK_DRIVEN",
                        entry_behavior="QUICK_ACTION",
                        default_control_target="light",
                        is_homepage_visible=True,
                        is_primary_device=True,
                        capabilities={"brightness": True},
                        status_summary={"state": "ON"},
                        alert_badges=[],
                    )
                ],
                favorites=[FavoriteDeviceReadModel(device_id="device-1", selected=True, favorite_order=1)],
                favorite_devices=[
                    FavoriteDeviceCardReadModel(
                        device_id="device-1",
                        room_id="room-1",
                        room_name="Living Room",
                        display_name="Living Room Lamp",
                        raw_name="lamp.raw",
                        device_type="light",
                        status="ON",
                        is_offline=False,
                        is_complex_device=False,
                        is_readonly_device=False,
                        confirmation_type="ACK_DRIVEN",
                        entry_behavior="QUICK_ACTION",
                        default_control_target="light",
                        is_homepage_visible=True,
                        is_primary_device=True,
                        capabilities={"brightness": True},
                        status_summary={"state": "ON"},
                        alert_badges=[],
                        favorite_order=1,
                    )
                ],
                page_settings=PageSettingsReadModel(
                    room_label_mode="ROOM_NAME",
                    homepage_display_policy={"stage": "FULL"},
                    icon_policy={"show_labels": True},
                    layout_preference={"sidebar": "RIGHT"},
                ),
                function_settings=FunctionSettingsReadModel(
                    music_enabled=True,
                    low_battery_threshold=20,
                    offline_threshold_seconds=300,
                    favorite_limit=8,
                    quick_entry_policy={"favorites": True},
                    auto_home_timeout_seconds=30,
                    position_device_thresholds={"closed_max": 5, "opened_min": 95},
                ),
                energy=EnergySummaryReadModel(
                    binding_status="BOUND",
                    refresh_status="SUCCESS",
                    yesterday_usage=1.2,
                    monthly_usage=24.6,
                    yearly_usage=234.5,
                    balance=88.8,
                ),
                media=DefaultMediaReadModel(
                    binding_status="MEDIA_SET",
                    availability_status="ONLINE",
                    device_id="media-1",
                    display_name="Living Room Speaker",
                    play_state="PLAYING",
                    track_title="Track",
                    artist="Artist",
                    entry_behavior="OPEN_MEDIA_POPUP",
                ),
                system_connection=SystemConnectionSummaryReadModel(
                    system_type="HOME_ASSISTANT",
                    connection_status="CONNECTED",
                    auth_configured=True,
                    last_test_at="2026-04-14T09:00:00Z",
                    last_sync_at="2026-04-14T09:30:00Z",
                ),
            ),
            weather=WeatherSnapshot(
                fetched_at="2026-04-14T09:40:00Z",
                cache_mode=False,
                temperature=22,
                condition="Sunny",
                humidity=50,
            ),
        )


class FakeRequestContextService:
    async def resolve_http_request(self, *_args, **_kwargs):
        return RequestContext(home_id="home-1", terminal_id="terminal-1")


def test_catalog_routes_are_wrapped(app, client):
    app.dependency_overrides[get_device_catalog_service] = lambda: FakeDeviceCatalogService()
    app.dependency_overrides[get_home_overview_query_service] = lambda: FakeHomeOverviewQueryService()
    app.dependency_overrides[get_request_context_service] = lambda: FakeRequestContextService()

    overview_response = client.get("/api/v1/home/overview")
    devices_response = client.get("/api/v1/devices")
    rooms_response = client.get("/api/v1/rooms")
    detail_response = client.get(
        "/api/v1/devices/device-1",
        params={"include_editor_fields": "true"},
    )
    panel_response = client.get(
        "/api/v1/home/panels/FAVORITES",
        params={"room_id": "room-1"},
    )
    mapping_response = client.put(
        "/api/v1/device-mappings/device-1",
        json={
            "room_id": "room-1",
            "device_type": "light",
            "is_primary_device": True,
            "default_control_target": "light",
        },
    )

    assert overview_response.status_code == 200
    assert overview_response.json()["success"] is True
    assert overview_response.json()["data"]["layout_version"] == "layout-v1"
    assert overview_response.json()["data"]["stage"]["hotspots"][0]["device_id"] == "device-1"
    assert overview_response.json()["data"]["favorite_devices"][0]["device_id"] == "device-1"
    assert overview_response.json()["data"]["sidebar"]["music_card"]["binding_status"] == "MEDIA_SET"

    assert devices_response.status_code == 200
    assert devices_response.json()["success"] is True
    assert devices_response.json()["data"]["items"][0]["device_id"] == "device-1"
    assert devices_response.json()["data"]["page_info"]["total"] == 1

    assert rooms_response.status_code == 200
    assert rooms_response.json()["success"] is True
    assert rooms_response.json()["data"]["rooms"][0]["room_id"] == "room-1"

    assert detail_response.status_code == 200
    assert detail_response.json()["success"] is True
    assert detail_response.json()["data"]["device_id"] == "device-1"
    assert detail_response.json()["data"]["control_schema"][0]["target_scope"] == "PRIMARY"
    assert detail_response.json()["data"]["control_schema"][0]["value_range"]["step"] == 1
    assert detail_response.json()["data"]["editor_config"] == {"hotspots": []}
    assert detail_response.json()["data"]["source_info"]["entity_links"][0]["entity_id"] == "light.living_room"
    assert detail_response.json()["meta"]["trace_id"]
    assert detail_response.json()["meta"]["server_time"]

    assert panel_response.status_code == 200
    assert panel_response.json()["success"] is True
    assert panel_response.json()["data"]["panel_type"] == "FAVORITES"
    assert panel_response.json()["data"]["summary"]["count"] == 1

    assert mapping_response.status_code == 200
    assert mapping_response.json()["success"] is True
    assert mapping_response.json()["data"]["saved"] is True
    assert mapping_response.json()["data"]["default_control_target"] == "light"
