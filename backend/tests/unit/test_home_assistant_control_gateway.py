from __future__ import annotations

import httpx
import pytest

from src.infrastructure.ha.HaControlGateway import HaControlCommand
from src.infrastructure.ha.HomeAssistantBootstrapProvider import HomeAssistantBootstrapConfig
from src.infrastructure.ha.impl.HomeAssistantControlGateway import HomeAssistantControlGateway
from src.repositories.base.system.SystemConnectionRepository import SystemConnectionRow


class _CaptureAsyncClient:
    requests: list[dict] = []

    def __init__(self, **_kwargs) -> None:
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args) -> None:
        return None

    async def post(self, url, *, headers=None, json=None):
        self.requests.append({"url": url, "headers": headers or {}, "json": json})
        return httpx.Response(200, request=httpx.Request("POST", url))


class _SystemConnectionRepository:
    def __init__(self, row: SystemConnectionRow | None) -> None:
        self._row = row

    async def find_by_home_and_type(self, _home_id, _system_type, ctx=None):
        return self._row


class _Cipher:
    def decrypt(self, ciphertext: str | None) -> str | None:
        return ciphertext


class _BootstrapProvider:
    def __init__(self, config: HomeAssistantBootstrapConfig | None) -> None:
        self._config = config

    def get_config(self) -> HomeAssistantBootstrapConfig | None:
        return self._config


def _connection_row() -> SystemConnectionRow:
    return SystemConnectionRow(
        id="conn-1",
        home_id="home-1",
        system_type="HOME_ASSISTANT",
        connection_mode="DIRECT",
        base_url_encrypted="http://ha.test",
        auth_payload_encrypted='{"access_token":"secret-token"}',
        auth_configured=True,
        connection_status="CONNECTED",
        last_test_at=None,
        last_test_result=None,
        last_sync_at=None,
        last_sync_result=None,
        updated_at="2026-04-19T00:00:00+00:00",
    )


def _gateway(
    row: SystemConnectionRow | None = None,
    *,
    bootstrap: HomeAssistantBootstrapConfig | None = None,
) -> HomeAssistantControlGateway:
    return HomeAssistantControlGateway(
        system_connection_repository=_SystemConnectionRepository(row),
        connection_secret_cipher=_Cipher(),
        home_assistant_bootstrap_provider=_BootstrapProvider(bootstrap),
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("action_type", "payload", "expected_path", "expected_json"),
    [
        (
            "SET_TEMPERATURE",
            {"target_key": "climate.fridge", "value": 4},
            "/api/services/climate/set_temperature",
            {"entity_id": "climate.fridge", "temperature": 4},
        ),
        (
            "SET_MODE",
            {"target_key": "climate.fridge", "value": "cool"},
            "/api/services/climate/set_hvac_mode",
            {"entity_id": "climate.fridge", "hvac_mode": "cool"},
        ),
        (
            "SET_MODE",
            {"target_key": "select.fridge_mode", "value": "holiday"},
            "/api/services/select/select_option",
            {"entity_id": "select.fridge_mode", "option": "holiday"},
        ),
        (
            "SET_VALUE",
            {"target_key": "number.fridge_target", "value": 4},
            "/api/services/number/set_value",
            {"entity_id": "number.fridge_target", "value": 4},
        ),
        (
            "SET_POWER_STATE",
            {"target_key": "switch.fridge_power", "value": True},
            "/api/services/switch/turn_on",
            {"entity_id": "switch.fridge_power"},
        ),
        (
            "TOGGLE_POWER",
            {"target_key": "media_player.speaker", "value": False},
            "/api/services/media_player/turn_off",
            {"entity_id": "media_player.speaker"},
        ),
        (
            "SET_POSITION",
            {"target_key": "cover.living_room", "value": 35},
            "/api/services/cover/set_cover_position",
            {"entity_id": "cover.living_room", "position": 35},
        ),
        (
            "EXECUTE_ACTION",
            {"target_key": "button.reset_filter", "value": None},
            "/api/services/button/press",
            {"entity_id": "button.reset_filter"},
        ),
    ],
)
async def test_submit_control_maps_supported_actions_to_home_assistant_services(
    monkeypatch,
    action_type,
    payload,
    expected_path,
    expected_json,
):
    monkeypatch.setattr(httpx, "AsyncClient", _CaptureAsyncClient)
    _CaptureAsyncClient.requests = []
    gateway = _gateway(_connection_row())

    result = await gateway.submit_control(
        HaControlCommand(
            home_id="home-1",
            device_id="device-1",
            request_id="req-1",
            action_type=action_type,
            payload=payload,
        )
    )

    assert result.submitted is True
    assert result.reason == "HA_ACKNOWLEDGED"
    assert len(_CaptureAsyncClient.requests) == 1
    request = _CaptureAsyncClient.requests[0]
    assert request["url"] == f"http://ha.test{expected_path}"
    assert request["headers"]["Authorization"] == "Bearer secret-token"
    assert request["json"] == expected_json


