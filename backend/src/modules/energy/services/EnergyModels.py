from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from src.infrastructure.ha.HaConnectionGateway import HaStateEntry
from src.repositories.base.energy.EnergySnapshotRepository import EnergySnapshotRow
from src.shared.errors.AppError import AppError
from src.shared.errors.ErrorCode import ErrorCode

ENERGY_PROVIDER = "SGCC_SIDECAR"
LEGACY_ENERGY_PROVIDERS = {"HOME_ASSISTANT_SGCC"}
SUPPORTED_ENERGY_PROVIDERS = {ENERGY_PROVIDER, *LEGACY_ENERGY_PROVIDERS}
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
UNAVAILABLE_STATES = {"", "unknown", "unavailable", "none", "null"}

SUCCESS_UPDATED = "SUCCESS_UPDATED"
SUCCESS_STALE_SOURCE = "SUCCESS_STALE_SOURCE"
FAILED_UPSTREAM_TRIGGER = "FAILED_UPSTREAM_TRIGGER"
FAILED_SOURCE_TIMEOUT = "FAILED_SOURCE_TIMEOUT"


@dataclass(frozen=True)
class EnergyView:
    binding_status: str
    refresh_status: str | None
    yesterday_usage: float | None
    monthly_usage: float | None
    balance: float | None
    yearly_usage: float | None
    updated_at: str | None
    system_updated_at: str | None
    source_updated_at: str | None
    cache_mode: bool
    last_error_code: str | None
    refresh_status_detail: str | None
    provider: str | None
    account_id_masked: str | None
    entity_map: dict[str, str]


@dataclass(frozen=True)
class EnergyBindingView:
    saved: bool
    binding_status: str
    updated_at: str
    message: str


@dataclass(frozen=True)
class EnergyRefreshView:
    accepted: bool
    refresh_status: str
    started_at: str
    timeout_seconds: int
    upstream_triggered: bool
    source_updated: bool
    source_updated_at: str | None
    system_updated_at: str | None
    refresh_status_detail: str


@dataclass(frozen=True)
class EnergyAutoRefreshView:
    refreshed_count: int
    success_count: int
    failed_count: int


@dataclass(frozen=True)
class EnergyRefreshOutcome:
    snapshot: EnergySnapshotRow
    upstream_triggered: bool
    source_updated: bool
    refresh_status_detail: str


@dataclass(frozen=True)
class EnergyStatesView:
    states_by_entity_id: dict[str, HaStateEntry]


@dataclass(frozen=True)
class UpstreamWaitResult:
    states_by_entity_id: dict[str, HaStateEntry] | None
    source_updated: bool
    error_code: str | None = None


@dataclass(frozen=True)
class SgccCacheValues:
    yesterday_usage: float
    monthly_usage: float
    yearly_usage: float
    balance: float
    source_updated_at: str | None


@dataclass(frozen=True)
class EnergyBindingPayload:
    provider: str | None
    account_id: str | None
    entity_map: dict[str, str]

    def to_json(self) -> dict[str, Any]:
        payload: dict[str, Any] = {"provider": self.provider or ENERGY_PROVIDER}
        if self.account_id:
            payload["account_id"] = self.account_id
            payload["account_suffix"] = self.account_id
        if self.entity_map:
            payload["entity_map"] = self.entity_map
        return payload

    def resolve_entity_ids(self, states_by_entity_id: dict[str, HaStateEntry] | None = None) -> dict[str, str]:
        entity_ids: dict[str, str] = dict(self.entity_map)
        if len(entity_ids) == len(ENERGY_ENTITY_KEYS):
            return entity_ids

        suffix = _entity_suffix(self.account_id)
        if states_by_entity_id:
            discovered = _discover_entity_ids_from_states(states_by_entity_id)
            if suffix and suffix in discovered:
                for key, entity_id in discovered[suffix].items():
                    entity_ids.setdefault(key, entity_id)
                if _has_complete_entity_map(entity_ids):
                    return entity_ids

            complete_candidates = [
                candidate
                for candidate in discovered.values()
                if _has_complete_entity_map(candidate)
            ]
            if len(complete_candidates) == 1:
                for key, entity_id in complete_candidates[0].items():
                    entity_ids.setdefault(key, entity_id)
                if _has_complete_entity_map(entity_ids):
                    return entity_ids

        if suffix:
            suffix_entity_ids = _entity_ids_for_suffix(suffix)
            for key in ENERGY_ENTITY_KEYS:
                entity_ids.setdefault(key, suffix_entity_ids[key])
            if _has_complete_entity_map(entity_ids) and (
                states_by_entity_id is None or _entity_map_exists_in_states(entity_ids, states_by_entity_id)
            ):
                return entity_ids
        for key in ENERGY_ENTITY_KEYS:
            if key not in entity_ids:
                return entity_ids
        return entity_ids


