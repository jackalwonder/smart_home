from __future__ import annotations

import json
from typing import Any

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

    def _entity_domain(self, entity_id: str | None) -> str | None:
        if not entity_id or "." not in entity_id:
            return None
        return entity_id.split(".", 1)[0]

    def _build_service_call(
        self,
        command: HaControlCommand,
    ) -> tuple[str, str, dict[str, Any]] | None:
        entity_id = command.payload.get("target_key")
        if not isinstance(entity_id, str) or "." not in entity_id:
            return None

        entity_domain = self._entity_domain(entity_id)
        if entity_domain is None:
            return None

        service_data: dict[str, Any] = {"entity_id": entity_id}
        value = command.payload.get("value")

        if command.action_type in {"SET_POWER_STATE", "TOGGLE_POWER"}:
            service_name = "turn_on" if value in {True, "ON", "on", 1} else "turn_off"
            return entity_domain, service_name, service_data

        if command.action_type == "SET_TEMPERATURE":
            service_data["temperature"] = value
            return "climate", "set_temperature", service_data

        if command.action_type == "SET_MODE":
            if entity_domain == "climate":
                service_data["hvac_mode"] = value
                return "climate", "set_hvac_mode", service_data
            if entity_domain == "select":
                service_data["option"] = value
                return "select", "select_option", service_data
            return None

        if command.action_type == "SET_VALUE":
            service_data["value"] = value
            return "number", "set_value", service_data

        if command.action_type == "SET_POSITION":
            service_data["position"] = value
            return "cover", "set_cover_position", service_data

        if command.action_type == "EXECUTE_ACTION":
            return entity_domain, "press", service_data

        return None

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

        service_call = self._build_service_call(command)
        if service_call is None:
            return
        service_domain, service_name, service_data = service_call

        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.post(
                f"{base_url.rstrip('/')}/api/services/{service_domain}/{service_name}",
                headers=headers,
                json=service_data,
            )
            response.raise_for_status()
