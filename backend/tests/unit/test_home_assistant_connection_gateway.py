from __future__ import annotations

import httpx
import pytest

from src.infrastructure.ha.HomeAssistantBootstrapProvider import HomeAssistantBootstrapConfig
from src.infrastructure.ha.impl.HomeAssistantConnectionGateway import HomeAssistantConnectionGateway
from src.repositories.base.system.SystemConnectionRepository import SystemConnectionRow


class _CaptureAsyncClient:
    requests: list[dict] = []

    def __init__(self, **_kwargs) -> None:
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args) -> None:
        return None

    async def get(self, url, *, headers=None):
        self.requests.append({"url": url, "headers": headers or {}})
        if headers == {"Authorization": "Bearer stale-token"}:
            return httpx.Response(401, request=httpx.Request("GET", url))
        return httpx.Response(
            200,
            request=httpx.Request("GET", url),
            json=[{"entity_id": "sensor.last_electricity_usage_83920123", "state": "2.5"}],
        )


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
        connection_mode="TOKEN",
        base_url_encrypted="http://ha.test",
        auth_payload_encrypted='{"access_token":"stale-token"}',
        auth_configured=True,
        connection_status="CONNECTED",
        last_test_at=None,
        last_test_result=None,
        last_sync_at=None,
        last_sync_result=None,
        updated_at="2026-04-20T00:00:00+00:00",
    )


@pytest.mark.asyncio
async def test_fetch_states_falls_back_to_bootstrap_token_after_saved_token_unauthorized(monkeypatch):
    monkeypatch.setattr(httpx, "AsyncClient", _CaptureAsyncClient)
    _CaptureAsyncClient.requests = []
    gateway = HomeAssistantConnectionGateway(
        system_connection_repository=_SystemConnectionRepository(_connection_row()),
        connection_secret_cipher=_Cipher(),
        home_assistant_bootstrap_provider=_BootstrapProvider(
            HomeAssistantBootstrapConfig(
                connection_mode="TOKEN",
                base_url="http://ha.test",
                auth_payload={"access_token": "bootstrap-token"},
            )
        ),
    )

    states = await gateway.fetch_states("home-1")

    assert states is not None
    assert len(states) == 1
    assert states[0].payload["entity_id"] == "sensor.last_electricity_usage_83920123"
    assert _CaptureAsyncClient.requests == [
        {
            "url": "http://ha.test/api/states",
            "headers": {"Authorization": "Bearer stale-token"},
        },
        {
            "url": "http://ha.test/api/states",
            "headers": {"Authorization": "Bearer bootstrap-token"},
        },
    ]
