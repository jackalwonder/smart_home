from __future__ import annotations

from injector import Module, provider, singleton

from src.shared.kernel.implementations import SystemClock, UuidEventIdGenerator
from src.shared.kernel.implementations import TimestampVersionTokenGenerator
from src.infrastructure.ha.impl.HomeAssistantConnectionGateway import HomeAssistantConnectionGateway
from src.infrastructure.db.repositories.base.energy.EnergyAccountRepositoryImpl import (
    EnergyAccountRepositoryImpl,
)
from src.infrastructure.db.repositories.base.settings.SettingsVersionRepositoryImpl import (
    SettingsVersionRepositoryImpl,
)
from src.infrastructure.db.repositories.base.settings.FavoriteDevicesRepositoryImpl import (
    FavoriteDevicesRepositoryImpl,
)
from src.infrastructure.db.repositories.base.settings.PageSettingsRepositoryImpl import (
    PageSettingsRepositoryImpl,
)
from src.infrastructure.db.repositories.base.settings.FunctionSettingsRepositoryImpl import (
    FunctionSettingsRepositoryImpl,
)
from src.infrastructure.db.repositories.base.realtime.WsEventOutboxRepositoryImpl import (
    WsEventOutboxRepositoryImpl,
)
from src.infrastructure.db.repositories.query.settings.SettingsSnapshotQueryRepositoryImpl import (
    SettingsSnapshotQueryRepositoryImpl,
)
from src.infrastructure.db.repositories.query.settings.FavoritesQueryRepositoryImpl import (
    FavoritesQueryRepositoryImpl,
)
from src.infrastructure.db.unit_of_work.PostgresUnitOfWork import PostgresUnitOfWork
from src.modules.auth.services.guard.ManagementPinGuard import ManagementPinGuard
from src.modules.settings.services.command.SettingsSaveService import SettingsSaveService
from src.modules.settings.services.query.FavoritesQueryService import FavoritesQueryService
from src.modules.settings.services.query.SgccLoginQrCodeService import SgccLoginQrCodeService
from src.modules.settings.services.query.SgccRuntimeControlService import (
    DockerUnixSocketContainerRestarter,
    FallbackSgccRuntimeControl,
    HttpSgccRuntimeClient,
    SgccContainerRestarter,
)
from src.modules.settings.services.query.SettingsQueryService import SettingsQueryService
from src.shared.config.Settings import Settings


class SettingsModule(Module):
    @provider
    @singleton
    def provide_settings_query_service(
        self,
        settings_snapshot_query_repository: SettingsSnapshotQueryRepositoryImpl,
    ) -> SettingsQueryService:
        return SettingsQueryService(
            settings_snapshot_query_repository=settings_snapshot_query_repository,
        )

    @provider
    @singleton
    def provide_favorites_query_service(
        self,
        favorites_query_repository: FavoritesQueryRepositoryImpl,
    ) -> FavoritesQueryService:
        return FavoritesQueryService(favorites_query_repository)

    @provider
    @singleton
    def provide_sgcc_container_restarter(
        self, settings: Settings
    ) -> SgccContainerRestarter:
        docker_control = DockerUnixSocketContainerRestarter(
            settings.sgcc_docker_socket_path,
            settings.sgcc_docker_container_name,
        )
        if settings.energy_upstream_refresh_mode in {"docker_exec_fetch", "docker_restart"}:
            return docker_control

        sidecar_control = HttpSgccRuntimeClient(
            settings.sgcc_sidecar_base_url,
            timeout_seconds=settings.sgcc_sidecar_timeout_seconds,
        )
        if settings.sgcc_sidecar_fallback_enabled:
            return FallbackSgccRuntimeControl(sidecar_control, docker_control)
        return sidecar_control

    @provider
    @singleton
    def provide_sgcc_login_qr_code_service(
        self,
        settings: Settings,
        energy_account_repository: EnergyAccountRepositoryImpl,
        ha_connection_gateway: HomeAssistantConnectionGateway,
        runtime_control: SgccContainerRestarter,
    ) -> SgccLoginQrCodeService:
        return SgccLoginQrCodeService(
            settings,
            energy_account_repository=energy_account_repository,
            ha_connection_gateway=ha_connection_gateway,
            runtime_control=runtime_control,
        )

    @provider
    @singleton
    def provide_settings_save_service(
        self,
        unit_of_work: PostgresUnitOfWork,
        settings_version_repository: SettingsVersionRepositoryImpl,
        favorite_devices_repository: FavoriteDevicesRepositoryImpl,
        page_settings_repository: PageSettingsRepositoryImpl,
        function_settings_repository: FunctionSettingsRepositoryImpl,
        ws_event_outbox_repository: WsEventOutboxRepositoryImpl,
        management_pin_guard: ManagementPinGuard,
        version_token_generator: TimestampVersionTokenGenerator,
        event_id_generator: UuidEventIdGenerator,
        clock: SystemClock,
    ) -> SettingsSaveService:
        return SettingsSaveService(
            unit_of_work=unit_of_work,
            settings_version_repository=settings_version_repository,
            favorite_devices_repository=favorite_devices_repository,
            page_settings_repository=page_settings_repository,
            function_settings_repository=function_settings_repository,
            ws_event_outbox_repository=ws_event_outbox_repository,
            management_pin_guard=management_pin_guard,
            version_token_generator=version_token_generator,
            event_id_generator=event_id_generator,
            clock=clock,
        )
