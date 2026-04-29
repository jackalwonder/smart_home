from __future__ import annotations

from src.infrastructure.ha.HaConnectionGateway import HaConnectionGateway
from src.modules.auth.services.guard.ManagementPinGuard import ManagementPinGuard
from src.modules.energy.services.EnergyBindingService import EnergyBindingService
from src.modules.energy.services.EnergyModels import (
    FAILED_SOURCE_TIMEOUT,
    FAILED_UPSTREAM_TRIGGER,
    LEGACY_ENERGY_PROVIDERS,
    SUCCESS_STALE_SOURCE,
    SUCCESS_UPDATED,
    SUPPORTED_ENERGY_PROVIDERS,
    ENERGY_ENTITY_KEYS,
    ENERGY_ENTITY_PATTERN,
    ENERGY_ENTITY_PREFIXES,
    ENERGY_PROVIDER,
    UNAVAILABLE_STATES,
    EnergyAutoRefreshView,
    EnergyBindingPayload,
    EnergyBindingView,
    EnergyRefreshOutcome,
    EnergyRefreshView,
    EnergyStatesView,
    EnergyView,
    SgccCacheValues,
    UpstreamWaitResult,
    _clean_optional_string,
    _collect_source_updated_at,
    _decode_binding_payload,
    _derive_refresh_status_detail,
    _discover_entity_ids_from_states,
    _entity_ids_for_suffix,
    _entity_map_exists_in_states,
    _entity_suffix,
    _extract_energy_values,
    _has_complete_entity_map,
    _has_energy_values,
    _is_iso_newer,
    _mask_account_id,
    _max_iso,
    _normalize_binding_payload,
    _normalize_provider,
    _parse_ha_numeric_state,
    _parse_numeric_value,
    _read_sgcc_cache_values,
    _sanitize_entity_map,
    _select_sgcc_cache_account,
    _state_timestamp,
)
from src.modules.energy.services.EnergyRefreshCoordinator import EnergyRefreshCoordinator
from src.modules.energy.services.EnergyUpstreamReader import EnergyUpstreamReader
from src.modules.settings.services.query.SgccRuntimeControlService import SgccContainerRestarter
from src.repositories.base.energy.EnergyAccountRepository import EnergyAccountRepository
from src.repositories.base.energy.EnergySnapshotRepository import EnergySnapshotRepository
from src.repositories.base.realtime.WsEventOutboxRepository import WsEventOutboxRepository
from src.shared.kernel.Clock import Clock
from src.shared.kernel.EventIdGenerator import EventIdGenerator

__all__ = [
    "EnergyService",
    "EnergyView",
    "EnergyBindingView",
    "EnergyRefreshView",
    "EnergyAutoRefreshView",
    "EnergyRefreshOutcome",
    "EnergyStatesView",
    "UpstreamWaitResult",
    "SgccCacheValues",
    "EnergyBindingPayload",
    "ENERGY_PROVIDER",
    "LEGACY_ENERGY_PROVIDERS",
    "SUPPORTED_ENERGY_PROVIDERS",
    "ENERGY_ENTITY_KEYS",
    "ENERGY_ENTITY_PREFIXES",
    "ENERGY_ENTITY_PATTERN",
    "UNAVAILABLE_STATES",
    "SUCCESS_UPDATED",
    "SUCCESS_STALE_SOURCE",
    "FAILED_UPSTREAM_TRIGGER",
    "FAILED_SOURCE_TIMEOUT",
    "_decode_binding_payload",
    "_normalize_binding_payload",
    "_normalize_provider",
    "_sanitize_entity_map",
    "_clean_optional_string",
    "_mask_account_id",
    "_entity_suffix",
    "_entity_ids_for_suffix",
    "_discover_entity_ids_from_states",
    "_has_complete_entity_map",
    "_entity_map_exists_in_states",
    "_extract_energy_values",
    "_read_sgcc_cache_values",
    "_select_sgcc_cache_account",
    "_collect_source_updated_at",
    "_parse_ha_numeric_state",
    "_parse_numeric_value",
    "_state_timestamp",
    "_max_iso",
    "_is_iso_newer",
    "_derive_refresh_status_detail",
    "_has_energy_values",
]


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
        sgcc_cache_file: str | None = None,
        binding_service: EnergyBindingService | None = None,
        upstream_reader: EnergyUpstreamReader | None = None,
        refresh_coordinator: EnergyRefreshCoordinator | None = None,
    ) -> None:
        self._management_pin_guard = management_pin_guard
        self._binding_service = binding_service or EnergyBindingService(
            energy_account_repository=energy_account_repository,
            energy_snapshot_repository=energy_snapshot_repository,
            management_pin_guard=management_pin_guard,
        )
        self._upstream_reader = upstream_reader or EnergyUpstreamReader(
            ha_connection_gateway=ha_connection_gateway,
            sgcc_container_restarter=sgcc_container_restarter,
            upstream_refresh_mode=upstream_refresh_mode,
            upstream_ha_domain=upstream_ha_domain,
            upstream_ha_service=upstream_ha_service,
            upstream_ha_entity_id=upstream_ha_entity_id,
            upstream_wait_timeout_seconds=upstream_wait_timeout_seconds,
            upstream_poll_interval_seconds=upstream_poll_interval_seconds,
            sgcc_cache_file=sgcc_cache_file,
        )
        self._refresh_coordinator = refresh_coordinator or EnergyRefreshCoordinator(
            energy_account_repository=energy_account_repository,
            energy_snapshot_repository=energy_snapshot_repository,
            ws_event_outbox_repository=ws_event_outbox_repository,
            upstream_reader=self._upstream_reader,
            event_id_generator=event_id_generator,
            clock=clock,
        )

    async def get_energy(self, home_id: str) -> EnergyView:
        return await self._binding_service.get_energy(home_id)

    async def update_binding(
        self,
        home_id: str,
        terminal_id: str,
        payload: dict,
        member_id: str | None = None,
    ) -> EnergyBindingView:
        return await self._binding_service.update_binding(
            home_id=home_id,
            terminal_id=terminal_id,
            payload=payload,
            member_id=member_id,
        )

    async def delete_binding(
        self,
        home_id: str,
        terminal_id: str,
        member_id: str | None = None,
    ) -> EnergyBindingView:
        return await self._binding_service.delete_binding(
            home_id=home_id,
            terminal_id=terminal_id,
            member_id=member_id,
        )

    async def refresh(self, home_id: str, terminal_id: str) -> EnergyRefreshView:
        await self._management_pin_guard.require_active_session(home_id, terminal_id)
        return await self._refresh_coordinator.refresh_home(home_id)

    async def refresh_from_sources(self, home_id: str, terminal_id: str) -> EnergyRefreshView:
        await self._management_pin_guard.require_active_session(home_id, terminal_id)
        return await self._refresh_coordinator.refresh_home(home_id, trigger_upstream=False)

    async def refresh_system(self, home_id: str) -> EnergyRefreshView:
        return await self._refresh_coordinator.refresh_home(home_id)

    async def refresh_all_bound_accounts(self) -> EnergyAutoRefreshView:
        return await self._refresh_coordinator.refresh_all_bound_accounts()
