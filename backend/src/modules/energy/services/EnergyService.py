from __future__ import annotations

import asyncio
import json
import re
from dataclasses import dataclass
from typing import Any

from src.infrastructure.ha.HaConnectionGateway import HaConnectionGateway, HaStateEntry
from src.modules.auth.services.guard.ManagementPinGuard import ManagementPinGuard
from src.modules.settings.services.query.SgccRuntimeControlService import SgccContainerRestarter
from src.repositories.base.energy.EnergyAccountRepository import (
    EnergyAccountRepository,
    EnergyAccountUpsertRow,
)
from src.repositories.base.energy.EnergySnapshotRepository import (
    EnergySnapshotRow,
    EnergySnapshotRepository,
    NewEnergySnapshotRow,
)
from src.repositories.base.realtime.WsEventOutboxRepository import (
    NewWsEventOutboxRow,
    WsEventOutboxRepository,
)
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
        sgcc_container_restarter: SgccContainerRestarter | None = None,
        upstream_refresh_mode: str = "none",
        upstream_ha_domain: str | None = None,
        upstream_ha_service: str | None = None,
        upstream_ha_entity_id: str | None = None,
        upstream_wait_timeout_seconds: int = 20,
        upstream_poll_interval_seconds: float = 2.0,
    ) -> None:
        self._energy_account_repository = energy_account_repository
        self._energy_snapshot_repository = energy_snapshot_repository
        self._ws_event_outbox_repository = ws_event_outbox_repository
        self._management_pin_guard = management_pin_guard
        self._ha_connection_gateway = ha_connection_gateway
        self._event_id_generator = event_id_generator
        self._clock = clock
        self._sgcc_container_restarter = sgcc_container_restarter
        self._upstream_refresh_mode = upstream_refresh_mode.strip().lower() or "none"
        self._upstream_ha_domain = _clean_optional_string(upstream_ha_domain)
        self._upstream_ha_service = _clean_optional_string(upstream_ha_service)
        self._upstream_ha_entity_id = _clean_optional_string(upstream_ha_entity_id)
        self._upstream_wait_timeout_seconds = max(1, int(upstream_wait_timeout_seconds))
        self._upstream_poll_interval_seconds = max(0.5, float(upstream_poll_interval_seconds))

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
            updated_at=snapshot.created_at if snapshot else None,
            system_updated_at=snapshot.created_at if snapshot else None,
            source_updated_at=snapshot.source_updated_at if snapshot else None,
            cache_mode=snapshot.cache_mode if snapshot else False,
            last_error_code=snapshot.last_error_code if snapshot else None,
            refresh_status_detail=_derive_refresh_status_detail(snapshot) if snapshot else None,
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
        return await self._refresh_home(home_id)

    async def refresh_system(self, home_id: str) -> EnergyRefreshView:
        return await self._refresh_home(home_id)

    async def refresh_all_bound_accounts(self) -> EnergyAutoRefreshView:
        accounts = await self._energy_account_repository.list_bound()
        success_count = 0
        failed_count = 0
        for account in accounts:
            result = await self._refresh_home(account.home_id)
            if result.refresh_status == "SUCCESS":
                success_count += 1
            else:
                failed_count += 1
        return EnergyAutoRefreshView(
            refreshed_count=len(accounts),
            success_count=success_count,
            failed_count=failed_count,
        )

    async def _refresh_home(self, home_id: str) -> EnergyRefreshView:
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
            outcome = EnergyRefreshOutcome(
                snapshot=snapshot,
                upstream_triggered=False,
                source_updated=False,
                refresh_status_detail=_derive_refresh_status_detail(snapshot),
            )
        else:
            outcome = await self._refresh_bound_account(
                home_id,
                account.account_payload_encrypted,
                previous_snapshot,
            )

        snapshot = outcome.snapshot
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
                    "upstream_triggered": outcome.upstream_triggered,
                    "source_updated": outcome.source_updated,
                    "source_updated_at": snapshot.source_updated_at,
                    "system_updated_at": snapshot.created_at,
                    "refresh_status_detail": outcome.refresh_status_detail,
                },
                occurred_at=self._clock.now().isoformat(),
            )
        )
        return EnergyRefreshView(
            accepted=True,
            refresh_status=snapshot.refresh_status,
            started_at=started_at,
            timeout_seconds=self._upstream_wait_timeout_seconds,
            upstream_triggered=outcome.upstream_triggered,
            source_updated=outcome.source_updated,
            source_updated_at=snapshot.source_updated_at,
            system_updated_at=snapshot.created_at,
            refresh_status_detail=outcome.refresh_status_detail,
        )

    async def _refresh_bound_account(
        self,
        home_id: str,
        account_payload_encrypted: str | None,
        previous_snapshot: EnergySnapshotRow | None,
    ) -> EnergyRefreshOutcome:
        binding_payload = _decode_binding_payload(account_payload_encrypted)
        initial_states = await self._fetch_states_view(home_id)
        if isinstance(initial_states, str):
            snapshot = await self._insert_failed_snapshot(home_id, "BOUND", initial_states, previous_snapshot)
            return EnergyRefreshOutcome(
                snapshot=snapshot,
                upstream_triggered=False,
                source_updated=False,
                refresh_status_detail=_derive_refresh_status_detail(snapshot),
            )

        entity_ids = binding_payload.resolve_entity_ids(initial_states.states_by_entity_id)
        if not entity_ids:
            snapshot = await self._insert_failed_snapshot(
                home_id,
                "BOUND",
                "ENTITY_MAPPING_REQUIRED",
                previous_snapshot,
            )
            return EnergyRefreshOutcome(
                snapshot=snapshot,
                upstream_triggered=False,
                source_updated=False,
                refresh_status_detail=_derive_refresh_status_detail(snapshot),
            )

        upstream_triggered = False
        source_updated = True
        final_states_by_entity_id = initial_states.states_by_entity_id
        baseline_source_updated_at = _collect_source_updated_at(entity_ids, initial_states.states_by_entity_id)

        if self._upstream_refresh_mode != "none":
            upstream_triggered = True
            trigger_error = await self._trigger_upstream_refresh(home_id)
            if trigger_error is not None:
                snapshot = await self._insert_failed_snapshot(
                    home_id,
                    "BOUND",
                    trigger_error,
                    previous_snapshot,
                )
                return EnergyRefreshOutcome(
                    snapshot=snapshot,
                    upstream_triggered=True,
                    source_updated=False,
                    refresh_status_detail=_derive_refresh_status_detail(snapshot),
                )

            wait_result = await self._wait_for_source_update(
                home_id,
                entity_ids,
                baseline_source_updated_at,
            )
            if wait_result.error_code is not None:
                snapshot = await self._insert_failed_snapshot(
                    home_id,
                    "BOUND",
                    wait_result.error_code,
                    previous_snapshot,
                )
                return EnergyRefreshOutcome(
                    snapshot=snapshot,
                    upstream_triggered=True,
                    source_updated=False,
                    refresh_status_detail=_derive_refresh_status_detail(snapshot),
                )
            if wait_result.states_by_entity_id is not None:
                final_states_by_entity_id = wait_result.states_by_entity_id
            source_updated = wait_result.source_updated

        values_result = _extract_energy_values(entity_ids, final_states_by_entity_id)
        if isinstance(values_result, str):
            snapshot = await self._insert_failed_snapshot(home_id, "BOUND", values_result, previous_snapshot)
            return EnergyRefreshOutcome(
                snapshot=snapshot,
                upstream_triggered=upstream_triggered,
                source_updated=False,
                refresh_status_detail=_derive_refresh_status_detail(snapshot),
            )

        values, source_updated_at = values_result
        snapshot = await self._energy_snapshot_repository.insert(
            NewEnergySnapshotRow(
                home_id=home_id,
                binding_status="BOUND",
                refresh_status="SUCCESS",
                yesterday_usage=values["yesterday_usage"],
                monthly_usage=values["monthly_usage"],
                yearly_usage=values["yearly_usage"],
                balance=values["balance"],
                cache_mode=False,
                last_error_code=None if source_updated else "SOURCE_NOT_UPDATED",
                source_updated_at=source_updated_at or self._clock.now().isoformat(),
            )
        )
        return EnergyRefreshOutcome(
            snapshot=snapshot,
            upstream_triggered=upstream_triggered,
            source_updated=source_updated,
            refresh_status_detail=SUCCESS_UPDATED if source_updated else SUCCESS_STALE_SOURCE,
        )

    async def _fetch_states_view(self, home_id: str) -> EnergyStatesView | str:
        try:
            states = await self._ha_connection_gateway.fetch_states(home_id)
        except Exception:
            return "HA_UNAVAILABLE"

        if states is None:
            return "HA_NOT_CONFIGURED"

        return EnergyStatesView(
            states_by_entity_id={
                str(state.payload.get("entity_id")): state
                for state in states
                if state.payload.get("entity_id")
            }
        )

    async def _trigger_upstream_refresh(self, home_id: str) -> str | None:
        if self._upstream_refresh_mode == "ha_service":
            if not self._upstream_ha_domain or not self._upstream_ha_service:
                return FAILED_UPSTREAM_TRIGGER
            payload: dict[str, object] = {}
            if self._upstream_ha_entity_id:
                payload["entity_id"] = self._upstream_ha_entity_id
            try:
                await self._ha_connection_gateway.call_service(
                    home_id,
                    self._upstream_ha_domain,
                    self._upstream_ha_service,
                    payload,
                )
            except Exception:
                return FAILED_UPSTREAM_TRIGGER
            return None

        if self._upstream_refresh_mode == "docker_restart":
            if self._sgcc_container_restarter is None:
                return FAILED_UPSTREAM_TRIGGER
            try:
                await self._sgcc_container_restarter.restart()
            except Exception:
                return FAILED_UPSTREAM_TRIGGER
            return None

        if self._upstream_refresh_mode in {"docker_exec_fetch", "sgcc_sidecar"}:
            if self._sgcc_container_restarter is None:
                return FAILED_UPSTREAM_TRIGGER
            try:
                await self._sgcc_container_restarter.fetch()
            except Exception:
                return FAILED_UPSTREAM_TRIGGER
            return None

        if self._upstream_refresh_mode == "none":
            return None
        return FAILED_UPSTREAM_TRIGGER

    async def _wait_for_source_update(
        self,
        home_id: str,
        entity_ids: dict[str, str],
        previous_source_updated_at: str | None,
    ) -> UpstreamWaitResult:
        loop = asyncio.get_running_loop()
        started_at = loop.time()
        deadline = started_at + self._upstream_wait_timeout_seconds
        stale_source_return_after = min(
            deadline,
            started_at + self._upstream_poll_interval_seconds * 2,
        )
        latest_states_by_entity_id: dict[str, HaStateEntry] | None = None

        while True:
            states_result = await self._fetch_states_view(home_id)
            if isinstance(states_result, EnergyStatesView):
                latest_states_by_entity_id = states_result.states_by_entity_id
                current_source_updated_at = _collect_source_updated_at(
                    entity_ids,
                    latest_states_by_entity_id,
                )
                if _is_iso_newer(current_source_updated_at, previous_source_updated_at):
                    return UpstreamWaitResult(
                        states_by_entity_id=latest_states_by_entity_id,
                        source_updated=True,
                    )
                if (
                    loop.time() >= stale_source_return_after
                    and not isinstance(
                        _extract_energy_values(entity_ids, latest_states_by_entity_id),
                        str,
                    )
                ):
                    return UpstreamWaitResult(
                        states_by_entity_id=latest_states_by_entity_id,
                        source_updated=False,
                    )
            if loop.time() >= deadline:
                break
            await asyncio.sleep(self._upstream_poll_interval_seconds)

        if latest_states_by_entity_id is not None:
            return UpstreamWaitResult(
                states_by_entity_id=latest_states_by_entity_id,
                source_updated=False,
            )
        return UpstreamWaitResult(
            states_by_entity_id=None,
            source_updated=False,
            error_code=FAILED_SOURCE_TIMEOUT,
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
                source_updated_at=previous_snapshot.source_updated_at if has_cached_values else self._clock.now().isoformat(),
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