def _decode_binding_payload(raw_payload: str | None) -> EnergyBindingPayload:
    if not raw_payload:
        return EnergyBindingPayload(provider=None, account_id=None, entity_map={})
    try:
        payload = json.loads(raw_payload)
    except json.JSONDecodeError:
        return EnergyBindingPayload(provider=None, account_id=None, entity_map={})
    if not isinstance(payload, dict):
        return EnergyBindingPayload(provider=None, account_id=None, entity_map={})
    return EnergyBindingPayload(
        provider=_normalize_provider(payload.get("provider")),
        account_id=_clean_optional_string(
            payload.get("account_id") or payload.get("account_suffix") or payload.get("account")
        ),
        entity_map=_sanitize_entity_map(payload.get("entity_map")),
    )


def _normalize_binding_payload(payload: dict) -> EnergyBindingPayload:
    provider = _normalize_provider(payload.get("provider"))
    if provider not in SUPPORTED_ENERGY_PROVIDERS:
        raise AppError(
            ErrorCode.INVALID_PARAMS,
            "Only SGCC_SIDECAR energy provider is supported",
            status_code=400,
        )
    account_id = _clean_optional_string(payload.get("account_id") or payload.get("account_suffix"))
    entity_map = _sanitize_entity_map(payload.get("entity_map"))
    if not account_id and not entity_map:
        raise AppError(
            ErrorCode.INVALID_PARAMS,
            "Energy binding requires an account id or at least one Home Assistant entity mapping",
            status_code=400,
        )
    return EnergyBindingPayload(provider=provider, account_id=account_id, entity_map=entity_map)


def _normalize_provider(value: object) -> str:
    provider = str(value or ENERGY_PROVIDER).strip().upper()
    if provider in LEGACY_ENERGY_PROVIDERS:
        return ENERGY_PROVIDER
    return provider


def _sanitize_entity_map(raw_entity_map: object) -> dict[str, str]:
    if not isinstance(raw_entity_map, dict):
        return {}
    entity_map: dict[str, str] = {}
    for key in ENERGY_ENTITY_KEYS:
        value = _clean_optional_string(raw_entity_map.get(key))
        if value:
            entity_map[key] = value
    return entity_map


