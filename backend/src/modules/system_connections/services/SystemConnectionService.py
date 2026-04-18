from __future__ import annotations

import json
from dataclasses import dataclass, field
from urllib.parse import urlparse
from typing import Any

from src.infrastructure.ha.HomeAssistantBootstrapProvider import HomeAssistantBootstrapProvider
from src.infrastructure.ha.HaConnectionGateway import (
    HaConnectionGateway,
    HaConnectionTestInput,
)
from src.infrastructure.security.ConnectionSecretCipher import ConnectionSecretCipher
from src.modules.auth.services.guard.ManagementPinGuard import ManagementPinGuard
from src.modules.system_connections.services.HaEntitySyncService import HaEntitySyncService
from src.repositories.base.system.SystemConnectionRepository import (
    SystemConnectionRepository,
    SystemConnectionUpsertRow,
)
from src.repositories.base.settings.SettingsVersionRepository import SettingsVersionRepository
from src.shared.errors.AppError import AppError
from src.shared.errors.ErrorCode import ErrorCode
from src.shared.kernel.Clock import Clock
from src.shared.kernel.RepoContext import RepoContext
from src.shared.kernel.UnitOfWork import UnitOfWork


@dataclass(frozen=True)
class SystemConnectionView:
    connection_mode: str | None
    base_url_masked: str | None
    connection_status: str
    auth_configured: bool
    settings_version: str | None
    last_test_at: str | None
    last_test_result: str | None
    last_sync_at: str | None
    last_sync_result: str | None


@dataclass(frozen=True)
class SystemConnectionSaveView:
    saved: bool
    connection_status: str
    updated_at: str
    message: str


@dataclass(frozen=True)
class SystemConnectionTestView:
    tested: bool
    connection_status: str
    latency_ms: int | None
    tested_at: str
    message: str | None


@dataclass(frozen=True)
class HomeAssistantCandidateConfig:
    connection_mode: str = "TOKEN"
    base_url: str = ""
    auth_payload: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class DeviceReloadView:
    accepted: bool
    reload_status: str
    started_at: str
    message: str


def _mask_url(value: str | None) -> str | None:
    if not value:
        return None
    parsed = urlparse(value)
    if not parsed.scheme or not parsed.netloc:
        return "***"
    host = parsed.hostname or "***"
    if parsed.port is not None:
        return f"{parsed.scheme}://{host}:{parsed.port}"
    return f"{parsed.scheme}://{host}"


