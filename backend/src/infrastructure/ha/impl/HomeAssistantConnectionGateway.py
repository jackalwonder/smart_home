from __future__ import annotations

from collections.abc import AsyncIterator
import json

import httpx
import websockets

from src.infrastructure.ha.HomeAssistantBootstrapProvider import HomeAssistantBootstrapProvider
from src.infrastructure.ha.HaConnectionGateway import (
    HaConnectionTestInput,
    HaConnectionTestResult,
    HaRegistryEntry,
    HaRealtimeEvent,
    HaStateEntry,
    HaSyncSnapshot,
)
from src.infrastructure.security.ConnectionSecretCipher import ConnectionSecretCipher
from src.repositories.base.system.SystemConnectionRepository import (
    SystemConnectionRepository,
    SystemConnectionRow,
)


class HomeAssistantConnectionGateway:
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

    def _decode_connection(self, row: SystemConnectionRow) -> tuple[str, dict[str, str]] | None:
        if not row.auth_configured or not row.base_url_encrypted:
            return None
        base_url = self._connection_secret_cipher.decrypt(row.base_url_encrypted)
        if not base_url:
            return None
        auth_payload_raw = self._connection_secret_cipher.decrypt(row.auth_payload_encrypted)
        return base_url.rstrip("/"), self._to_headers(auth_payload_raw)

    async def _load_connection(
        self,
        home_id: str,
    ) -> tuple[str, dict[str, str], str | None] | None:
        row = await self._system_connection_repository.find_by_home_and_type(
            home_id,
            "HOME_ASSISTANT",
        )
        if row is not None:
            decoded = self._decode_connection(row)
            if decoded is None:
                return None
            auth_payload_raw = self._connection_secret_cipher.decrypt(row.auth_payload_encrypted)
            return decoded[0], decoded[1], auth_payload_raw
        bootstrap = self._home_assistant_bootstrap_provider.get_config()
        if bootstrap is None:
            return None
        auth_payload_raw = json.dumps(bootstrap.auth_payload, ensure_ascii=True)
        return bootstrap.base_url.rstrip("/"), self._to_headers(auth_payload_raw), auth_payload_raw

    def _ws_url(self, base_url: str) -> str:
        if base_url.startswith("https://"):
            return f"wss://{base_url.removeprefix('https://')}/api/websocket"
        return f"ws://{base_url.removeprefix('http://')}/api/websocket"

    async def _call_ws_api(
        self,
        base_url: str,
        auth_payload_raw: str | None,
        request_type: str,
        request_id: int,
    ) -> list[dict[str, object]]:
        token = None
        if auth_payload_raw:
            try:
                auth_payload = json.loads(auth_payload_raw)
                token = auth_payload.get("access_token")
            except json.JSONDecodeError:
                token = auth_payload_raw
        if not token:
            return []
        async with websockets.connect(self._ws_url(base_url)) as websocket:
            await websocket.recv()
            await websocket.send(json.dumps({"type": "auth", "access_token": token}))
            await websocket.recv()
            await websocket.send(json.dumps({"id": request_id, "type": request_type}))
            response = json.loads(await websocket.recv())
        result = response.get("result", [])
        return result if isinstance(result, list) else []

    async def test_connection(self, input: HaConnectionTestInput) -> HaConnectionTestResult:
        headers = self._to_headers(json.dumps(input.auth_payload, ensure_ascii=True))
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(f"{input.base_url.rstrip('/')}/api/", headers=headers)
                response.raise_for_status()
            return HaConnectionTestResult(success=True, status="CONNECTED")
        except Exception as exc:
            return HaConnectionTestResult(success=False, status="DISCONNECTED", message=str(exc))

    async def trigger_full_reload(self, home_id: str) -> None:
        config = await self._load_connection(home_id)
        if config is None:
            return
        base_url, headers, _ = config
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.get(f"{base_url}/api/states", headers=headers)
            response.raise_for_status()

    async def fetch_sync_snapshot(self, home_id: str) -> HaSyncSnapshot:
        config = await self._load_connection(home_id)
        if config is None:
            return HaSyncSnapshot(states=[], entity_registry=[], device_registry=[], area_registry=[])
        base_url, headers, auth_payload_raw = config

        async with httpx.AsyncClient(timeout=20.0) as client:
            states_response = await client.get(f"{base_url}/api/states", headers=headers)
            states_response.raise_for_status()
            states_payload = states_response.json()

        entity_registry = await self._call_ws_api(
            base_url,
            auth_payload_raw,
            "config/entity_registry/list",
            1,
        )
        device_registry = await self._call_ws_api(
            base_url,
            auth_payload_raw,
            "config/device_registry/list",
            2,
        )
        area_registry = await self._call_ws_api(
            base_url,
            auth_payload_raw,
            "config/area_registry/list",
            3,
        )

        return HaSyncSnapshot(
            states=[
                HaStateEntry(payload=state)
                for state in states_payload
                if isinstance(state, dict)
            ],
            entity_registry=[
                HaRegistryEntry(payload=entry)
                for entry in entity_registry
                if isinstance(entry, dict)
            ],
            device_registry=[
                HaRegistryEntry(payload=entry)
                for entry in device_registry
                if isinstance(entry, dict)
            ],
            area_registry=[
                HaRegistryEntry(payload=entry)
                for entry in area_registry
                if isinstance(entry, dict)
            ],
        )

    async def stream_realtime_events(self, home_id: str) -> AsyncIterator[HaRealtimeEvent]:
        config = await self._load_connection(home_id)
        if config is None:
            return
        base_url, _, auth_payload_raw = config
        token = None
        if auth_payload_raw:
            try:
                auth_payload = json.loads(auth_payload_raw)
                token = auth_payload.get("access_token")
            except json.JSONDecodeError:
                token = auth_payload_raw
        if not token:
            return

        async with websockets.connect(self._ws_url(base_url)) as websocket:
            await websocket.recv()
            await websocket.send(json.dumps({"type": "auth", "access_token": token}))
            await websocket.recv()

            subscriptions = [
                {"id": 11, "type": "subscribe_events", "event_type": "state_changed"},
                {"id": 12, "type": "subscribe_events", "event_type": "entity_registry_updated"},
                {"id": 13, "type": "subscribe_events", "event_type": "device_registry_updated"},
                {"id": 14, "type": "subscribe_events", "event_type": "area_registry_updated"},
            ]
            for subscription in subscriptions:
                await websocket.send(json.dumps(subscription))
                await websocket.recv()

            async for raw_message in websocket:
                message = json.loads(raw_message)
                if message.get("type") != "event":
                    continue
                event = message.get("event")
                if not isinstance(event, dict):
                    continue
                event_type = event.get("event_type")
                if not event_type:
                    continue
                payload = event.get("data")
                yield HaRealtimeEvent(
                    event_type=str(event_type),
                    payload=payload if isinstance(payload, dict) else {},
                    time_fired=event.get("time_fired"),
                    origin=event.get("origin"),
                )
