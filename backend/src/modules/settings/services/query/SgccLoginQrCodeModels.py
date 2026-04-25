from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from src.infrastructure.ha.HaConnectionGateway import HaStateEntry
from src.modules.settings.services.query.SgccRuntimeControlService import (
    SgccRuntimeAccount,
    SgccRuntimeQrCodeStatus,
    SgccRuntimeStatus,
)

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
ENERGY_PROVIDER = "SGCC_SIDECAR"
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
    phase: str
    qr_code_status: str | None
    job_state: str | None
    job_kind: str | None
    job_phase: str | None
    last_error: str | None
    account_count: int
    latest_account_timestamp: str | None
    image_url: str | None
    updated_at: str | None
    expires_at: str | None
    age_seconds: int | None
    file_size_bytes: int | None
    mime_type: str | None
    message: str


@dataclass(frozen=True)
class SgccLoginQrCodeFileView:
    path: str | None
    mime_type: str
    content: bytes | None = None


@dataclass(frozen=True)
class SgccCachedAccount:
    account_id: str
    timestamp: str


@dataclass(frozen=True)
class SgccAutoBindingResult:
    account_id: str
    entity_map: dict[str, str]
    changed: bool
    timestamp: str = ""


def read_cached_accounts(cache_file: Path) -> list[SgccCachedAccount]:
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
        account_id = clean_account_id(raw_account_id)
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


def accounts_from_runtime_status(
    runtime_status: SgccRuntimeStatus | None,
) -> list[SgccCachedAccount] | None:
    if runtime_status is None:
        return None
    return [
        SgccCachedAccount(
            account_id=account.account_id,
            timestamp=account.timestamp,
        )
        for account in runtime_status.accounts
    ]


def clean_account_id(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    cleaned = re.sub(r"[^0-9A-Za-z_-]+", "", value.strip())
    return cleaned or None


def decode_energy_payload(raw_payload: str | None) -> dict[str, Any]:
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
        "account_id": clean_account_id(payload.get("account_id") or payload.get("account_suffix")),
        "entity_map": entity_map if isinstance(entity_map, dict) else {},
    }


def sgcc_sensor_suffix(account_id: str) -> str | None:
    cleaned = re.sub(r"[^a-z0-9]+", "_", account_id.lower()).strip("_")
    if not cleaned:
        return None
    return cleaned[-4:] if len(cleaned) >= 4 else cleaned


def entity_ids_for_suffix(suffix: str) -> dict[str, str]:
    return {key: f"{ENERGY_ENTITY_PREFIXES[key]}_{suffix}" for key in ENERGY_ENTITY_KEYS}


def discover_entity_map(states: list[HaStateEntry], expected_suffix: str | None) -> dict[str, str]:
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

    if expected_suffix and has_complete_entity_map(suffix_map.get(expected_suffix, {})):
        return suffix_map[expected_suffix]

    complete_candidates = [
        candidate
        for candidate in suffix_map.values()
        if has_complete_entity_map(candidate)
    ]
    if len(complete_candidates) == 1:
        return complete_candidates[0]
    return {}


def has_complete_entity_map(entity_map: dict[str, str]) -> bool:
    return all(bool(entity_map.get(key)) for key in ENERGY_ENTITY_KEYS)


def mask_account_id(account_id: str) -> str:
    if len(account_id) <= 4:
        return "*" * len(account_id)
    return f"{account_id[:2]}{'*' * max(2, len(account_id) - 4)}{account_id[-2:]}"


def phase_from_qrcode_status(status: str | None) -> str:
    normalized = (status or "").upper()
    if normalized == "READY":
        return "QR_READY"
    if normalized == "EXPIRED":
        return "QR_EXPIRED"
    return "WAITING_FOR_QR_CODE"


def phase_from_runtime_status(
    runtime_status: SgccRuntimeStatus,
    qrcode: SgccRuntimeQrCodeStatus | None,
) -> str:
    job_state = (runtime_status.job_state or runtime_status.state or "").upper()
    job_phase = (runtime_status.job_phase or "").upper()
    job_kind = (runtime_status.job_kind or "").upper()
    if job_state == "RUNNING":
        if job_phase in {"FETCHING_DATA", "DATA_READY"}:
            return job_phase
        if job_phase == "WAITING_FOR_SCAN":
            return "WAITING_FOR_SCAN"
        if job_kind == "FETCH":
            return "FETCHING_DATA"
        return "LOGIN_RUNNING"
    if job_state == "FAILED":
        if runtime_status.last_error == "LOGIN_REQUIRED":
            return "WAITING_FOR_SCAN"
        return "FAILED"
    if runtime_status.accounts:
        return "DATA_READY"
    return phase_from_qrcode_status(qrcode.status if qrcode else None)


def latest_account_timestamp(accounts: list[SgccRuntimeAccount]) -> str | None:
    timestamps = [account.timestamp for account in accounts if account.timestamp]
    return max(timestamps) if timestamps else None


def runtime_phase_message(
    phase: str,
    runtime_status: SgccRuntimeStatus,
    fallback: str,
) -> str:
    if phase == "LOGIN_RUNNING":
        return "SGCC login is running. Scan the QR code if one is available."
    if phase == "WAITING_FOR_SCAN":
        return "SGCC is waiting for QR code scan confirmation."
    if phase == "FETCHING_DATA":
        return "SGCC login succeeded. Fetching account and electricity data."
    if phase == "DATA_READY":
        account_count = len(runtime_status.accounts)
        if account_count:
            return f"SGCC data is ready for {account_count} account(s)."
        return "SGCC data fetch completed."
    if phase == "QR_EXPIRED":
        return "The current QR code has expired. This does not necessarily mean the SGCC session has expired."
    return fallback


def runtime_status_view(
    runtime_status: SgccRuntimeStatus,
    *,
    available: bool,
    status: str,
    phase: str,
    image_url: str | None,
    message: str,
) -> SgccLoginQrCodeStatusView:
    return SgccLoginQrCodeStatusView(
        available=available,
        status=status,
        phase=phase,
        qr_code_status=None,
        job_state=runtime_status.job_state,
        job_kind=runtime_status.job_kind,
        job_phase=runtime_status.job_phase,
        last_error=runtime_status.last_error,
        account_count=len(runtime_status.accounts),
        latest_account_timestamp=latest_account_timestamp(runtime_status.accounts),
        image_url=image_url,
        updated_at=None,
        expires_at=None,
        age_seconds=None,
        file_size_bytes=None,
        mime_type=None,
        message=message,
    )
