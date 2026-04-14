from __future__ import annotations

from src.app.container import (
    get_favorites_query_service,
    get_settings_query_service,
    get_settings_save_service,
)
from src.modules.settings.services.command.SettingsSaveService import SettingsSaveView
from src.modules.settings.services.query.SettingsQueryService import SettingsView
from src.repositories.read_models.index import (
    FavoriteDeviceReadModel,
    FunctionSettingsReadModel,
    PageSettingsReadModel,
)


class FakeSettingsQueryService:
    async def get_settings(self, _input):
        return SettingsView(
            settings_version="sv_current",
            page_settings=PageSettingsReadModel(
                room_label_mode="ROOM_NAME",
                homepage_display_policy={"mode": "ALL"},
                icon_policy={"style": "default"},
                layout_preference={"density": "comfortable"},
            ),
            function_settings=FunctionSettingsReadModel(
                music_enabled=True,
                low_battery_threshold=20,
                offline_threshold_seconds=300,
                favorite_limit=8,
                quick_entry_policy={"mode": "smart"},
                auto_home_timeout_seconds=30,
                position_device_thresholds={"closed_max": 0.1, "opened_min": 0.9},
            ),
            favorites=[
                FavoriteDeviceReadModel(
                    device_id="device-1",
                    selected=True,
                    favorite_order=1,
                )
            ],
            system_settings_summary={
                "system_connections_configured": True,
                "energy_binding_status": "BOUND",
                "default_media_binding_status": "MEDIA_SET",
            },
            pin_session_required=False,
        )

    async def get_function_settings(self, _input):
        return {
            "settings_version": "sv_current",
            "low_battery_threshold": 20,
            "offline_threshold_seconds": 300,
            "quick_entry_policy": {"mode": "smart"},
            "music_enabled": True,
            "favorite_limit": 8,
            "auto_home_timeout_seconds": 30,
            "position_device_thresholds": {"closed_max": 0.1, "opened_min": 0.9},
        }

    async def get_page_settings(self, _input):
        return {
            "settings_version": "sv_current",
            "room_label_mode": "ROOM_NAME",
            "homepage_display_policy": {"mode": "ALL"},
            "icon_policy": {"style": "default"},
            "layout_preference": {"density": "comfortable"},
        }


class FakeSettingsSaveService:
    async def save(self, _input):
        return SettingsSaveView(
            saved=True,
            settings_version="sv_next",
            updated_domains=["FAVORITES", "PAGE_SETTINGS", "FUNCTION_SETTINGS"],
            effective_at="2026-04-14T10:00:00Z",
        )


class FakeFavoritesQueryService:
    async def get_favorites(self, _input):
        return {
            "items": [
                {
                    "device_id": "device-1",
                    "display_name": "Living Room Lamp",
                    "device_type": "light",
                    "room_id": "room-1",
                    "room_name": "Living Room",
                    "selected": True,
                    "favorite_order": 1,
                    "is_selectable": True,
                    "exclude_reason": None,
                }
            ],
            "selected_count": 1,
            "max_recommended": 8,
            "max_allowed": 8,
            "settings_version": "sv_current",
        }


def test_get_settings_returns_snapshot(app, client):
    app.dependency_overrides[get_settings_query_service] = lambda: FakeSettingsQueryService()

    response = client.get("/api/v1/settings", params={"home_id": "home-1"})

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["error"] is None
    assert body["meta"]["trace_id"]
    assert body["meta"]["server_time"]
    assert body["data"]["settings_version"] == "sv_current"
    assert body["data"]["page_settings"]["room_label_mode"] == "ROOM_NAME"
    assert body["data"]["function_settings"]["music_enabled"] is True
    assert body["data"]["favorites"][0]["device_id"] == "device-1"
    assert body["data"]["pin_session_required"] is False


def test_get_split_settings_routes(app, client):
    app.dependency_overrides[get_settings_query_service] = lambda: FakeSettingsQueryService()
    app.dependency_overrides[get_favorites_query_service] = lambda: FakeFavoritesQueryService()

    function_response = client.get("/api/v1/function-settings", params={"home_id": "home-1"})
    favorites_response = client.get("/api/v1/favorites", params={"home_id": "home-1"})
    page_response = client.get("/api/v1/page-settings", params={"home_id": "home-1"})

    assert function_response.status_code == 200
    assert function_response.json()["data"]["music_enabled"] is True
    assert function_response.json()["data"]["settings_version"] == "sv_current"

    assert favorites_response.status_code == 200
    assert favorites_response.json()["data"]["selected_count"] == 1
    assert favorites_response.json()["data"]["items"][0]["device_id"] == "device-1"

    assert page_response.status_code == 200
    assert page_response.json()["data"]["room_label_mode"] == "ROOM_NAME"
    assert page_response.json()["data"]["settings_version"] == "sv_current"


def test_put_settings_returns_new_version(app, client):
    app.dependency_overrides[get_settings_save_service] = lambda: FakeSettingsSaveService()

    response = client.put(
        "/api/v1/settings",
        json={
            "home_id": "home-1",
            "settings_version": "sv_current",
            "terminal_id": "terminal-1",
            "page_settings": {},
            "function_settings": {},
            "favorites": [],
        },
    )

    assert response.status_code == 200
    assert response.json()["success"] is True
    assert response.json()["data"]["saved"] is True
    assert response.json()["data"]["settings_version"] == "sv_next"
