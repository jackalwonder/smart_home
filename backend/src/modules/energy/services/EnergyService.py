from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from src.infrastructure.ha.HaConnectionGateway import HaConnectionGateway, HaStateEntry
from src.modules.auth.services.guard.ManagementPinGuard import ManagementPinGuard
from src.repositories.base.energy.EnergyAccountRepository import EnergyAccountRepository, EnergyAccountUpsertRow
from src.repositories.base.energy.EnergySnapshotRepository import (
    EnergySnapshotRow,
    EnergySnapshotRepository,
    NewEnergySnapshotRow,
)
from src.repositories.base.realtime.WsEventOutboxRepository import NewWsEventOutboxRow, WsEventOutboxRepository
from src.shared.errors.AppError import AppError
from src.shared.errors.ErrorCode import ErrorCode
from src.shared.kernel.Clock import Clock
from src.shared.kernel.EventIdGenerator import EventIdGenerator

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
UNAVAILABLE_STATES = {"", "unknown", "unavailable", "none", "null"}


@dataclass(frozen=True)
class EnergyView:
    binding_status: str
    refresh_status: str | None
    yesterday_usage: float | None
    monthly_usage: float | None
    balance: float | None
    yearly_usage: float | None
    updated_at: str | None
    cache_mode: bool
    last_error_code: str | None
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