def _clean_optional_string(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    cleaned = value.strip()
    return cleaned or None


def _mask_account_id(account_id: str | None) -> str | None:
    if not account_id:
        return None
    if len(account_id) <= 4:
        return "*" * len(account_id)
    return f"{account_id[:2]}{'*' * max(2, len(account_id) - 4)}{account_id[-2:]}"


def _entity_suffix(account_id: str | None) -> str | None:
    if not account_id:
        return None
    suffix = re.sub(r"[^a-z0-9]+", "_", account_id.lower()).strip("_")
    return suffix or None


def _entity_ids_for_suffix(suffix: str) -> dict[str, str]:
    return {key: f"{ENERGY_ENTITY_PREFIXES[key]}_{suffix}" for key in ENERGY_ENTITY_KEYS}


def _discover_entity_ids_from_states(
    states_by_entity_id: dict[str, HaStateEntry],
) -> dict[str, dict[str, str]]:
    suffix_map: dict[str, dict[str, str]] = {}
    prefix_to_key = {prefix: key for key, prefix in ENERGY_ENTITY_PREFIXES.items()}
    for entity_id in states_by_entity_id:
        match = ENERGY_ENTITY_PATTERN.match(entity_id)
        if not match:
            continue
        suffix = match.group("suffix")
        key = prefix_to_key.get(entity_id.rsplit("_", 1)[0])
        if key is None:
            continue
        suffix_map.setdefault(suffix, {})[key] = entity_id
    return suffix_map


def _has_complete_entity_map(entity_map: dict[str, str]) -> bool:
    return all(bool(entity_map.get(key)) for key in ENERGY_ENTITY_KEYS)


def _entity_map_exists_in_states(
    entity_map: dict[str, str],
    states_by_entity_id: dict[str, HaStateEntry],
) -> bool:
    return all(entity_id in states_by_entity_id for entity_id in entity_map.values())


def _extract_energy_values(
    entity_ids: dict[str, str],
    states_by_entity_id: dict[str, HaStateEntry],
) -> tuple[dict[str, float], str | None] | str:
    values: dict[str, float] = {}
    source_updated_at: str | None = None
    for key in ENERGY_ENTITY_KEYS:
        entity_id = entity_ids.get(key)
        if not entity_id:
            return f"MISSING_ENTITY_{key.upper()}"
        state = states_by_entity_id.get(entity_id)
        if state is None:
            return f"ENTITY_NOT_FOUND_{key.upper()}"
        parsed = _parse_ha_numeric_state(state)
        if parsed is None:
            return f"INVALID_ENTITY_STATE_{key.upper()}"
        values[key] = parsed
        source_updated_at = _max_iso(source_updated_at, _state_timestamp(state))
    return values, source_updated_at


def _read_sgcc_cache_values(cache_file: Path, account_id: str | None) -> SgccCacheValues | None:
    if not cache_file.exists() or not cache_file.is_file():
        return None
    try:
        payload = json.loads(cache_file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(payload, dict):
        return None

    account_payload = _select_sgcc_cache_account(payload, account_id)
    if account_payload is None:
        return None

    yesterday_usage = _parse_numeric_value(account_payload.get("last_daily_usage"))
    monthly_usage = _parse_numeric_value(account_payload.get("month_usage"))
    yearly_usage = _parse_numeric_value(account_payload.get("yearly_usage"))
    balance = _parse_numeric_value(account_payload.get("balance"))
    if (
        yesterday_usage is None
        or monthly_usage is None
        or yearly_usage is None
        or balance is None
    ):
        return None

    timestamp = account_payload.get("timestamp")
    return SgccCacheValues(
        yesterday_usage=yesterday_usage,
        monthly_usage=monthly_usage,
        yearly_usage=yearly_usage,
        balance=balance,
        source_updated_at=str(timestamp).strip() if timestamp else None,
    )


def _select_sgcc_cache_account(payload: dict[str, Any], account_id: str | None) -> dict[str, Any] | None:
    if account_id:
        account_payload = payload.get(account_id)
        return account_payload if isinstance(account_payload, dict) else None

    account_payloads = [value for value in payload.values() if isinstance(value, dict)]
    if len(account_payloads) == 1:
        return account_payloads[0]
    return None


def _collect_source_updated_at(
    entity_ids: dict[str, str],
    states_by_entity_id: dict[str, HaStateEntry],
) -> str | None:
    source_updated_at: str | None = None
    for entity_id in entity_ids.values():
        if not entity_id:
            continue
        state = states_by_entity_id.get(entity_id)
        if state is None:
            continue
        source_updated_at = _max_iso(source_updated_at, _state_timestamp(state))
    return source_updated_at


def _parse_ha_numeric_state(state: HaStateEntry) -> float | None:
    return _parse_numeric_value(state.payload.get("state"))


def _parse_numeric_value(value: object) -> float | None:
    if value is None:
        return None
    normalized = str(value).strip()
    if normalized.lower() in UNAVAILABLE_STATES:
        return None
    normalized = normalized.replace(",", "")
    try:
        return float(normalized)
    except ValueError:
        match = re.search(r"-?\d+(?:\.\d+)?", normalized)
        return float(match.group(0)) if match else None


def _state_timestamp(state: HaStateEntry | None) -> str | None:
    if state is None:
        return None
    for key in ("last_updated", "last_changed"):
        value = state.payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _max_iso(left: str | None, right: str | None) -> str | None:
    if not left:
        return right
    if not right:
        return left
    return max(left, right)


def _is_iso_newer(current: str | None, previous: str | None) -> bool:
    if not current:
        return False
    if not previous:
        return True
    return current > previous


def _derive_refresh_status_detail(snapshot: EnergySnapshotRow) -> str:
    if snapshot.refresh_status == "SUCCESS":
        if snapshot.last_error_code == "SOURCE_NOT_UPDATED":
            return SUCCESS_STALE_SOURCE
        return SUCCESS_UPDATED
    if snapshot.last_error_code == FAILED_UPSTREAM_TRIGGER:
        return FAILED_UPSTREAM_TRIGGER
    if snapshot.last_error_code == FAILED_SOURCE_TIMEOUT:
        return FAILED_SOURCE_TIMEOUT
    return snapshot.refresh_status


def _has_energy_values(snapshot: EnergySnapshotRow | None) -> bool:
    return bool(
        snapshot
        and (
            snapshot.yesterday_usage is not None
            or snapshot.monthly_usage is not None
            or snapshot.yearly_usage is not None
            or snapshot.balance is not None
        )
    )
