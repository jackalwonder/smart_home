from __future__ import annotations

from src.app.container import (
    get_energy_service,
    get_media_service,
    get_pin_verification_service,
    get_session_query_service,
    get_system_connection_service,
)
from src.modules.auth.services.command.PinVerificationService import (
    PinSessionStatusView,
    PinVerificationView,
)
from src.modules.auth.services.query.SessionQueryService import (
    AuthSessionFeaturesView,
    AuthSessionView,
)
from src.modules.energy.services.EnergyService import (
    EnergyBindingView,
    EnergyRefreshView,
    EnergyView,
)
from src.modules.system_connections.services.SystemConnectionService import (
    DeviceReloadView,
    SystemConnectionSaveView,
    SystemConnectionTestView,
    SystemConnectionView,
)


class FakeSessionQueryService:
    async def get_session(self, _input):
        return AuthSessionView(
            home_id="home-1",
            operator_id="member-1",
            terminal_id="terminal-1",
            terminal_mode="KIOSK",
            login_mode="FIXED_HOME_ACCOUNT",
            pin_session_active=True,
            pin_session_expires_at="2026-04-14T10:30:00Z",
            features=AuthSessionFeaturesView(
                music_enabled=True,
                energy_enabled=True,
                editor_enabled=True,
            ),
        )


class FakePinVerificationService:
    async def verify(self, _input):
        return PinVerificationView(
            verified=True,
            pin_session_active=True,
            pin_session_expires_at="2026-04-14T10:30:00Z",
            remaining_attempts=5,
            lock_until=None,
        )

    async def get_session_status(self, _home_id, _terminal_id):
        return PinSessionStatusView(
            pin_session_active=True,
            pin_session_expires_at="2026-04-14T10:30:00Z",
            remaining_lock_seconds=0,
        )


class FakeSystemConnectionService:
    async def get_system_connections(self, _home_id):
        return [
            SystemConnectionView(
                connection_mode="TOKEN",
                base_url_masked="https://ha.example.com",
                connection_status="CONNECTED",
                auth_configured=True,
                settings_version="sv_current",
                last_test_at="2026-04-14T09:00:00Z",
                last_test_result="CONNECTED",
                last_sync_at="2026-04-14T09:30:00Z",
                last_sync_result="OK",
            )
        ]

    async def save_home_assistant(self, **_kwargs):
        return SystemConnectionSaveView(
            saved=True,
            connection_status="CONNECTED",
            updated_at="2026-04-14T10:00:00Z",
            message="System connection saved",
        )

    async def test_home_assistant(self, **_kwargs):
        return SystemConnectionTestView(
            tested=True,
            connection_status="CONNECTED",
            latency_ms=120,
            tested_at="2026-04-14T10:01:00Z",
            message=None,
        )

    async def reload_devices(self, *_args, **_kwargs):
        return DeviceReloadView(
            accepted=True,
            reload_status="ACCEPTED",
            started_at="2026-04-14T10:02:00Z",
            message="Reloaded 12 devices",
        )


class FakeEnergyService:
    async def get_energy(self, _home_id):
        return EnergyView(
            binding_status="BOUND",
            refresh_status="SUCCESS",
            yesterday_usage=1.2,
            monthly_usage=24.6,
            balance=88.8,
            yearly_usage=234.5,
            updated_at="2026-04-14T09:00:00Z",
            cache_mode=False,
            last_error_code=None,
        )

    async def update_binding(self, *_args, **_kwargs):
        return EnergyBindingView(
            saved=True,
            binding_status="BOUND",
            updated_at="2026-04-14T10:00:00Z",
            message="Energy binding saved",
        )

    async def delete_binding(self, *_args, **_kwargs):
        return EnergyBindingView(
            saved=True,
            binding_status="UNBOUND",
            updated_at="2026-04-14T10:01:00Z",
            message="Energy binding cleared",
        )

    async def refresh(self, *_args, **_kwargs):
        return EnergyRefreshView(
            accepted=True,
            refresh_status="SUCCESS",
            started_at="2026-04-14T10:02:00Z",
            timeout_seconds=30,
        )