@pytest.mark.asyncio
async def test_submit_control_uses_bootstrap_config_when_saved_connection_is_missing(monkeypatch):
    monkeypatch.setattr(httpx, "AsyncClient", _CaptureAsyncClient)
    _CaptureAsyncClient.requests = []
    gateway = _gateway(
        None,
        bootstrap=HomeAssistantBootstrapConfig(
            connection_mode="BOOTSTRAP",
            base_url="http://bootstrap-ha.test",
            auth_payload={"access_token": "bootstrap-token"},
        ),
    )

    result = await gateway.submit_control(
        HaControlCommand(
            home_id="home-1",
            device_id="device-1",
            request_id="req-1",
            action_type="SET_TEMPERATURE",
            payload={"target_key": "climate.fridge", "value": 3},
        )
    )

    assert result.submitted is True
    assert result.reason == "HA_ACKNOWLEDGED"
    assert len(_CaptureAsyncClient.requests) == 1
    request = _CaptureAsyncClient.requests[0]
    assert request["url"] == "http://bootstrap-ha.test/api/services/climate/set_temperature"
    assert request["headers"]["Authorization"] == "Bearer bootstrap-token"
    assert request["json"] == {
        "entity_id": "climate.fridge",
        "temperature": 3,
    }


@pytest.mark.asyncio
async def test_submit_control_reports_unsupported_targets_without_calling_home_assistant(monkeypatch):
    monkeypatch.setattr(httpx, "AsyncClient", _CaptureAsyncClient)
    _CaptureAsyncClient.requests = []
    gateway = _gateway(_connection_row())

    result = await gateway.submit_control(
        HaControlCommand(
            home_id="home-1",
            device_id="device-1",
            request_id="req-1",
            action_type="SET_TEMPERATURE",
            payload={"target_key": "invalid_target", "value": 4},
        )
    )

    assert result.submitted is False
    assert result.status == "UNSUPPORTED"
    assert result.reason == "HA_SERVICE_UNSUPPORTED"
    assert _CaptureAsyncClient.requests == []


@pytest.mark.asyncio
async def test_submit_control_reports_missing_home_assistant_configuration(monkeypatch):
    monkeypatch.setattr(httpx, "AsyncClient", _CaptureAsyncClient)
    _CaptureAsyncClient.requests = []
    gateway = _gateway(None)

    result = await gateway.submit_control(
        HaControlCommand(
            home_id="home-1",
            device_id="device-1",
            request_id="req-1",
            action_type="SET_TEMPERATURE",
            payload={"target_key": "climate.fridge", "value": 4},
        )
    )

    assert result.submitted is False
    assert result.status == "MISCONFIGURED"
    assert result.reason == "HA_CONNECTION_MISSING"
    assert _CaptureAsyncClient.requests == []


@pytest.mark.asyncio
async def test_submit_control_reports_missing_access_token(monkeypatch):
    monkeypatch.setattr(httpx, "AsyncClient", _CaptureAsyncClient)
    _CaptureAsyncClient.requests = []
    row = _connection_row()
    row = SystemConnectionRow(
        id=row.id,
        home_id=row.home_id,
        system_type=row.system_type,
        connection_mode=row.connection_mode,
        base_url_encrypted=row.base_url_encrypted,
        auth_payload_encrypted="{}",
        auth_configured=row.auth_configured,
        connection_status=row.connection_status,
        last_test_at=row.last_test_at,
        last_test_result=row.last_test_result,
        last_sync_at=row.last_sync_at,
        last_sync_result=row.last_sync_result,
        updated_at=row.updated_at,
    )
    gateway = _gateway(row)

    result = await gateway.submit_control(
        HaControlCommand(
            home_id="home-1",
            device_id="device-1",
            request_id="req-1",
            action_type="SET_TEMPERATURE",
            payload={"target_key": "climate.fridge", "value": 4},
        )
    )

    assert result.submitted is False
    assert result.status == "MISCONFIGURED"
    assert result.reason == "HA_TOKEN_MISSING"
    assert _CaptureAsyncClient.requests == []
