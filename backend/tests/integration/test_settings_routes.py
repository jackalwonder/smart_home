from __future__ import annotations

from src.app.container import (
    get_favorites_query_service,
    get_management_pin_guard,
    get_request_context_service,
    get_sgcc_login_qr_code_service,
    get_settings_query_service,
    get_settings_save_service,
)
from src.modules.auth.services.query.RequestContextService import RequestContext
from src.modules.settings.services.query.SgccLoginQrCodeService import (
    SgccLoginQrCodeFileView,
    SgccLoginQrCodeStatusView,
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


class FakeSgccLoginQrCodeService:
    async def get_status(self, **_kwargs):
        return SgccLoginQrCodeStatusView(
            available=True,
            status="READY",
            image_url="/api/v1/settings/sgcc-login-qrcode/file?v=1",
            updated_at="2026-04-20T12:00:00+00:00",
            expires_at="2026-04-20T12:01:00+00:00",
            age_seconds=1,
            file_size_bytes=2048,
            mime_type="image/png",
            message="QR code is ready.",
        )

    async def regenerate(self):
        return SgccLoginQrCodeStatusView(
            available=False,
            status="PENDING",
            image_url=None,
            updated_at=None,
            expires_at=None,
            age_seconds=None,
            file_size_bytes=None,
            mime_type=None,
            message="Regenerating.",
        )

    async def get_file(self):
        return SgccLoginQrCodeFileView(
            path=__file__,
            mime_type="image/png",
        )


class FakeRequestContextService:
    async def resolve_http_request(self, *_args, **_kwargs):
        return RequestContext(home_id="home-1", terminal_id="terminal-1", operator_id="member-1")


class FakeManagementPinGuard:
    async def require_active_session(self, *_args, **_kwargs):
        return None


def test_get_settings_returns_snapshot(app, client):
    app.dependency_overrides[get_settings_query_service] = lambda: FakeSettingsQueryService()
    app.dependency_overrides[get_request_context_service] = lambda: FakeRequestContextService()

    response = client.get("/api/v1/settings")

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
    app.dependency_overrides[get_sgcc_login_qr_code_service] = lambda: FakeSgccLoginQrCodeService()
    app.dependency_overrides[get_management_pin_guard] = lambda: FakeManagementPinGuard()
    app.dependency_overrides[get_request_context_service] = lambda: FakeRequestContextService()

    function_response = client.get("/api/v1/function-settings")
    favorites_response = client.get("/api/v1/favorites")
    page_response = client.get("/api/v1/page-settings")
    sgcc_qr_response = client.get("/api/v1/settings/sgcc-login-qrcode")
    sgcc_qr_regenerate_response = client.post(
        "/api/v1/settings/sgcc-login-qrcode/regenerate"
    )

    assert function_response.status_code == 200
    assert function_response.json()["data"]["music_enabled"] is True
    assert function_response.json()["data"]["settings_version"] == "sv_current"

    assert favorites_response.status_code == 200
    assert favorites_response.json()["data"]["selected_count"] == 1
    assert favorites_response.json()["data"]["items"][0]["device_id"] == "device-1"

    assert page_response.status_code == 200
    assert page_response.json()["data"]["room_label_mode"] == "ROOM_NAME"
    assert page_response.json()["data"]["settings_version"] == "sv_current"

    assert sgcc_qr_response.status_code == 200
    assert sgcc_qr_response.json()["data"]["available"] is True
    assert sgcc_qr_response.json()["data"]["status"] == "READY"
    assert sgcc_qr_response.json()["data"]["image_url"].endswith("v=1")

    assert sgcc_qr_regenerate_response.status_code == 200
    assert sgcc_qr_regenerate_response.json()["data"]["status"] == "PENDING"


def test_put_settings_returns_new_version(app, client):
    app.dependency_overrides[get_settings_save_service] = lambda: FakeSettingsSaveService()
    app.dependency_overrides[get_request_context_service] = lambda: FakeRequestContextService()

    response = client.put(
        "/api/v1/settings",
        json={
            "settings_version": "sv_current",
            "page_settings": {},
            "function_settings": {},
            "favorites": [],
        },
    )

    assert response.status_code == 200
    assert response.json()["success"] is True
    assert response.json()["data"]["saved"] is True
    assert response.json()["data"]["settings_version"] == "sv_next"