class FakeMediaService:
    async def get_default_media(self, _home_id):
        return {
            "binding_status": "MEDIA_SET",
            "availability_status": "ONLINE",
            "device_id": "media-1",
            "display_name": "Living Room Speaker",
            "play_state": "PLAYING",
            "track_title": "Track",
            "artist": "Artist",
            "cover_url": "https://example.com/cover.jpg",
            "entry_behavior": "OPEN_MEDIA_POPUP",
            "confirmation_type": "PLAYBACK_STATE_DRIVEN",
            "control_schema": [],
        }

    async def bind_default_media(self, *_args, **_kwargs):
        return {
            "saved": True,
            "binding_status": "MEDIA_SET",
            "availability_status": "ONLINE",
            "device_id": "media-1",
            "display_name": "Living Room Speaker",
            "updated_at": "2026-04-14T10:00:00Z",
        }

    async def unbind_default_media(self, *_args, **_kwargs):
        return {
            "saved": True,
            "binding_status": "MEDIA_UNSET",
            "availability_status": None,
            "updated_at": "2026-04-14T10:01:00Z",
        }


def test_auth_system_energy_and_media_routes(app, client):
    app.dependency_overrides[get_session_query_service] = lambda: FakeSessionQueryService()
    app.dependency_overrides[get_pin_verification_service] = lambda: FakePinVerificationService()
    app.dependency_overrides[get_system_connection_service] = lambda: FakeSystemConnectionService()
    app.dependency_overrides[get_energy_service] = lambda: FakeEnergyService()
    app.dependency_overrides[get_media_service] = lambda: FakeMediaService()

    auth_response = client.get(
        "/api/v1/auth/session",
        params={"home_id": "home-1", "terminal_id": "terminal-1"},
    )
    pin_verify_response = client.post(
        "/api/v1/auth/pin/verify",
        json={"home_id": "home-1", "terminal_id": "terminal-1", "pin": "1234"},
    )
    pin_session_response = client.get(
        "/api/v1/auth/pin/session",
        params={"home_id": "home-1", "terminal_id": "terminal-1"},
    )
    system_get_response = client.get("/api/v1/system-connections", params={"home_id": "home-1"})
    system_save_response = client.put(
        "/api/v1/system-connections/home-assistant",
        json={
            "home_id": "home-1",
            "terminal_id": "terminal-1",
            "base_url": "https://ha.example.com",
            "auth_payload": {"token": "secret"},
        },
    )
    system_test_response = client.post(
        "/api/v1/system-connections/home-assistant/test",
        json={
            "home_id": "home-1",
            "terminal_id": "terminal-1",
            "base_url": "https://ha.example.com",
            "auth_payload": {"token": "secret"},
        },
    )
    reload_response = client.post(
        "/api/v1/devices/reload",
        json={"home_id": "home-1", "terminal_id": "terminal-1"},
    )
    energy_get_response = client.get("/api/v1/energy", params={"home_id": "home-1"})
    energy_refresh_response = client.post(
        "/api/v1/energy/refresh",
        json={"home_id": "home-1", "terminal_id": "terminal-1", "payload": {}},
    )
    media_get_response = client.get("/api/v1/media/default", params={"home_id": "home-1"})

    assert auth_response.json()["data"]["operator_id"] == "member-1"
    assert auth_response.json()["data"]["pin_session_expires_at"] == "2026-04-14T10:30:00Z"

    assert pin_verify_response.json()["data"]["pin_session_active"] is True
    assert pin_verify_response.json()["data"]["remaining_attempts"] == 5
    assert pin_session_response.json()["data"]["remaining_lock_seconds"] == 0

    assert system_get_response.json()["data"]["home_assistant"]["connection_status"] == "CONNECTED"
    assert system_save_response.json()["data"]["saved"] is True
    assert system_test_response.json()["data"]["tested"] is True
    assert reload_response.json()["data"]["reload_status"] == "ACCEPTED"

    assert energy_get_response.json()["data"]["balance"] == 88.8
    assert energy_refresh_response.json()["data"]["accepted"] is True
    assert media_get_response.json()["data"]["confirmation_type"] == "PLAYBACK_STATE_DRIVEN"
