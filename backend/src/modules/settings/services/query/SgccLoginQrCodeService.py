from __future__ import annotations

import asyncio
import json
import re
import socket
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote

from src.infrastructure.ha.HaConnectionGateway import HaConnectionGateway, HaStateEntry
from src.repositories.base.energy.EnergyAccountRepository import (
    EnergyAccountRepository,
    EnergyAccountUpsertRow,
)
from src.shared.config.Settings import Settings
from src.shared.errors.AppError import AppError
from src.shared.errors.ErrorCode import ErrorCode

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
ENERGY_PROVIDER = "HOME_ASSISTANT_SGCC"
ENERGY_ENTITY_KEYS = ("yesterday_usage", "monthly_usage", "balance", "yearly_usage")
ENERGY_ENTITY_PREFIXES = {
    "yesterday_usage": "sensor.last_electricity_usage",
    "monthly_usage": "sensor.month_electricity_usage",
    "balance": "sensor.electricity_charge_balance",
    "yearly_usage": "sensor.yearly_electricity_usage",
}
ENERGY_ENTITY_PATTERN = re.compile(
    r"^(sensor\.(?:last_electricity_usage|month_electricity_usage|electricity_charge_balance|yearly_electricity_usage))_(?P<suffix>[a-z0-9_]+)$"
)


@dataclass(frozen=True)
class SgccLoginQrCodeStatusView:
    available: bool
    status: str
    image_url: str | None
    updated_at: str | None
    expires_at: str | None
    age_seconds: int | None
    file_size_bytes: int | None
    mime_type: str | None
    message: str


@dataclass(frozen=True)
class SgccLoginQrCodeFileView:
    path: str
    mime_type: str


@dataclass(frozen=True)
class SgccCachedAccount:
    account_id: str
    timestamp: str


@dataclass(frozen=True)
class SgccAutoBindingResult:
    account_id: str
    entity_map: dict[str, str]
    changed: bool


class SgccContainerRestarter:
    async def restart(self) -> None:
        raise NotImplementedError


class DockerUnixSocketContainerRestarter(SgccContainerRestarter):
    def __init__(self, socket_path: str, container_name: str) -> None:
        self._socket_path = socket_path
        self._container_name = container_name

    async def restart(self) -> None:
        await asyncio.to_thread(self._restart_sync)

    def _restart_sync(self) -> None:
        socket_path = Path(self._socket_path)
        if not socket_path.exists():
            raise AppError(
                ErrorCode.INVALID_PARAMS,
                "Docker socket is not mounted; cannot restart sgcc_electricity.",
                details={"socket_path": self._socket_path},
            )

        target = quote(self._container_name, safe="")
        request = (
            f"POST /containers/{target}/restart?t=0 HTTP/1.1\r\n"
            "Host: docker\r\n"
            "Content-Length: 0\r\n"
            "Connection: close\r\n"
            "\r\n"
        ).encode("ascii")

        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as client:
            client.settimeout(10)
            client.connect(self._socket_path)
            client.sendall(request)
            response = bytearray()
            while True:
                chunk = client.recv(65536)
                if not chunk:
                    break
                response.extend(chunk)

        status_line = bytes(response).split(b"\r\n", 1)[0].decode(
            "ascii",
            errors="replace",
        )
        parts = status_line.split()
        if len(parts) < 2:
            raise AppError(
                ErrorCode.INTERNAL_SERVER_ERROR,
                "Docker returned an invalid response while restarting sgcc_electricity.",
            )
        try:
            status_code = int(parts[1])
        except ValueError as exc:
            raise AppError(
                ErrorCode.INTERNAL_SERVER_ERROR,
                "Docker returned an invalid status code while restarting sgcc_electricity.",
                details={"status_line": status_line},
            ) from exc
        if status_code not in {200, 204, 304}:
            body = bytes(response).split(b"\r\n\r\n", 1)[-1].decode(
                "utf-8",
                errors="replace",
            )
            raise AppError(
                ErrorCode.INTERNAL_SERVER_ERROR,
                "Docker failed to restart sgcc_electricity.",
                details={"status_code": status_code, "response": body[:500]},
            )


