from __future__ import annotations

import json

import httpx
from src.infrastructure.ha.HomeAssistantBootstrapProvider import HomeAssistantBootstrapProvider
from src.infrastructure.ha.HaControlGateway import HaControlCommand
from src.infrastructure.security.ConnectionSecretCipher import ConnectionSecretCipher
from src.repositories.base.system.SystemConnectionRepository import SystemConnectionRepository


class HomeAssistantControlGateway:
    def __init__(
        self,
        system_connection_repository: SystemConnectionRepository,
        connection_secret_cipher: ConnectionSecretCipher,
        home_assistant_bootstrap_provider: HomeAssistantBootstrapProvider,
    ) -> None:
        self._system_connection_repository = system_connection_repository
        self._connection_secret_cipher = connection_secret_cipher
        self._home_assistant_bootstrap_provider = home_assistant_bootstrap_provider

    def _to_headers(self, auth_payload_raw: str | None) -> dict[str, str]:
        headers: dict[str, str] = {}
        if not auth_payload_raw:
            return headers
        try:
            auth_payload = json.loads(auth_payload_raw)
            token = auth_payload.get("access_token")
            if token:
                headers["Authorization"] = f"Bearer {token}"
        except json.JSONDecodeError:
            headers["Authorization"] = f"Bearer {auth_payload_raw}"
        return headers

    async def submit_control(self, command: HaControlCommand) -> None:
        row = await self._system_connection_repository.find_by_home_and_type(
            command.home_id,
            "HOME_ASSISTANT",
        )
        if row is None:
            bootstrap = self._home_assistant_bootstrap_provider.get_config()
            if bootstrap is None:
                return
            base_url = bootstrap.base_url.rstrip("/")
            headers = self._to_headers(json.dumps(bootstrap.auth_payload, ensure_ascii=True))
        else:
            if not row.auth_configured or not row.base_url_encrypted:
                return
            base_url = self._connection_secret_cipher.decrypt(row.base_url_encrypted)
            if not base_url:
                return
            auth_payload_raw = self._connection_secret_cipher.decrypt(row.auth_payload_encrypted)
            headers = self._to_headers(auth_payload_raw)

        service_domain = "homeassistant"
        service_name = "toggle"
        if command.action_type in {"SET_POWER_STATE", "TOGGLE_POWER"}:
            desired = command.payload.get("value")
            service_domain = "switch"
            service_name = "turn_on" if desired in {True, "ON", "on", 1} else "turn_off"

        async with httpx.AsyncClient(timeout=8.0) as client:
            await client.post(
                f"{base_url.rstrip('/')}/api/services/{service_domain}/{service_name}",
                headers=headers,
                json=command.payload,
            )
