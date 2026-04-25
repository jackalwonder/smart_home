from __future__ import annotations

from functools import lru_cache

from src.app.containers import (
    auth_container,
    core_container,
    repositories_container,
    settings_container,
)
from src.modules.energy.services.EnergyAutoRefreshService import EnergyAutoRefreshService
from src.modules.energy.services.EnergyBindingService import EnergyBindingService
from src.modules.energy.services.EnergyRefreshCoordinator import EnergyRefreshCoordinator
from src.modules.energy.services.EnergyService import EnergyService
from src.modules.energy.services.EnergyUpstreamReader import EnergyUpstreamReader


@lru_cache(maxsize=1)
def get_energy_upstream_reader() -> EnergyUpstreamReader:
    settings = core_container.get_settings()
    return EnergyUpstreamReader(
        ha_connection_gateway=core_container.get_ha_connection_gateway(),
        sgcc_container_restarter=settings_container.get_sgcc_container_restarter(),
        upstream_refresh_mode=settings.energy_upstream_refresh_mode,
        upstream_ha_domain=settings.energy_upstream_ha_domain,
        upstream_ha_service=settings.energy_upstream_ha_service,
        upstream_ha_entity_id=settings.energy_upstream_ha_entity_id,
        upstream_wait_timeout_seconds=settings.energy_upstream_wait_timeout_seconds,
        upstream_poll_interval_seconds=settings.energy_upstream_poll_interval_seconds,
        sgcc_cache_file=settings.sgcc_cache_file,
    )


@lru_cache(maxsize=1)
def get_energy_binding_service() -> EnergyBindingService:
    return EnergyBindingService(
        energy_account_repository=repositories_container.get_energy_account_repository(),
        energy_snapshot_repository=repositories_container.get_energy_snapshot_repository(),
        management_pin_guard=auth_container.get_management_pin_guard(),
    )


@lru_cache(maxsize=1)
def get_energy_refresh_coordinator() -> EnergyRefreshCoordinator:
    return EnergyRefreshCoordinator(
        energy_account_repository=repositories_container.get_energy_account_repository(),
        energy_snapshot_repository=repositories_container.get_energy_snapshot_repository(),
        ws_event_outbox_repository=repositories_container.get_ws_event_outbox_repository(),
        upstream_reader=get_energy_upstream_reader(),
        event_id_generator=core_container.get_event_id_generator(),
        clock=core_container.get_clock(),
    )


@lru_cache(maxsize=1)
def get_energy_service() -> EnergyService:
    return EnergyService(
        energy_account_repository=repositories_container.get_energy_account_repository(),
        energy_snapshot_repository=repositories_container.get_energy_snapshot_repository(),
        ws_event_outbox_repository=repositories_container.get_ws_event_outbox_repository(),
        management_pin_guard=auth_container.get_management_pin_guard(),
        ha_connection_gateway=core_container.get_ha_connection_gateway(),
        event_id_generator=core_container.get_event_id_generator(),
        clock=core_container.get_clock(),
        binding_service=get_energy_binding_service(),
        upstream_reader=get_energy_upstream_reader(),
        refresh_coordinator=get_energy_refresh_coordinator(),
    )


@lru_cache(maxsize=1)
def get_energy_auto_refresh_service() -> EnergyAutoRefreshService:
    settings = core_container.get_settings()
    return EnergyAutoRefreshService(
        get_energy_service(),
        enabled=settings.energy_auto_refresh_enabled,
        hour=settings.energy_auto_refresh_hour,
        minute=settings.energy_auto_refresh_minute,
        timezone_name=settings.energy_auto_refresh_timezone,
    )
