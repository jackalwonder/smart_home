from __future__ import annotations

import asyncio
from pathlib import Path

from src.infrastructure.ha.HaConnectionGateway import HaConnectionGateway, HaStateEntry
from src.modules.energy.services.EnergyModels import (
    FAILED_SOURCE_TIMEOUT,
    FAILED_UPSTREAM_TRIGGER,
    EnergyStatesView,
    SgccCacheValues,
    UpstreamWaitResult,
    _collect_source_updated_at,
    _extract_energy_values,
    _read_sgcc_cache_values,
)
from src.modules.settings.services.query.SgccRuntimeControlService import SgccContainerRestarter


class EnergyUpstreamReader:
    def __init__(
        self,
        ha_connection_gateway: HaConnectionGateway,
        sgcc_container_restarter: SgccContainerRestarter | None = None,
        upstream_refresh_mode: str = "none",
        upstream_ha_domain: str | None = None,
        upstream_ha_service: str | None = None,
        upstream_ha_entity_id: str | None = None,
        upstream_wait_timeout_seconds: int = 20,
        upstream_poll_interval_seconds: float = 2.0,
        sgcc_cache_file: str | None = None,
    ) -> None:
        self._ha_connection_gateway = ha_connection_gateway
        self._sgcc_container_restarter = sgcc_container_restarter
        self._upstream_refresh_mode = upstream_refresh_mode.strip().lower() or "none"
        self._upstream_ha_domain = _clean_optional_string(upstream_ha_domain)
        self._upstream_ha_service = _clean_optional_string(upstream_ha_service)
        self._upstream_ha_entity_id = _clean_optional_string(upstream_ha_entity_id)
        self._upstream_wait_timeout_seconds = max(1, int(upstream_wait_timeout_seconds))
        self._upstream_poll_interval_seconds = max(0.5, float(upstream_poll_interval_seconds))
        self._sgcc_cache_file = Path(sgcc_cache_file) if sgcc_cache_file else None

    @property
    def refresh_mode(self) -> str:
        return self._upstream_refresh_mode

    @property
    def wait_timeout_seconds(self) -> int:
        return self._upstream_wait_timeout_seconds

    async def fetch_states_view(self, home_id: str) -> EnergyStatesView | str:
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

    async def trigger_upstream_refresh(self, home_id: str) -> str | None:
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

    async def wait_for_source_update(
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
            states_result = await self.fetch_states_view(home_id)
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

    async def read_sgcc_cache(self, account_id: str | None) -> SgccCacheValues | None:
        if self._sgcc_cache_file is None:
            return None
        return await asyncio.to_thread(
            _read_sgcc_cache_values,
            self._sgcc_cache_file,
            account_id,
        )


def _clean_optional_string(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    cleaned = value.strip()
    return cleaned or None


def _is_iso_newer(current: str | None, previous: str | None) -> bool:
    if not current:
        return False
    if not previous:
        return True
    return current > previous
