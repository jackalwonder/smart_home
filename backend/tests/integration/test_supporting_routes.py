from __future__ import annotations

from src.app.container import (
    get_bootstrap_token_service,
    get_device_catalog_service,
    get_energy_service,
    get_management_pin_guard,
    get_media_service,
    get_pin_verification_service,
    get_request_context_service,
    get_session_query_service,
    get_system_connection_service,
    get_terminal_pairing_code_service,
)
from fastapi.testclient import TestClient
from src.modules.auth.services.query.RequestContextService import RequestContext
from src.modules.auth.services.command.PinVerificationService import (
    PinSessionStatusView,
    PinVerificationView,
)
from src.modules.auth.services.query.SessionQueryService import (
    AuthSessionFeaturesView,
    AuthSessionView,
)
from src.modules.auth.services.command.BootstrapTokenService import (
    BootstrapTokenAuditView,
    BootstrapSessionContext,
    BootstrapTokenCreateView,
    BootstrapTokenTerminalView,
    BootstrapTokenStatusView,
)
from src.modules.auth.services.command.TerminalPairingCodeService import (
    TerminalPairingClaimView,
    TerminalPairingIssueView,
    TerminalPairingPollView,
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
import src.main as main_module


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
            session_token="pin-session-1",
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
            system_updated_at="2026-04-14T09:00:00Z",
            source_updated_at="2026-04-14T08:55:00Z",
            cache_mode=False,
            last_error_code=None,
            refresh_status_detail="SUCCESS_UPDATED",
            provider="HOME_ASSISTANT_SGCC",
            account_id_masked="12******90",
            entity_map={},
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
            upstream_triggered=True,
            source_updated=True,
            source_updated_at="2026-04-14T10:01:30Z",
            system_updated_at="2026-04-14T10:02:00Z",
            refresh_status_detail="SUCCESS_UPDATED",
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


class FakeRequestContextService:
    async def resolve_http_request(self, request, *_args, **kwargs):
        auth_mode = "legacy_context" if kwargs.get("require_bearer") is False else "bearer"
        request.state.auth_mode = auth_mode
        request.state.home_id = "home-1"
        request.state.terminal_id = "terminal-1"
        request.state.operator_id = "member-1"
        return RequestContext(
            home_id="home-1",
            terminal_id="terminal-1",
            operator_id="member-1",
            auth_mode=auth_mode,
        )


class CapturingRequestContextService(FakeRequestContextService):
    def __init__(self):
        self.kwargs = None

    async def resolve_http_request(self, request, *_args, **kwargs):
        self.kwargs = kwargs
        return await super().resolve_http_request(request, *_args, **kwargs)


class FakeBootstrapTokenService:
    async def exchange(self, token):
        assert token == "bootstrap-token-1"
        return BootstrapSessionContext(
            home_id="home-1",
            terminal_id="terminal-1",
            terminal_mode="KIOSK",
            bootstrap_token_jti="bootstrap-jti-1",
        )

    async def create_or_reset(self, _input):
        return BootstrapTokenCreateView(
            terminal_id="terminal-1",
            bootstrap_token="bootstrap-token-1",
            expires_at="2026-05-18T00:00:00+00:00",
            rotated=True,
            scope=["bootstrap:session"],
        )

    async def get_status(self, _input):
        return BootstrapTokenStatusView(
            terminal_id="terminal-1",
            terminal_mode="KIOSK",
            token_configured=True,
            issued_at="2026-04-18T00:00:00+00:00",
            expires_at="2026-05-18T00:00:00+00:00",
            last_used_at="2026-04-18T00:05:00+00:00",
        )

    async def list_terminals(self, *, home_id):
        assert home_id == "home-1"
        return [
            BootstrapTokenTerminalView(
                terminal_id="terminal-1",
                terminal_code="main",
                terminal_name="Main terminal",
                terminal_mode="KIOSK",
                token_configured=True,
                issued_at="2026-04-18T00:00:00+00:00",
                expires_at="2026-05-18T00:00:00+00:00",
                last_used_at="2026-04-18T00:05:00+00:00",
            )
        ]

    async def list_audits(self, *, home_id, limit):
        assert home_id == "home-1"
        assert limit == 20
        return [
            BootstrapTokenAuditView(
                audit_id="audit-1",
                terminal_id="terminal-1",
                terminal_code="main",
                terminal_name="Main terminal",
                action_type="TERMINAL_BOOTSTRAP_TOKEN_RESET",
                operator_id="member-1",
                operator_name="Owner",
                acting_terminal_id="terminal-1",
                acting_terminal_name="Main terminal",
                before_version="active_token",
                after_version="bootstrap-jti-1",
                result_status="SUCCESS",
                expires_at="2026-05-18T00:00:00+00:00",
                rotated=True,
                created_at="2026-04-18T00:00:00+00:00",
            )
        ]


class FakeTerminalPairingCodeService:
    async def issue(self, _input):
        return TerminalPairingIssueView(
            pairing_id="pairing-1",
            terminal_id="terminal-1",
            terminal_code="main",
            terminal_name="Main terminal",
            terminal_mode="KIOSK",
            pairing_code="ABCD-2345",
            expires_at="2026-04-18T00:10:00+00:00",
            status="PENDING",
        )

    async def poll(self, _input):
        return TerminalPairingPollView(
            pairing_id="pairing-1",
            terminal_id="terminal-1",
            terminal_code="main",
            terminal_name="Main terminal",
            terminal_mode="KIOSK",
            status="DELIVERED",
            expires_at="2026-04-18T00:10:00+00:00",
            claimed_at="2026-04-18T00:01:00+00:00",
            bootstrap_token="bootstrap-token-1",
            bootstrap_token_expires_at="2026-05-18T00:00:00+00:00",
        )

    async def claim(self, _input):
        return TerminalPairingClaimView(
            pairing_id="pairing-1",
            terminal_id="terminal-1",
            terminal_code="main",
            terminal_name="Main terminal",
            terminal_mode="KIOSK",
            status="CLAIMED",
            claimed_at="2026-04-18T00:01:00+00:00",
            bootstrap_token_expires_at="2026-05-18T00:00:00+00:00",
            rotated=True,
        )


class FakeManagementPinGuard:
    async def require_active_session(self, home_id, terminal_id):
        assert home_id == "home-1"
        assert terminal_id == "terminal-1"


class FailingDeviceCatalogService:
    async def list_devices(self, *_args, **_kwargs):
        raise RuntimeError("boom")


def test_auth_system_energy_and_media_routes(app, client):
    app.dependency_overrides[get_session_query_service] = lambda: FakeSessionQueryService()
    app.dependency_overrides[get_pin_verification_service] = lambda: FakePinVerificationService()
    app.dependency_overrides[get_bootstrap_token_service] = lambda: FakeBootstrapTokenService()
    app.dependency_overrides[get_terminal_pairing_code_service] = (
        lambda: FakeTerminalPairingCodeService()
    )
    app.dependency_overrides[get_management_pin_guard] = lambda: FakeManagementPinGuard()
    app.dependency_overrides[get_system_connection_service] = lambda: FakeSystemConnectionService()
    app.dependency_overrides[get_energy_service] = lambda: FakeEnergyService()
    app.dependency_overrides[get_media_service] = lambda: FakeMediaService()
    app.dependency_overrides[get_request_context_service] = lambda: FakeRequestContextService()

    auth_response = client.get("/api/v1/auth/session")
    bootstrap_session_response = client.post(
        "/api/v1/auth/session/bootstrap",
        headers={"authorization": "Bootstrap bootstrap-token-1"},
    )
    bootstrap_token_response = client.post(
        "/api/v1/terminals/terminal-1/bootstrap-token",
        headers={"authorization": f"Bearer {auth_response.json()['data']['access_token']}"},
    )
    pairing_issue_response = client.post("/api/v1/terminals/terminal-1/pairing-code-sessions")
    pairing_poll_response = client.get("/api/v1/terminals/terminal-1/pairing-code-sessions/pairing-1")
    pairing_claim_response = client.post(
        "/api/v1/terminals/pairing-code-claims",
        headers={"authorization": f"Bearer {auth_response.json()['data']['access_token']}"},
        json={"pairing_code": "ABCD-2345"},
    )
    bootstrap_token_status_response = client.get(
        "/api/v1/terminals/terminal-1/bootstrap-token",
        headers={"authorization": f"Bearer {auth_response.json()['data']['access_token']}"},
    )
    bootstrap_token_directory_response = client.get(
        "/api/v1/terminals/bootstrap-tokens",
        headers={"authorization": f"Bearer {auth_response.json()['data']['access_token']}"},
    )
    bootstrap_token_audits_response = client.get(
        "/api/v1/terminals/bootstrap-token-audits",
        headers={"authorization": f"Bearer {auth_response.json()['data']['access_token']}"},
    )
    access_token = auth_response.json()["data"]["access_token"]
    pin_verify_response = client.post(
        "/api/v1/auth/pin/verify",
        json={"home_id": "home-1", "terminal_id": "terminal-1", "pin": "1234"},
    )
    pin_session_response = client.get(
        "/api/v1/auth/pin/session",
        headers={"authorization": f"Bearer {access_token}"},
    )
    system_get_response = client.get("/api/v1/system-connections")
    system_save_response = client.put(
        "/api/v1/system-connections/home-assistant",
        json={
            "base_url": "https://ha.example.com",
            "auth_payload": {"token": "secret"},
        },
    )
    system_test_response = client.post(
        "/api/v1/system-connections/home-assistant/test",
        json={
            "use_saved_config": False,
            "candidate_config": {
                "base_url": "https://ha.example.com",
                "auth_payload": {"token": "secret"},
            },
        },
    )
    reload_response = client.post(
        "/api/v1/devices/reload",
        json={"force_full_sync": True},
    )
    energy_get_response = client.get("/api/v1/energy")
    energy_refresh_response = client.post(
        "/api/v1/energy/refresh",
        json={"payload": {}},
    )
    media_get_response = client.get("/api/v1/media/default")

    assert auth_response.json()["data"]["operator_id"] == "member-1"
    assert auth_response.json()["data"]["pin_session_expires_at"] == "2026-04-14T10:30:00Z"
    assert auth_response.json()["data"]["token_type"] == "Bearer"
    assert set(auth_response.json()["data"]["scope"]) == {"api", "ws"}
    assert access_token
    assert bootstrap_session_response.json()["data"]["access_token"]
    assert bootstrap_session_response.json()["data"]["token_type"] == "Bearer"
    assert bootstrap_token_response.json()["data"]["token_type"] == "Bootstrap"
    assert bootstrap_token_response.json()["data"]["bootstrap_token"] == "bootstrap-token-1"
    assert bootstrap_token_response.json()["data"]["rotated"] is True
    assert pairing_issue_response.json()["data"]["pairing_code"] == "ABCD-2345"
    assert pairing_poll_response.json()["data"]["bootstrap_token"] == "bootstrap-token-1"
    assert pairing_claim_response.json()["data"]["status"] == "CLAIMED"
    assert bootstrap_token_status_response.json()["data"]["token_configured"] is True
    assert bootstrap_token_status_response.json()["data"]["last_used_at"] == "2026-04-18T00:05:00+00:00"
    assert bootstrap_token_directory_response.json()["data"]["items"][0]["terminal_code"] == "main"
    assert (
        bootstrap_token_audits_response.json()["data"]["items"][0]["action_type"]
        == "TERMINAL_BOOTSTRAP_TOKEN_RESET"
    )
    assert bootstrap_token_audits_response.json()["data"]["items"][0]["rotated"] is True

    assert pin_verify_response.json()["data"]["pin_session_active"] is True
    assert pin_verify_response.json()["data"]["remaining_attempts"] == 5
    assert "pin_session_token=pin-session-1" in pin_verify_response.headers["set-cookie"]
    assert pin_session_response.json()["data"]["remaining_lock_seconds"] == 0

    assert system_get_response.json()["data"]["home_assistant"]["connection_status"] == "CONNECTED"
    assert system_save_response.json()["data"]["saved"] is True
    assert system_test_response.json()["data"]["tested"] is True
    assert reload_response.json()["data"]["reload_status"] == "ACCEPTED"

    assert energy_get_response.json()["data"]["balance"] == 88.8
    assert energy_refresh_response.json()["data"]["accepted"] is True
    assert media_get_response.json()["data"]["confirmation_type"] == "PLAYBACK_STATE_DRIVEN"


def test_auth_session_always_requires_bearer_context(app, client):
    context_service = CapturingRequestContextService()
    app.dependency_overrides[get_session_query_service] = lambda: FakeSessionQueryService()
    app.dependency_overrides[get_request_context_service] = lambda: context_service

    response = client.get("/api/v1/auth/session?home_id=home-1&terminal_id=terminal-1")

    assert response.status_code == 200
    assert context_service.kwargs is not None
    assert context_service.kwargs["require_bearer"] is True


def test_http_404_and_unhandled_errors_are_wrapped(app, client):
    app.dependency_overrides[get_device_catalog_service] = lambda: FailingDeviceCatalogService()
    app.dependency_overrides[get_request_context_service] = lambda: FakeRequestContextService()

    not_found_response = client.get("/api/v1/route-does-not-exist")
    non_raising_client = TestClient(app, raise_server_exceptions=False)
    failure_response = non_raising_client.get("/api/v1/devices")

    assert not_found_response.status_code == 404
    not_found_body = not_found_response.json()
    assert not_found_body["success"] is False
    assert not_found_body["error"]["code"] == "NOT_FOUND"
    assert not_found_body["meta"]["trace_id"]

    assert failure_response.status_code == 500
    failure_body = failure_response.json()
    assert failure_body["success"] is False
    assert failure_body["error"]["code"] == "INTERNAL_SERVER_ERROR"
    assert failure_body["error"]["details"]["exception_type"] == "RuntimeError"


def test_healthz_and_readyz_routes(monkeypatch, client):
    async def fake_check_redis(*_args, **_kwargs):
        return None

    monkeypatch.setattr(main_module, "_check_redis", fake_check_redis)

    health_response = client.get("/healthz")
    ready_response = client.get("/readyz")

    assert health_response.status_code == 200
    assert health_response.json()["data"]["status"] == "ok"
    assert ready_response.status_code == 200
    ready_body = ready_response.json()
    assert ready_body["data"]["status"] == "ready"
    assert ready_body["data"]["checks"]["database"]["status"] == "ok"
    assert ready_body["data"]["checks"]["redis"]["status"] == "ok"


def test_observabilityz_reports_bootstrap_token_without_legacy_bootstrap(app, client):
    app.dependency_overrides[get_session_query_service] = lambda: FakeSessionQueryService()
    app.dependency_overrides[get_bootstrap_token_service] = lambda: FakeBootstrapTokenService()

    response = client.post(
        "/api/v1/auth/session/bootstrap",
        headers={"authorization": "Bootstrap bootstrap-token-1"},
    )
    observability_response = client.get("/observabilityz")

    assert response.status_code == 200
    assert observability_response.status_code == 200
    snapshot = observability_response.json()["data"]
    assert snapshot["auth_session_bootstrap"]["requests_total"] == 1
    assert snapshot["auth_session_bootstrap"]["auth_mode_counts"]["bootstrap_token"] == 1
    assert snapshot["auth_session_bootstrap"]["legacy_requests_total"] == 0
    assert snapshot["auth_session_bootstrap"]["legacy_context_field_counts"] == {}
    assert snapshot["legacy_context"]["field_counts"] == {}


def test_observabilityz_reports_pairing_bootstrap_outside_runtime_legacy(app, client):
    app.dependency_overrides[get_request_context_service] = lambda: FakeRequestContextService()
    app.dependency_overrides[get_terminal_pairing_code_service] = (
        lambda: FakeTerminalPairingCodeService()
    )

    response = client.post("/api/v1/terminals/terminal-1/pairing-code-sessions")
    observability_response = client.get("/observabilityz")

    assert response.status_code == 200
    assert observability_response.status_code == 200
    snapshot = observability_response.json()["data"]
    assert snapshot["terminal_pairing"]["requests_total"] == 1
    assert snapshot["terminal_pairing"]["auth_mode_counts"]["legacy_context"] == 1
    assert snapshot["legacy_context"]["field_counts"] == {}
    assert snapshot["legacy_context"]["runtime_accepted_requests_total"] == 0


def test_readyz_returns_503_when_dependency_is_unavailable(monkeypatch, client):
    async def fake_check_redis(*_args, **_kwargs):
        raise RuntimeError("redis unavailable")

    monkeypatch.setattr(main_module, "_check_redis", fake_check_redis)

    response = client.get("/readyz")

    assert response.status_code == 503
    body = response.json()
    assert body["success"] is False
    assert body["error"]["code"] == "INTERNAL_SERVER_ERROR"
    assert body["error"]["details"]["checks"]["database"]["status"] == "ok"
    assert body["error"]["details"]["checks"]["redis"]["status"] == "unavailable"
    assert body["error"]["details"]["checks"]["redis"]["error_type"] == "RuntimeError"
