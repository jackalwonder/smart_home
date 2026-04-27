from __future__ import annotations

from injector import Module, provider, singleton

from src.shared.kernel.implementations import SystemClock, UuidEventIdGenerator
from src.infrastructure.ha.impl.HomeAssistantConnectionGateway import HomeAssistantConnectionGateway
from src.infrastructure.db.repositories.base.energy.EnergyAccountRepositoryImpl import (
    EnergyAccountRepositoryImpl,
)
from src.infrastructure.db.repositories.base.energy.EnergySnapshotRepositoryImpl import (
    EnergySnapshotRepositoryImpl,
)
from src.infrastructure.db.repositories.base.realtime.WsEventOutboxRepositoryImpl import (
    WsEventOutboxRepositoryImpl,
)
from src.modules.auth.services.guard.ManagementPinGuard import ManagementPinGuard
from src.modules.energy.services.EnergyBindingService import EnergyBindingService
from src.modules.energy.services.EnergyRefreshCoordinator import EnergyRefreshCoordinator
from src.modules.energy.services.EnergyService import EnergyService
from src.modules.energy.services.EnergyUpstreamReader import EnergyUpstreamReader
from src.modules.energy.services.EnergyAutoRefreshService import EnergyAutoRefreshService
from src.modules.settings.services.query.SgccRuntimeControlService import SgccContainerRestarter
from src.shared.config.Settings import Settings


class EnergyModule(Module):
    @provider
    @singleton
    def provide_energy_upstream_reader(
        self,
        settings: Settings,
        ha_connection_gateway: HomeAssistantConnectionGateway,
        sgcc_container_restarter: SgccContainerRestarter,
    ) -> EnergyUpstreamReader:
        return EnergyUpstreamReader(
            ha_connection_gateway=ha_connection_gateway,
            sgcc_container_restarter=sgcc_container_restarter,
            upstream_refresh_mode=settings.energy_upstream_refresh_mode,
            upstream_ha_domain=settings.energy_upstream_ha_domain,
            upstream_ha_service=settings.energy_upstream_ha_service,
            upstream_ha_entity_id=settings.energy_upstream_ha_entity_id,
            upstream_wait_timeout_seconds=settings.energy_upstream_wait_timeout_seconds,
            upstream_poll_interval_seconds=settings.energy_upstream_poll_interval_seconds,
            sgcc_cache_file=settings.sgcc_cache_file,
        )

    @provider
    @singleton
    def provide_energy_binding_service(
        self,
        energy_account_repository: EnergyAccountRepositoryImpl,
        energy_snapshot_repository: EnergySnapshotRepositoryImpl,
        management_pin_guard: ManagementPinGuard,
    ) -> EnergyBindingService:
        return EnergyBindingService(
            energy_account_repository=energy_account_repository,
            energy_snapshot_repository=energy_snapshot_repository,
            management_pin_guard=management_pin_guard,
        )

    @provider
    @singleton
    def provide_energy_refresh_coordinator(
        self,
        energy_account_repository: EnergyAccountRepositoryImpl,
        energy_snapshot_repository: EnergySnapshotRepositoryImpl,
        ws_event_outbox_repository: WsEventOutboxRepositoryImpl,
        upstream_reader: EnergyUpstreamReader,
        event_id_generator: UuidEventIdGenerator,
        clock: SystemClock,
    ) -> EnergyRefreshCoordinator:
        return EnergyRefreshCoordinator(
            energy_account_repository=energy_account_repository,
            energy_snapshot_repository=energy_snapshot_repository,
            ws_event_outbox_repository=ws_event_outbox_repository,
            upstream_reader=upstream_reader,
            event_id_generator=event_id_generator,
            clock=clock,
        )

    @provider
    @singleton
    def provide_energy_service(
        self,
        energy_account_repository: EnergyAccountRepositoryImpl,
        energy_snapshot_repository: EnergySnapshotRepositoryImpl,
        ws_event_outbox_repository: WsEventOutboxRepositoryImpl,
        management_pin_guard: ManagementPinGuard,
        ha_connection_gateway: HomeAssistantConnectionGateway,
        event_id_generator: UuidEventIdGenerator,
        clock: SystemClock,
        settings: Settings,
        sgcc_container_restarter: SgccContainerRestarter,
        binding_service: EnergyBindingService,
        upstream_reader: EnergyUpstreamReader,
        refresh_coordinator: EnergyRefreshCoordinator,
    ) -> EnergyService:
        return EnergyService(
            energy_account_repository=energy_account_repository,
            energy_snapshot_repository=energy_snapshot_repository,
            ws_event_outbox_repository=ws_event_outbox_repository,
            management_pin_guard=management_pin_guard,
            ha_connection_gateway=ha_connection_gateway,
            event_id_generator=event_id_generator,
            clock=clock,
            sgcc_container_restarter=sgcc_container_restarter,
            upstream_refresh_mode=settings.energy_upstream_refresh_mode,
            upstream_ha_domain=settings.energy_upstream_ha_domain,
            upstream_ha_service=settings.energy_upstream_ha_service,
            upstream_ha_entity_id=settings.energy_upstream_ha_entity_id,
            upstream_wait_timeout_seconds=settings.energy_upstream_wait_timeout_seconds,
            upstream_poll_interval_seconds=settings.energy_upstream_poll_interval_seconds,
            sgcc_cache_file=settings.sgcc_cache_file,
            binding_service=binding_service,
            upstream_reader=upstream_reader,
            refresh_coordinator=refresh_coordinator,
        )

    @provider
    @singleton
    def provide_energy_auto_refresh_service(
        self,
        settings: Settings,
        energy_service: EnergyService,
    ) -> EnergyAutoRefreshService:
        return EnergyAutoRefreshService(
            energy_service,
            enabled=settings.energy_auto_refresh_enabled,
            hour=settings.energy_auto_refresh_hour,
            minute=settings.energy_auto_refresh_minute,
            timezone_name=settings.energy_auto_refresh_timezone,
        )
