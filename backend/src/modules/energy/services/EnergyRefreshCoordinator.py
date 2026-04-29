from __future__ import annotations

from src.modules.energy.services.EnergyModels import (
    SUCCESS_STALE_SOURCE,
    SUCCESS_UPDATED,
    EnergyAutoRefreshView,
    EnergyBindingPayload,
    EnergyRefreshOutcome,
    EnergyRefreshView,
    _collect_source_updated_at,
    _decode_binding_payload,
    _derive_refresh_status_detail,
    _extract_energy_values,
    _has_energy_values,
    _is_iso_newer,
)
from src.modules.energy.services.EnergyUpstreamReader import EnergyUpstreamReader
from src.repositories.base.energy.EnergyAccountRepository import EnergyAccountRepository
from src.repositories.base.energy.EnergySnapshotRepository import (
    EnergySnapshotRow,
    EnergySnapshotRepository,
    NewEnergySnapshotRow,
)
from src.repositories.base.realtime.WsEventOutboxRepository import (
    NewWsEventOutboxRow,
    WsEventOutboxRepository,
)
from src.shared.kernel.Clock import Clock
from src.shared.kernel.EventIdGenerator import EventIdGenerator


class EnergyRefreshCoordinator:
    def __init__(
        self,
        energy_account_repository: EnergyAccountRepository,
        energy_snapshot_repository: EnergySnapshotRepository,
        ws_event_outbox_repository: WsEventOutboxRepository,
        upstream_reader: EnergyUpstreamReader,
        event_id_generator: EventIdGenerator,
        clock: Clock,
    ) -> None:
        self._energy_account_repository = energy_account_repository
        self._energy_snapshot_repository = energy_snapshot_repository
        self._ws_event_outbox_repository = ws_event_outbox_repository
        self._upstream_reader = upstream_reader
        self._event_id_generator = event_id_generator
        self._clock = clock

    async def refresh_home(self, home_id: str, *, trigger_upstream: bool = True) -> EnergyRefreshView:
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
                trigger_upstream=trigger_upstream,
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
            timeout_seconds=self._upstream_reader.wait_timeout_seconds,
            upstream_triggered=outcome.upstream_triggered,
            source_updated=outcome.source_updated,
            source_updated_at=snapshot.source_updated_at,
            system_updated_at=snapshot.created_at,
            refresh_status_detail=outcome.refresh_status_detail,
        )

    async def refresh_all_bound_accounts(self) -> EnergyAutoRefreshView:
        accounts = await self._energy_account_repository.list_bound()
        success_count = 0
        failed_count = 0
        for account in accounts:
            result = await self.refresh_home(account.home_id)
            if result.refresh_status == "SUCCESS":
                success_count += 1
            else:
                failed_count += 1
        return EnergyAutoRefreshView(
            refreshed_count=len(accounts),
            success_count=success_count,
            failed_count=failed_count,
        )

    async def _refresh_bound_account(
        self,
        home_id: str,
        account_payload_encrypted: str | None,
        previous_snapshot: EnergySnapshotRow | None,
        *,
        trigger_upstream: bool,
    ) -> EnergyRefreshOutcome:
        binding_payload = _decode_binding_payload(account_payload_encrypted)
        initial_states = await self._upstream_reader.fetch_states_view(home_id)
        if isinstance(initial_states, str):
            upstream_triggered = False
            trigger_error = None
            if trigger_upstream and self._upstream_reader.refresh_mode != "none":
                upstream_triggered = True
                trigger_error = await self._upstream_reader.trigger_upstream_refresh(home_id)
            cache_outcome = await self._try_refresh_from_sgcc_cache(
                home_id,
                binding_payload,
                previous_snapshot,
                upstream_triggered=upstream_triggered,
            )
            if cache_outcome is not None:
                return cache_outcome
            snapshot = await self._insert_failed_snapshot(
                home_id,
                "BOUND",
                trigger_error or initial_states,
                previous_snapshot,
            )
            return EnergyRefreshOutcome(
                snapshot=snapshot,
                upstream_triggered=upstream_triggered,
                source_updated=False,
                refresh_status_detail=_derive_refresh_status_detail(snapshot),
            )

        entity_ids = binding_payload.resolve_entity_ids(initial_states.states_by_entity_id)
        if not entity_ids:
            upstream_triggered = False
            trigger_error = None
            if trigger_upstream and self._upstream_reader.refresh_mode != "none":
                upstream_triggered = True
                trigger_error = await self._upstream_reader.trigger_upstream_refresh(home_id)
            cache_outcome = await self._try_refresh_from_sgcc_cache(
                home_id,
                binding_payload,
                previous_snapshot,
                upstream_triggered=upstream_triggered,
            )
            if cache_outcome is not None:
                return cache_outcome
            snapshot = await self._insert_failed_snapshot(
                home_id,
                "BOUND",
                trigger_error or "ENTITY_MAPPING_REQUIRED",
                previous_snapshot,
            )
            return EnergyRefreshOutcome(
                snapshot=snapshot,
                upstream_triggered=upstream_triggered,
                source_updated=False,
                refresh_status_detail=_derive_refresh_status_detail(snapshot),
            )

        upstream_triggered = False
        source_updated = True
        final_states_by_entity_id = initial_states.states_by_entity_id
        baseline_source_updated_at = _collect_source_updated_at(entity_ids, initial_states.states_by_entity_id)

        if trigger_upstream and self._upstream_reader.refresh_mode != "none":
            upstream_triggered = True
            trigger_error = await self._upstream_reader.trigger_upstream_refresh(home_id)
            if trigger_error is not None:
                cache_outcome = await self._try_refresh_from_sgcc_cache(
                    home_id,
                    binding_payload,
                    previous_snapshot,
                    upstream_triggered=True,
                )
                if cache_outcome is not None:
                    return cache_outcome
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

            wait_result = await self._upstream_reader.wait_for_source_update(
                home_id,
                entity_ids,
                baseline_source_updated_at,
            )
            if wait_result.error_code is not None:
                cache_outcome = await self._try_refresh_from_sgcc_cache(
                    home_id,
                    binding_payload,
                    previous_snapshot,
                    upstream_triggered=True,
                )
                if cache_outcome is not None:
                    return cache_outcome
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
            cache_outcome = await self._try_refresh_from_sgcc_cache(
                home_id,
                binding_payload,
                previous_snapshot,
                upstream_triggered=upstream_triggered,
            )
            if cache_outcome is not None:
                return cache_outcome
            snapshot = await self._insert_failed_snapshot(home_id, "BOUND", values_result, previous_snapshot)
            return EnergyRefreshOutcome(
                snapshot=snapshot,
                upstream_triggered=upstream_triggered,
                source_updated=False,
                refresh_status_detail=_derive_refresh_status_detail(snapshot),
            )

        values, source_updated_at = values_result
        if not upstream_triggered:
            source_updated = _is_iso_newer(
                source_updated_at,
                previous_snapshot.source_updated_at if previous_snapshot else None,
            )
            if previous_snapshot is None and source_updated_at:
                source_updated = True
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

    async def _try_refresh_from_sgcc_cache(
        self,
        home_id: str,
        binding_payload: EnergyBindingPayload,
        previous_snapshot: EnergySnapshotRow | None,
        *,
        upstream_triggered: bool,
    ) -> EnergyRefreshOutcome | None:
        cache_values = await self._upstream_reader.read_sgcc_cache(binding_payload.account_id)
        if cache_values is None:
            return None

        source_updated = _is_iso_newer(
            cache_values.source_updated_at,
            previous_snapshot.source_updated_at if previous_snapshot else None,
        )
        if previous_snapshot is None and cache_values.source_updated_at:
            source_updated = True

        snapshot = await self._energy_snapshot_repository.insert(
            NewEnergySnapshotRow(
                home_id=home_id,
                binding_status="BOUND",
                refresh_status="SUCCESS",
                yesterday_usage=cache_values.yesterday_usage,
                monthly_usage=cache_values.monthly_usage,
                yearly_usage=cache_values.yearly_usage,
                balance=cache_values.balance,
                cache_mode=True,
                last_error_code=None if source_updated else "SOURCE_NOT_UPDATED",
                source_updated_at=cache_values.source_updated_at or self._clock.now().isoformat(),
            )
        )
        return EnergyRefreshOutcome(
            snapshot=snapshot,
            upstream_triggered=upstream_triggered,
            source_updated=source_updated,
            refresh_status_detail=SUCCESS_UPDATED if source_updated else SUCCESS_STALE_SOURCE,
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