class SgccLoginQrCodeService:
    def __init__(
        self,
        settings: Settings,
        energy_account_repository: EnergyAccountRepository | None = None,
        ha_connection_gateway: HaConnectionGateway | None = None,
        container_restarter: SgccContainerRestarter | None = None,
    ) -> None:
        self._qr_code_file = Path(settings.sgcc_qr_code_file)
        self._cache_file = Path(settings.sgcc_cache_file)
        self._qr_code_ttl_seconds = settings.sgcc_qr_code_ttl_seconds
        self._energy_account_repository = energy_account_repository
        self._ha_connection_gateway = ha_connection_gateway
        self._container_restarter = container_restarter or DockerUnixSocketContainerRestarter(
            settings.sgcc_docker_socket_path,
            settings.sgcc_docker_container_name,
        )

    def _build_pending_status(self, message: str) -> SgccLoginQrCodeStatusView:
        return SgccLoginQrCodeStatusView(
            available=False,
            status="PENDING",
            image_url=None,
            updated_at=None,
            expires_at=None,
            age_seconds=None,
            file_size_bytes=None,
            mime_type=None,
            message=message,
        )

    def _build_bound_status(self, binding: SgccAutoBindingResult) -> SgccLoginQrCodeStatusView:
        file_path = self._cache_file
        stat = file_path.stat() if file_path.exists() and file_path.is_file() else None
        if stat is None:
            updated_at = None
            age_seconds = None
            file_size_bytes = None
        else:
            updated_at_datetime = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc)
            updated_at = updated_at_datetime.isoformat()
            age_seconds = max(0, int((datetime.now(timezone.utc) - updated_at_datetime).total_seconds()))
            file_size_bytes = stat.st_size
        action = "saved" if binding.changed else "already saved"
        return SgccLoginQrCodeStatusView(
            available=False,
            status="BOUND",
            image_url=None,
            updated_at=updated_at,
            expires_at=None,
            age_seconds=age_seconds,
            file_size_bytes=file_size_bytes,
            mime_type="application/json" if stat is not None else None,
            message=(
                f"SGCC login data detected and energy binding was {action} "
                f"for account {_mask_account_id(binding.account_id)}."
            ),
        )

    def _build_file_status(
        self,
        *,
        file_path: Path,
        available: bool,
        status: str,
        image_url: str | None,
        mime_type: str | None,
        message: str,
    ) -> SgccLoginQrCodeStatusView:
        stat = file_path.stat()
        updated_at_datetime = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc)
        now = datetime.now(timezone.utc)
        age_seconds = max(0, int((now - updated_at_datetime).total_seconds()))
        expires_at_datetime = updated_at_datetime.timestamp() + self._qr_code_ttl_seconds
        return SgccLoginQrCodeStatusView(
            available=available,
            status=status,
            image_url=image_url,
            updated_at=updated_at_datetime.isoformat(),
            expires_at=datetime.fromtimestamp(
                expires_at_datetime,
                tz=timezone.utc,
            ).isoformat(),
            age_seconds=age_seconds,
            file_size_bytes=stat.st_size,
            mime_type=mime_type,
            message=message,
        )

    async def get_status(
        self,
        home_id: str | None = None,
        terminal_id: str | None = None,
        member_id: str | None = None,
    ) -> SgccLoginQrCodeStatusView:
        binding = await self._try_auto_bind_energy_account(
            home_id=home_id,
            terminal_id=terminal_id,
            member_id=member_id,
        )
        if binding is not None:
            return self._build_bound_status(binding)

        file_path = self._qr_code_file
        if not file_path.exists() or not file_path.is_file():
            return self._build_pending_status(
                (
                    "Waiting for sgcc_electricity to generate a login QR code. "
                    "If it does not appear, check whether the container has switched to QR login."
                ),
            )

        signature = file_path.read_bytes()[: len(PNG_SIGNATURE)]
        if signature != PNG_SIGNATURE:
            return self._build_file_status(
                file_path=file_path,
                available=False,
                status="PENDING",
                image_url=None,
                mime_type=None,
                message=(
                    "The current sgcc_electricity QR file is not a ready PNG yet. "
                    "Please wait for the next QR login attempt."
                ),
            )

        stat = file_path.stat()
        updated_at = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc)
        age_seconds = (datetime.now(timezone.utc) - updated_at).total_seconds()
        if age_seconds > self._qr_code_ttl_seconds:
            return self._build_file_status(
                file_path=file_path,
                available=False,
                status="EXPIRED",
                image_url=None,
                mime_type="image/png",
                message="The current QR code has expired. Generate a new QR code before scanning.",
            )

        return self._build_file_status(
            file_path=file_path,
            available=True,
            status="READY",
            image_url=f"/api/v1/settings/sgcc-login-qrcode/file?v={stat.st_mtime_ns}",
            mime_type="image/png",
            message="QR code is ready. Scan it with the State Grid app to finish login.",
        )

    async def get_file(self) -> SgccLoginQrCodeFileView:
        status = await self.get_status()
        if not status.available:
            raise AppError(
                ErrorCode.NOT_FOUND,
                "sgcc login QR code is not ready",
                details={"status": status.status},
            )

        return SgccLoginQrCodeFileView(
            path=str(self._qr_code_file),
            mime_type="image/png",
        )

    async def regenerate(self) -> SgccLoginQrCodeStatusView:
        file_path = self._qr_code_file
        if file_path.exists() and file_path.is_file():
            file_path.unlink()
        await self._container_restarter.restart()
        return self._build_pending_status(
            "Regenerating the SGCC login QR code. This may take a few minutes while sgcc_electricity retries password login and switches to QR mode."
        )

    async def _try_auto_bind_energy_account(
        self,
        *,
        home_id: str | None,
        terminal_id: str | None,
        member_id: str | None,
    ) -> SgccAutoBindingResult | None:
        if not home_id or self._energy_account_repository is None:
            return None

        accounts = await asyncio.to_thread(_read_cached_accounts, self._cache_file)
        if not accounts:
            return None

        account = accounts[0]
        entity_map = await self._resolve_entity_map(home_id, account.account_id)
        if not _has_complete_entity_map(entity_map):
            return None

        existing = await self._energy_account_repository.find_by_home_id(home_id)
        existing_payload = _decode_energy_payload(existing.account_payload_encrypted if existing else None)
        if (
            existing is not None
            and existing.binding_status == "BOUND"
            and existing_payload.get("account_id") == account.account_id
            and existing_payload.get("entity_map") == entity_map
        ):
            return SgccAutoBindingResult(
                account_id=account.account_id,
                entity_map=entity_map,
                changed=False,
            )

        await self._energy_account_repository.upsert(
            EnergyAccountUpsertRow(
                home_id=home_id,
                binding_status="BOUND",
                account_payload_encrypted=json.dumps(
                    {
                        "provider": ENERGY_PROVIDER,
                        "account_id": account.account_id,
                        "account_suffix": account.account_id,
                        "entity_map": entity_map,
                    },
                    ensure_ascii=True,
                ),
                updated_by_member_id=member_id,
                updated_by_terminal_id=terminal_id,
            )
        )
        return SgccAutoBindingResult(
            account_id=account.account_id,
            entity_map=entity_map,
            changed=True,
        )

    async def _resolve_entity_map(self, home_id: str, account_id: str) -> dict[str, str]:
        suffix = _sgcc_sensor_suffix(account_id)
        if self._ha_connection_gateway is not None:
            try:
                states = await self._ha_connection_gateway.fetch_states(home_id)
            except Exception:
                states = None
            entity_map = _discover_entity_map(states or [], suffix)
            if _has_complete_entity_map(entity_map):
                return entity_map

        if suffix:
            return _entity_ids_for_suffix(suffix)
        return {}