class SystemConnectionService:
    def __init__(
        self,
        system_connection_repository: SystemConnectionRepository,
        settings_version_repository: SettingsVersionRepository,
        management_pin_guard: ManagementPinGuard,
        ha_connection_gateway: HaConnectionGateway,
        ha_entity_sync_service: HaEntitySyncService,
        home_assistant_bootstrap_provider: HomeAssistantBootstrapProvider,
        connection_secret_cipher: ConnectionSecretCipher,
        unit_of_work: UnitOfWork,
        clock: Clock,
    ) -> None:
        self._system_connection_repository = system_connection_repository
        self._settings_version_repository = settings_version_repository
        self._management_pin_guard = management_pin_guard
        self._ha_connection_gateway = ha_connection_gateway
        self._ha_entity_sync_service = ha_entity_sync_service
        self._home_assistant_bootstrap_provider = home_assistant_bootstrap_provider
        self._connection_secret_cipher = connection_secret_cipher
        self._unit_of_work = unit_of_work
        self._clock = clock

    def _encrypt_connection(
        self,
        base_url: str,
        auth_payload: dict[str, Any],
    ) -> tuple[str | None, str | None]:
        return (
            self._connection_secret_cipher.encrypt(base_url.rstrip("/")),
            self._connection_secret_cipher.encrypt(json.dumps(auth_payload, ensure_ascii=True)),
        )

    def _decrypt_base_url(self, encrypted_value: str | None) -> str | None:
        if encrypted_value is None:
            return None
        try:
            return self._connection_secret_cipher.decrypt(encrypted_value)
        except Exception:
            return None

    def _decrypt_auth_payload(self, encrypted_value: str | None) -> dict[str, Any]:
        if encrypted_value is None:
            return {}
        try:
            raw_payload = self._connection_secret_cipher.decrypt(encrypted_value)
        except Exception:
            return {}
        if not raw_payload:
            return {}
        try:
            decoded = json.loads(raw_payload)
        except json.JSONDecodeError:
            return {"access_token": raw_payload}
        return decoded if isinstance(decoded, dict) else {}

    async def _ensure_bootstrap_connection(
        self,
        home_id: str,
    ):
        connection = await self._system_connection_repository.find_by_home_and_type(
            home_id,
            "HOME_ASSISTANT",
        )
        if connection is not None:
            return connection
        bootstrap = self._home_assistant_bootstrap_provider.get_config()
        if bootstrap is None:
            return None
        encrypted_base_url, encrypted_auth_payload = self._encrypt_connection(
            bootstrap.base_url,
            bootstrap.auth_payload,
        )
        return await self._system_connection_repository.upsert(
            SystemConnectionUpsertRow(
                home_id=home_id,
                system_type="HOME_ASSISTANT",
                connection_mode=bootstrap.connection_mode,
                base_url_encrypted=encrypted_base_url,
                auth_payload_encrypted=encrypted_auth_payload,
                auth_configured=True,
                connection_status="DISCONNECTED",
            )
        )

    async def get_system_connections(self, home_id: str) -> list[SystemConnectionView]:
        settings_version = await self._settings_version_repository.find_current_by_home(home_id)
        connection = await self._system_connection_repository.find_by_home_and_type(
            home_id,
            "HOME_ASSISTANT",
        )
        if connection is None:
            bootstrap = self._home_assistant_bootstrap_provider.get_config()
            if bootstrap is None:
                return []
            return [
                SystemConnectionView(
                    connection_mode=bootstrap.connection_mode,
                    base_url_masked=_mask_url(bootstrap.base_url),
                    connection_status="DISCONNECTED",
                    auth_configured=True,
                    settings_version=settings_version.settings_version if settings_version else None,
                    last_test_at=None,
                    last_test_result=None,
                    last_sync_at=None,
                    last_sync_result=None,
                )
            ]
        return [
            SystemConnectionView(
                connection_mode=connection.connection_mode,
                base_url_masked=_mask_url(self._decrypt_base_url(connection.base_url_encrypted)),
                connection_status=connection.connection_status,
                auth_configured=connection.auth_configured,
                settings_version=settings_version.settings_version if settings_version else None,
                last_test_at=connection.last_test_at,
                last_test_result=connection.last_test_result,
                last_sync_at=connection.last_sync_at,
                last_sync_result=connection.last_sync_result,
            )
        ]

    async def save_home_assistant(
        self,
        home_id: str,
        terminal_id: str,
        connection_mode: str,
        base_url: str,
        auth_payload: dict[str, Any],
        member_id: str | None = None,
    ) -> SystemConnectionSaveView:
        await self._management_pin_guard.require_active_session(home_id, terminal_id)
        encrypted_base_url, encrypted_auth_payload = self._encrypt_connection(base_url, auth_payload)
        row = await self._system_connection_repository.upsert(
            SystemConnectionUpsertRow(
                home_id=home_id,
                system_type="HOME_ASSISTANT",
                connection_mode=connection_mode,
                base_url_encrypted=encrypted_base_url,
                auth_payload_encrypted=encrypted_auth_payload,
                auth_configured=True,
                connection_status="DISCONNECTED",
            )
        )
        return SystemConnectionSaveView(
            saved=True,
            connection_status=row.connection_status,
            updated_at=row.updated_at,
            message="System connection saved",
        )

    async def test_home_assistant(
        self,
        home_id: str,
        terminal_id: str,
        *,
        use_saved_config: bool,
        candidate_config: HomeAssistantCandidateConfig | None,
    ) -> SystemConnectionTestView:
        await self._management_pin_guard.require_active_session(home_id, terminal_id)
        saved_connection = None
        if candidate_config is not None:
            base_url = candidate_config.base_url
            auth_payload = candidate_config.auth_payload
        else:
            if not use_saved_config:
                raise AppError(
                    ErrorCode.INVALID_PARAMS,
                    "candidate_config is required when use_saved_config is false",
                    details={
                        "fields": [
                            {
                                "field": "candidate_config",
                                "reason": "required_when_not_using_saved_config",
                            }
                        ]
                    },
                )
            saved_connection = await self._ensure_bootstrap_connection(home_id)
            if saved_connection is None:
                raise AppError(
                    ErrorCode.INVALID_PARAMS,
                    "No saved Home Assistant configuration available",
                    details={
                        "fields": [
                            {
                                "field": "use_saved_config",
                                "reason": "no_saved_config",
                            }
                        ]
                    },
                )
            base_url = self._decrypt_base_url(saved_connection.base_url_encrypted)
            if not base_url:
                raise AppError(
                    ErrorCode.INVALID_PARAMS,
                    "Saved Home Assistant configuration is invalid",
                    details={
                        "fields": [
                            {
                                "field": "use_saved_config",
                                "reason": "invalid_saved_config",
                            }
                        ]
                    },
                )
            auth_payload = self._decrypt_auth_payload(saved_connection.auth_payload_encrypted)

        started_at = self._clock.now()
        result = await self._ha_connection_gateway.test_connection(
            HaConnectionTestInput(base_url=base_url.rstrip("/"), auth_payload=auth_payload)
        )
        tested_at = self._clock.now().isoformat()
        if saved_connection is not None:
            await self._system_connection_repository.upsert(
                SystemConnectionUpsertRow(
                    home_id=home_id,
                    system_type=saved_connection.system_type,
                    connection_mode=saved_connection.connection_mode,
                    base_url_encrypted=saved_connection.base_url_encrypted,
                    auth_payload_encrypted=saved_connection.auth_payload_encrypted,
                    auth_configured=saved_connection.auth_configured,
                    connection_status=result.status,
                    last_test_at=tested_at,
                    last_test_result=result.message or result.status,
                    last_sync_at=saved_connection.last_sync_at,
                    last_sync_result=saved_connection.last_sync_result,
                )
            )
        latency_ms = max(
            int((self._clock.now() - started_at).total_seconds() * 1000),
            0,
        )
        return SystemConnectionTestView(
            tested=result.success,
            connection_status=result.status,
            latency_ms=latency_ms,
            tested_at=tested_at,
            message=result.message,
        )

    async def reload_devices(
        self,
        home_id: str,
        terminal_id: str,
        *,
        force_full_sync: bool = False,
    ) -> DeviceReloadView:
        await self._management_pin_guard.require_active_session(home_id, terminal_id)
        connection = await self._ensure_bootstrap_connection(home_id)
        now_iso = self._clock.now().isoformat()
        if connection is None:
            return DeviceReloadView(
                accepted=False,
                reload_status="REJECTED",
                started_at=now_iso,
                message="No connection configuration available",
            )
        try:
            if force_full_sync:
                await self._ha_connection_gateway.trigger_full_reload(home_id)
            snapshot = await self._ha_connection_gateway.fetch_sync_snapshot(home_id)

            async def _transaction(tx) -> DeviceReloadView:
                summary = await self._ha_entity_sync_service.sync_home(home_id, snapshot, tx)
                await self._system_connection_repository.upsert(
                    SystemConnectionUpsertRow(
                        home_id=home_id,
                        system_type=connection.system_type,
                        connection_mode=connection.connection_mode,
                        base_url_encrypted=connection.base_url_encrypted,
                        auth_payload_encrypted=connection.auth_payload_encrypted,
                        auth_configured=connection.auth_configured,
                        connection_status="CONNECTED",
                        last_test_at=connection.last_test_at,
                        last_test_result=connection.last_test_result,
                        last_sync_at=now_iso,
                        last_sync_result=json.dumps(summary.__dict__, ensure_ascii=True),
                    ),
                    ctx=RepoContext(tx=tx),
                )
                return DeviceReloadView(
                    accepted=True,
                    reload_status="ACCEPTED",
                    started_at=now_iso,
                    message=(
                        f"Reloaded {summary.device_count} devices, "
                        f"{summary.entity_count} entities across {summary.room_count} rooms"
                    ),
                )

            return await self._unit_of_work.run_in_transaction(_transaction)
        except Exception as exc:
            await self._system_connection_repository.upsert(
                SystemConnectionUpsertRow(
                    home_id=home_id,
                    system_type=connection.system_type,
                    connection_mode=connection.connection_mode,
                    base_url_encrypted=connection.base_url_encrypted,
                    auth_payload_encrypted=connection.auth_payload_encrypted,
                    auth_configured=connection.auth_configured,
                    connection_status="DEGRADED",
                    last_test_at=connection.last_test_at,
                    last_test_result=connection.last_test_result,
                    last_sync_at=now_iso,
                    last_sync_result=str(exc),
                )
            )
            return DeviceReloadView(
                accepted=False,
                reload_status="REJECTED",
                started_at=now_iso,
                message=str(exc),
            )
