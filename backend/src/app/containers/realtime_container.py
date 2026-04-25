from __future__ import annotations

from functools import lru_cache

from src.app.containers import auth_container, core_container, repositories_container
from src.modules.device_control.services.command.DeviceControlCommandService import (
    DeviceControlCommandService,
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


@lru_cache(maxsize=1)
def get_ha_entity_sync_service() -> HaEntitySyncService:
    return HaEntitySyncService(
        clock=core_container.get_clock(),
        ha_entity_sync_repository=repositories_container.get_ha_entity_sync_repository(),
        device_control_schema_repository=repositories_container.get_device_control_schema_repository(),
    )


@lru_cache(maxsize=1)
def get_ha_realtime_sync_service() -> HaRealtimeSyncService:
    return HaRealtimeSyncService(
        ha_realtime_sync_repository=repositories_container.get_ha_realtime_sync_repository(),
        unit_of_work=repositories_container.get_unit_of_work(),
        ha_connection_gateway=core_container.get_ha_connection_gateway(),
        ha_entity_sync_service=get_ha_entity_sync_service(),
        system_connection_repository=repositories_container.get_system_connection_repository(),
        ws_event_outbox_repository=repositories_container.get_ws_event_outbox_repository(),
        home_assistant_bootstrap_provider=core_container.get_home_assistant_bootstrap_provider(),
        connection_secret_cipher=core_container.get_connection_secret_cipher(),
        event_id_generator=core_container.get_event_id_generator(),
        clock=core_container.get_clock(),
    )


@lru_cache(maxsize=1)
def get_device_control_result_query_service() -> DeviceControlResultQueryService:
    return DeviceControlResultQueryService(
        device_control_query_repository=repositories_container.get_device_control_query_repository(),
    )


@lru_cache(maxsize=1)
def get_realtime_service() -> RealtimeService:
    return RealtimeService(
        ws_event_outbox_repository=repositories_container.get_ws_event_outbox_repository(),
        terminal_presence_repository=repositories_container.get_terminal_presence_repository(),
    )


@lru_cache(maxsize=1)
def get_device_control_command_service() -> DeviceControlCommandService:
    return DeviceControlCommandService(
        unit_of_work=repositories_container.get_unit_of_work(),
        device_repository=repositories_container.get_device_repository(),
        device_runtime_state_repository=repositories_container.get_device_runtime_state_repository(),
        device_control_schema_repository=repositories_container.get_device_control_schema_repository(),
        device_control_request_repository=repositories_container.get_device_control_request_repository(),
        device_control_transition_repository=repositories_container.get_device_control_transition_repository(),
        ws_event_outbox_repository=repositories_container.get_ws_event_outbox_repository(),
        ha_control_gateway=core_container.get_ha_control_gateway(),
        event_id_generator=core_container.get_event_id_generator(),
        clock=core_container.get_clock(),
    )


@lru_cache(maxsize=1)
def get_system_connection_service() -> SystemConnectionService:
    return SystemConnectionService(
        system_connection_repository=repositories_container.get_system_connection_repository(),
        settings_version_repository=repositories_container.get_settings_version_repository(),
        management_pin_guard=auth_container.get_management_pin_guard(),
        ha_connection_gateway=core_container.get_ha_connection_gateway(),
        ha_entity_sync_service=get_ha_entity_sync_service(),
        home_assistant_bootstrap_provider=core_container.get_home_assistant_bootstrap_provider(),
        connection_secret_cipher=core_container.get_connection_secret_cipher(),
        unit_of_work=repositories_container.get_unit_of_work(),
        clock=core_container.get_clock(),
    )
