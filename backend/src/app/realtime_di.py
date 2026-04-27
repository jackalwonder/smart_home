from __future__ import annotations

from injector import Module, provider, singleton

from src.shared.kernel.implementations import SystemClock, UuidEventIdGenerator
from src.infrastructure.ha.impl.HomeAssistantConnectionGateway import HomeAssistantConnectionGateway
from src.infrastructure.ha.impl.HomeAssistantControlGateway import HomeAssistantControlGateway
from src.infrastructure.ha.impl.SettingsHomeAssistantBootstrapProvider import (
    SettingsHomeAssistantBootstrapProvider,
)
from src.infrastructure.security.impl.FernetConnectionSecretCipher import (
    FernetConnectionSecretCipher,
)
from src.infrastructure.db.repositories.base.system.HaEntitySyncRepositoryImpl import (
    HaEntitySyncRepositoryImpl,
)
from src.infrastructure.db.repositories.base.system.SystemConnectionRepositoryImpl import (
    SystemConnectionRepositoryImpl,
)
from src.infrastructure.db.repositories.base.realtime.HaRealtimeSyncRepositoryImpl import (
    HaRealtimeSyncRepositoryImpl,
)
from src.infrastructure.db.repositories.base.realtime.WsEventOutboxRepositoryImpl import (
    WsEventOutboxRepositoryImpl,
)
from src.infrastructure.db.repositories.base.realtime.TerminalPresenceRepositoryImpl import (
    TerminalPresenceRepositoryImpl,
)
from src.infrastructure.db.repositories.base.devices.DeviceControlSchemaRepositoryImpl import (
    DeviceControlSchemaRepositoryImpl,
)
from src.infrastructure.db.repositories.base.devices.DeviceRepositoryImpl import DeviceRepositoryImpl
from src.infrastructure.db.repositories.base.devices.DeviceRuntimeStateRepositoryImpl import (
    DeviceRuntimeStateRepositoryImpl,
)
from src.infrastructure.db.repositories.base.control.DeviceControlRequestRepositoryImpl import (
    DeviceControlRequestRepositoryImpl,
)
from src.infrastructure.db.repositories.base.control.DeviceControlTransitionRepositoryImpl import (
    DeviceControlTransitionRepositoryImpl,
)
from src.infrastructure.db.repositories.query.control.DeviceControlQueryRepositoryImpl import (
    DeviceControlQueryRepositoryImpl,
)
from src.infrastructure.db.repositories.base.settings.SettingsVersionRepositoryImpl import (
    SettingsVersionRepositoryImpl,
)
from src.infrastructure.db.unit_of_work.PostgresUnitOfWork import PostgresUnitOfWork
from src.modules.auth.services.guard.ManagementPinGuard import ManagementPinGuard
from src.modules.device_control.services.command.DeviceControlCommandService import (
    DeviceControlCommandService,
)
from src.modules.device_control.services.command.DeviceControlPayloadValidator import (
    DeviceControlPayloadValidator,
)
from src.modules.device_control.services.command.DeviceControlLifecycleWriter import (
    DeviceControlLifecycleWriter,
)
from src.modules.device_control.services.query.DeviceControlResultQueryService import (
    DeviceControlResultQueryService,
)
from src.modules.realtime.RealtimeService import RealtimeService
from src.modules.system_connections.services.HaEntitySyncService import HaEntitySyncService
from src.modules.system_connections.services.HaRealtimeSyncService import HaRealtimeSyncService
from src.modules.system_connections.services.SystemConnectionService import (
    SystemConnectionService,
)
from src.modules.system_connections.services.HaEntityNormalizer import HaEntityNormalizer
from src.modules.system_connections.services.HaControlSchemaFactory import HaControlSchemaFactory