class EnergyService:
    def __init__(
        self,
        energy_account_repository: EnergyAccountRepository,
        energy_snapshot_repository: EnergySnapshotRepository,
        ws_event_outbox_repository: WsEventOutboxRepository,
        management_pin_guard: ManagementPinGuard,
        ha_connection_gateway: HaConnectionGateway,
        event_id_generator: EventIdGenerator,
        clock: Clock,
    ) -> None:
        self._energy_account_repository = energy_account_repository
        self._energy_snapshot_repository = energy_snapshot_repository
        self._ws_event_outbox_repository = ws_event_outbox_repository
        self._management_pin_guard = management_pin_guard
        self._ha_connection_gateway = ha_connection_gateway
        self._event_id_generator = event_id_generator
        self._clock = clock

    async def get_energy(self, home_id: str) -> EnergyView:
        account = await self._energy_account_repository.find_by_home_id(home_id)
        snapshot = await self._energy_snapshot_repository.find_latest_by_home_id(home_id)
        binding_payload = _decode_binding_payload(account.account_payload_encrypted if account else None)
        return EnergyView(
            binding_status=account.binding_status if account else "UNBOUND",
            refresh_status=snapshot.refresh_status if snapshot else None,
            yesterday_usage=snapshot.yesterday_usage if snapshot else None,
            monthly_usage=snapshot.monthly_usage if snapshot else None,
            balance=snapshot.balance if snapshot else None,
            yearly_usage=snapshot.yearly_usage if snapshot else None,
            updated_at=(snapshot.source_updated_at or snapshot.created_at) if snapshot else None,
            cache_mode=snapshot.cache_mode if snapshot else False,
            last_error_code=snapshot.last_error_code if snapshot else None,
            provider=binding_payload.provider,
            account_id_masked=_mask_account_id(binding_payload.account_id),
            entity_map=binding_payload.entity_map,
        )

    async def update_binding(
        self,
        home_id: str,
        terminal_id: str,
        payload: dict,
        member_id: str | None = None,
    ) -> EnergyBindingView:
        await self._management_pin_guard.require_active_session(home_id, terminal_id)
        binding_payload = _normalize_binding_payload(payload)
        row = await self._energy_account_repository.upsert(
            EnergyAccountUpsertRow(
                home_id=home_id,
                binding_status="BOUND",
                account_payload_encrypted=json.dumps(binding_payload.to_json(), ensure_ascii=True),
                updated_by_member_id=member_id,
                updated_by_terminal_id=terminal_id,
            )
        )
        return EnergyBindingView(
            saved=True,
            binding_status=row.binding_status,
            updated_at=row.updated_at,
            message="Energy binding saved",
        )

    async def delete_binding(
        self,
        home_id: str,
        terminal_id: str,
        member_id: str | None = None,
    ) -> EnergyBindingView:
        await self._management_pin_guard.require_active_session(home_id, terminal_id)
        row = await self._energy_account_repository.upsert(
            EnergyAccountUpsertRow(
                home_id=home_id,
                binding_status="UNBOUND",
                account_payload_encrypted=None,
                updated_by_member_id=member_id,
                updated_by_terminal_id=terminal_id,
            )
        )
        return EnergyBindingView(
            saved=True,
            binding_status=row.binding_status,
            updated_at=row.updated_at,
            message="Energy binding cleared",
        )

    async def refresh(self, home_id: str, terminal_id: str) -> EnergyRefreshView:
        await self._management_pin_guard.require_active_session(home_id, terminal_id)
        started_at = self._clock.now().isoformat()
        account = await self._energy_account_repository.find_by_home_id(home_id)
        binding_status = account.binding_status if account else "UNBOUND"
        previous_snapshot = await self._energy_snapshot_repository.find_latest_by_home_id(home_id)
        if binding_status != "BOUND" or account is None:
            snapshot = await self._insert_failed_snapshot(
                home_id,
                binding_status,
                "UNBOUND",
                previous_snapshot,
            )
        else:
            snapshot = await self._refresh_bound_account(home_id, account.account_payload_encrypted, previous_snapshot)
        await self._ws_event_outbox_repository.insert(
            NewWsEventOutboxRow(
                home_id=home_id,
                event_id=self._event_id_generator.next_event_id(),
                event_type=(
                    "energy_refresh_completed"
                    if snapshot.refresh_status == "SUCCESS"
                    else "energy_refresh_failed"
                ),
                change_domain="ENERGY",
                snapshot_required=False,
                payload_json={
                    "refresh_status": snapshot.refresh_status,
                    "last_error_code": snapshot.last_error_code,
                },
                occurred_at=self._clock.now().isoformat(),
            )
        )
        return EnergyRefreshView(
            accepted=True,
            refresh_status=snapshot.refresh_status,
            started_at=started_at,
            timeout_seconds=30,
        )

    async def _refresh_bound_account(
        self,
        home_id: str,
        account_payload_encrypted: str | None,
        previous_snapshot: EnergySnapshotRow | None,
    ) -> EnergySnapshotRow:
        binding_payload = _decode_binding_payload(account_payload_encrypted)
        try:
            states = await self._ha_connection_gateway.fetch_states(home_id)
        except Exception:
            return await self._insert_failed_snapshot(
                home_id,
                "BOUND",
                "HA_UNAVAILABLE",
                previous_snapshot,
            )

        if states is None:
            return await self._insert_failed_snapshot(
                home_id,
                "BOUND",
                "HA_NOT_CONFIGURED",
                previous_snapshot,
            )

        states_by_entity_id = {
            str(state.payload.get("entity_id")): state
            for state in states
            if state.payload.get("entity_id")
        }
        entity_ids = binding_payload.resolve_entity_ids(states_by_entity_id)
        if not entity_ids:
            return await self._insert_failed_snapshot(
                home_id,
                "BOUND",
                "ENTITY_MAPPING_REQUIRED",
                previous_snapshot,
            )
        values: dict[str, float] = {}
        source_updated_at: str | None = None
        for key in ENERGY_ENTITY_KEYS:
            entity_id = entity_ids.get(key)
            if not entity_id:
                return await self._insert_failed_snapshot(
                    home_id,
                    "BOUND",
                    f"MISSING_ENTITY_{key.upper()}",
                    previous_snapshot,
                )
            state = states_by_entity_id.get(entity_id)
            if state is None:
                return await self._insert_failed_snapshot(
                    home_id,
                    "BOUND",
                    f"ENTITY_NOT_FOUND_{key.upper()}",
                    previous_snapshot,
                )
            parsed = _parse_ha_numeric_state(state)
            if parsed is None:
                return await self._insert_failed_snapshot(
                    home_id,
                    "BOUND",
                    f"INVALID_ENTITY_STATE_{key.upper()}",
                    previous_snapshot,
                )
            values[key] = parsed
            source_updated_at = _max_iso(source_updated_at, _state_timestamp(state))

        return await self._energy_snapshot_repository.insert(
            NewEnergySnapshotRow(
                home_id=home_id,
                binding_status="BOUND",
                refresh_status="SUCCESS",
                yesterday_usage=values["yesterday_usage"],
                monthly_usage=values["monthly_usage"],
                yearly_usage=values["yearly_usage"],
                balance=values["balance"],
                cache_mode=False,
                last_error_code=None,
                source_updated_at=source_updated_at or datetime.now(timezone.utc).isoformat(),
            )
        )

    async def _insert_failed_snapshot(
        self,
        home_id: str,
        binding_status: str,
        error_code: str,
        previous_snapshot: EnergySnapshotRow | None,
    ) -> EnergySnapshotRow:
        has_cached_values = _has_energy_values(previous_snapshot)
        return await self._energy_snapshot_repository.insert(
            NewEnergySnapshotRow(
                home_id=home_id,
                binding_status=binding_status,
                refresh_status="FAILED",
                yesterday_usage=previous_snapshot.yesterday_usage if has_cached_values else None,
                monthly_usage=previous_snapshot.monthly_usage if has_cached_values else None,
                yearly_usage=previous_snapshot.yearly_usage if has_cached_values else None,
                balance=previous_snapshot.balance if has_cached_values else None,
                cache_mode=has_cached_values,
                last_error_code=error_code,
                source_updated_at=(
                    previous_snapshot.source_updated_at
                    if has_cached_values
                    else datetime.now(timezone.utc).isoformat()
                ),
            )
        )


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
        provider=str(payload.get("provider") or ENERGY_PROVIDER),
        account_id=_clean_optional_string(
            payload.get("account_id") or payload.get("account_suffix") or payload.get("account")
        ),
        entity_map=_sanitize_entity_map(payload.get("entity_map")),
    )


def _normalize_binding_payload(payload: dict) -> EnergyBindingPayload:
    provider = str(payload.get("provider") or ENERGY_PROVIDER)
    if provider != ENERGY_PROVIDER:
        raise AppError(
            ErrorCode.INVALID_PARAMS,
            "Only HOME_ASSISTANT_SGCC energy provider is supported",
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
    return {
        key: f"{ENERGY_ENTITY_PREFIXES[key]}_{suffix}"
        for key in ENERGY_ENTITY_KEYS
    }


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


def _parse_ha_numeric_state(state: HaStateEntry) -> float | None:
    raw_value = state.payload.get("state")
    if raw_value is None:
        return None
    normalized = str(raw_value).strip()
    if normalized.lower() in UNAVAILABLE_STATES:
        return None
    normalized = normalized.replace(",", "")
    try:
        return float(normalized)
    except ValueError:
        match = re.search(r"-?\d+(?:\.\d+)?", normalized)
        return float(match.group(0)) if match else None


def _state_timestamp(state: HaStateEntry) -> str | None:
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