def _read_cached_accounts(cache_file: Path) -> list[SgccCachedAccount]:
    if not cache_file.exists() or not cache_file.is_file():
        return []
    try:
        payload = json.loads(cache_file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    if not isinstance(payload, dict):
        return []

    accounts: list[SgccCachedAccount] = []
    for raw_account_id, raw_value in payload.items():
        account_id = _clean_account_id(raw_account_id)
        if not account_id or not isinstance(raw_value, dict):
            continue
        timestamp = raw_value.get("timestamp")
        accounts.append(
            SgccCachedAccount(
                account_id=account_id,
                timestamp=str(timestamp).strip() if timestamp else "",
            )
        )
    return sorted(accounts, key=lambda item: item.timestamp, reverse=True)


def _clean_account_id(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    cleaned = re.sub(r"[^0-9A-Za-z_-]+", "", value.strip())
    return cleaned or None


def _decode_energy_payload(raw_payload: str | None) -> dict[str, Any]:
    if not raw_payload:
        return {}
    try:
        payload = json.loads(raw_payload)
    except json.JSONDecodeError:
        return {}
    if not isinstance(payload, dict):
        return {}
    entity_map = payload.get("entity_map")
    return {
        "account_id": _clean_account_id(payload.get("account_id") or payload.get("account_suffix")),
        "entity_map": entity_map if isinstance(entity_map, dict) else {},
    }


def _sgcc_sensor_suffix(account_id: str) -> str | None:
    cleaned = re.sub(r"[^a-z0-9]+", "_", account_id.lower()).strip("_")
    if not cleaned:
        return None
    return cleaned[-4:] if len(cleaned) >= 4 else cleaned


def _entity_ids_for_suffix(suffix: str) -> dict[str, str]:
    return {
        key: f"{ENERGY_ENTITY_PREFIXES[key]}_{suffix}"
        for key in ENERGY_ENTITY_KEYS
    }


def _discover_entity_map(states: list[HaStateEntry], expected_suffix: str | None) -> dict[str, str]:
    suffix_map: dict[str, dict[str, str]] = {}
    prefix_to_key = {prefix: key for key, prefix in ENERGY_ENTITY_PREFIXES.items()}
    for state in states:
        entity_id = state.payload.get("entity_id")
        if not isinstance(entity_id, str):
            continue
        match = ENERGY_ENTITY_PATTERN.match(entity_id)
        if not match:
            continue
        key = prefix_to_key.get(entity_id.rsplit("_", 1)[0])
        if key is None:
            continue
        suffix_map.setdefault(match.group("suffix"), {})[key] = entity_id

    if expected_suffix and _has_complete_entity_map(suffix_map.get(expected_suffix, {})):
        return suffix_map[expected_suffix]

    complete_candidates = [
        candidate
        for candidate in suffix_map.values()
        if _has_complete_entity_map(candidate)
    ]
    if len(complete_candidates) == 1:
        return complete_candidates[0]
    return {}


def _has_complete_entity_map(entity_map: dict[str, str]) -> bool:
    return all(bool(entity_map.get(key)) for key in ENERGY_ENTITY_KEYS)


def _mask_account_id(account_id: str) -> str:
    if len(account_id) <= 4:
        return "*" * len(account_id)
    return f"{account_id[:2]}{'*' * max(2, len(account_id) - 4)}{account_id[-2:]}"