class RealtimeModule(Module):
    @provider
    @singleton
    def provide_ha_entity_normalizer(self) -> HaEntityNormalizer:
        return HaEntityNormalizer()

    @provider
    @singleton
    def provide_ha_control_schema_factory(self) -> HaControlSchemaFactory:
        return HaControlSchemaFactory()

    @provider
    @singleton
    def provide_ha_entity_sync_service(
        self,
        clock: SystemClock,
        ha_entity_sync_repository: HaEntitySyncRepositoryImpl,
        device_control_schema_repository: DeviceControlSchemaRepositoryImpl,
        normalizer: HaEntityNormalizer,
        control_schema_factory: HaControlSchemaFactory,
    ) -> HaEntitySyncService:
        return HaEntitySyncService(
            clock=clock,
            ha_entity_sync_repository=ha_entity_sync_repository,
            device_control_schema_repository=device_control_schema_repository,
            normalizer=normalizer,
            control_schema_factory=control_schema_factory,
        )

    @provider
    @singleton
    def provide_ha_realtime_sync_service(
        self,
        ha_realtime_sync_repository: HaRealtimeSyncRepositoryImpl,
        unit_of_work: PostgresUnitOfWork,
        ha_connection_gateway: HomeAssistantConnectionGateway,
        ha_entity_sync_service: HaEntitySyncService,
        system_connection_repository: SystemConnectionRepositoryImpl,
        ws_event_outbox_repository: WsEventOutboxRepositoryImpl,
        home_assistant_bootstrap_provider: SettingsHomeAssistantBootstrapProvider,
        connection_secret_cipher: FernetConnectionSecretCipher,
        event_id_generator: UuidEventIdGenerator,
        clock: SystemClock,
    ) -> HaRealtimeSyncService:
        return HaRealtimeSyncService(
            ha_realtime_sync_repository=ha_realtime_sync_repository,
            unit_of_work=unit_of_work,
            ha_connection_gateway=ha_connection_gateway,
            ha_entity_sync_service=ha_entity_sync_service,
            system_connection_repository=system_connection_repository,
            ws_event_outbox_repository=ws_event_outbox_repository,
            home_assistant_bootstrap_provider=home_assistant_bootstrap_provider,
            connection_secret_cipher=connection_secret_cipher,
            event_id_generator=event_id_generator,
            clock=clock,
        )

    @provider
    @singleton
    def provide_device_control_payload_validator(self) -> DeviceControlPayloadValidator:
        return DeviceControlPayloadValidator()

    @provider
    @singleton
    def provide_device_control_lifecycle_writer(
        self,
        device_control_request_repository: DeviceControlRequestRepositoryImpl,
        device_control_transition_repository: DeviceControlTransitionRepositoryImpl,
        ws_event_outbox_repository: WsEventOutboxRepositoryImpl,
        event_id_generator: UuidEventIdGenerator,
    ) -> DeviceControlLifecycleWriter:
        return DeviceControlLifecycleWriter(
            device_control_request_repository=device_control_request_repository,
            device_control_transition_repository=device_control_transition_repository,
            ws_event_outbox_repository=ws_event_outbox_repository,
            event_id_generator=event_id_generator,
        )

    @provider
    @singleton
    def provide_device_control_result_query_service(
        self,
        device_control_query_repository: DeviceControlQueryRepositoryImpl,
    ) -> DeviceControlResultQueryService:
        return DeviceControlResultQueryService(
            device_control_query_repository=device_control_query_repository,
        )

    @provider
    @singleton
    def provide_realtime_service(
        self,
        ws_event_outbox_repository: WsEventOutboxRepositoryImpl,
        terminal_presence_repository: TerminalPresenceRepositoryImpl,
    ) -> RealtimeService:
        return RealtimeService(
            ws_event_outbox_repository=ws_event_outbox_repository,
            terminal_presence_repository=terminal_presence_repository,
        )

    @provider
    @singleton
    def provide_device_control_command_service(
        self,
        unit_of_work: PostgresUnitOfWork,
        device_repository: DeviceRepositoryImpl,
        device_runtime_state_repository: DeviceRuntimeStateRepositoryImpl,
        device_control_schema_repository: DeviceControlSchemaRepositoryImpl,
        device_control_request_repository: DeviceControlRequestRepositoryImpl,
        device_control_transition_repository: DeviceControlTransitionRepositoryImpl,
        ws_event_outbox_repository: WsEventOutboxRepositoryImpl,
        ha_control_gateway: HomeAssistantControlGateway,
        event_id_generator: UuidEventIdGenerator,
        clock: SystemClock,
        payload_validator: DeviceControlPayloadValidator,
        lifecycle_writer: DeviceControlLifecycleWriter,
    ) -> DeviceControlCommandService:
        return DeviceControlCommandService(
            unit_of_work=unit_of_work,
            device_repository=device_repository,
            device_runtime_state_repository=device_runtime_state_repository,
            device_control_schema_repository=device_control_schema_repository,
            device_control_request_repository=device_control_request_repository,
            device_control_transition_repository=device_control_transition_repository,
            ws_event_outbox_repository=ws_event_outbox_repository,
            ha_control_gateway=ha_control_gateway,
            event_id_generator=event_id_generator,
            clock=clock,
            payload_validator=payload_validator,
            lifecycle_writer=lifecycle_writer,
        )

    @provider
    @singleton
    def provide_system_connection_service(
        self,
        system_connection_repository: SystemConnectionRepositoryImpl,
        settings_version_repository: SettingsVersionRepositoryImpl,
        management_pin_guard: ManagementPinGuard,
        ha_connection_gateway: HomeAssistantConnectionGateway,
        ha_entity_sync_service: HaEntitySyncService,
        home_assistant_bootstrap_provider: SettingsHomeAssistantBootstrapProvider,
        connection_secret_cipher: FernetConnectionSecretCipher,
        unit_of_work: PostgresUnitOfWork,
        clock: SystemClock,
    ) -> SystemConnectionService:
        return SystemConnectionService(
            system_connection_repository=system_connection_repository,
            settings_version_repository=settings_version_repository,
            management_pin_guard=management_pin_guard,
            ha_connection_gateway=ha_connection_gateway,
            ha_entity_sync_service=ha_entity_sync_service,
            home_assistant_bootstrap_provider=home_assistant_bootstrap_provider,
            connection_secret_cipher=connection_secret_cipher,
            unit_of_work=unit_of_work,
            clock=clock,
        )
