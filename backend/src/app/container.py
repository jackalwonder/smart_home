from __future__ import annotations

from datetime import datetime, timezone
from functools import lru_cache
from uuid import uuid4

from src.infrastructure.capabilities.impl.StaticCapabilityProvider import StaticCapabilityProvider
from src.infrastructure.db.connection.Database import Database
from src.infrastructure.db.repositories.base.control.DeviceControlRequestRepositoryImpl import (
    DeviceControlRequestRepositoryImpl,
)
from src.infrastructure.db.repositories.base.control.DeviceControlTransitionRepositoryImpl import (
    DeviceControlTransitionRepositoryImpl,
)
from src.infrastructure.db.repositories.base.devices.DeviceControlSchemaRepositoryImpl import (
    DeviceControlSchemaRepositoryImpl,
)
from src.infrastructure.db.repositories.base.devices.DeviceRepositoryImpl import DeviceRepositoryImpl
from src.infrastructure.db.repositories.base.devices.DeviceRuntimeStateRepositoryImpl import (
    DeviceRuntimeStateRepositoryImpl,
)
from src.infrastructure.db.repositories.base.realtime.WsEventOutboxRepositoryImpl import (
    WsEventOutboxRepositoryImpl,
)
from src.infrastructure.db.repositories.query.auth.AuthSessionQueryRepositoryImpl import (
    AuthSessionQueryRepositoryImpl,
)
from src.infrastructure.db.repositories.query.overview.HomeOverviewQueryRepositoryImpl import (
    HomeOverviewQueryRepositoryImpl,
)
from src.infrastructure.db.unit_of_work.PostgresUnitOfWork import PostgresUnitOfWork
from src.infrastructure.ha.impl.NoopHaControlGateway import NoopHaControlGateway
from src.infrastructure.weather.impl.StaticWeatherProvider import StaticWeatherProvider
from src.modules.auth.services.query.SessionQueryService import SessionQueryService
from src.modules.device_control.services.command.DeviceControlCommandService import (
    DeviceControlCommandService,
)
from src.modules.home_overview.services.query.HomeOverviewQueryService import (
    HomeOverviewQueryService,
)
from src.shared.config.Settings import get_settings


class SystemClock:
    def now(self) -> datetime:
        return datetime.now(timezone.utc)


class UuidEventIdGenerator:
    def next_event_id(self) -> str:
        return str(uuid4())


@lru_cache(maxsize=1)
def get_database() -> Database:
    return Database(get_settings().database_url)


@lru_cache(maxsize=1)
def get_clock() -> SystemClock:
    return SystemClock()


@lru_cache(maxsize=1)
def get_event_id_generator() -> UuidEventIdGenerator:
    return UuidEventIdGenerator()


@lru_cache(maxsize=1)
def get_capability_provider() -> StaticCapabilityProvider:
    settings = get_settings()
    return StaticCapabilityProvider(
        energy_enabled=settings.capability_energy_enabled,
        editor_enabled=settings.capability_editor_enabled,
    )


@lru_cache(maxsize=1)
def get_weather_provider() -> StaticWeatherProvider:
    return StaticWeatherProvider(get_clock())


@lru_cache(maxsize=1)
def get_ha_control_gateway() -> NoopHaControlGateway:
    return NoopHaControlGateway()


@lru_cache(maxsize=1)
def get_auth_session_query_repository() -> AuthSessionQueryRepositoryImpl:
    return AuthSessionQueryRepositoryImpl(get_database())


@lru_cache(maxsize=1)
def get_home_overview_query_repository() -> HomeOverviewQueryRepositoryImpl:
    return HomeOverviewQueryRepositoryImpl(get_database())


@lru_cache(maxsize=1)
def get_device_repository() -> DeviceRepositoryImpl:
    return DeviceRepositoryImpl(get_database())


@lru_cache(maxsize=1)
def get_device_runtime_state_repository() -> DeviceRuntimeStateRepositoryImpl:
    return DeviceRuntimeStateRepositoryImpl(get_database())


@lru_cache(maxsize=1)
def get_device_control_schema_repository() -> DeviceControlSchemaRepositoryImpl:
    return DeviceControlSchemaRepositoryImpl(get_database())


@lru_cache(maxsize=1)
def get_device_control_request_repository() -> DeviceControlRequestRepositoryImpl:
    return DeviceControlRequestRepositoryImpl(get_database())


@lru_cache(maxsize=1)
def get_device_control_transition_repository() -> DeviceControlTransitionRepositoryImpl:
    return DeviceControlTransitionRepositoryImpl(get_database())


@lru_cache(maxsize=1)
def get_ws_event_outbox_repository() -> WsEventOutboxRepositoryImpl:
    return WsEventOutboxRepositoryImpl(get_database())


@lru_cache(maxsize=1)
def get_unit_of_work() -> PostgresUnitOfWork:
    return PostgresUnitOfWork(get_database())


@lru_cache(maxsize=1)
def get_session_query_service() -> SessionQueryService:
    return SessionQueryService(
        auth_session_query_repository=get_auth_session_query_repository(),
        capability_provider=get_capability_provider(),
        clock=get_clock(),
    )


@lru_cache(maxsize=1)
def get_home_overview_query_service() -> HomeOverviewQueryService:
    return HomeOverviewQueryService(
        home_overview_query_repository=get_home_overview_query_repository(),
        weather_provider=get_weather_provider(),
    )


@lru_cache(maxsize=1)
def get_device_control_command_service() -> DeviceControlCommandService:
    return DeviceControlCommandService(
        unit_of_work=get_unit_of_work(),
        device_repository=get_device_repository(),
        device_runtime_state_repository=get_device_runtime_state_repository(),
        device_control_schema_repository=get_device_control_schema_repository(),
        device_control_request_repository=get_device_control_request_repository(),
        device_control_transition_repository=get_device_control_transition_repository(),
        ws_event_outbox_repository=get_ws_event_outbox_repository(),
        ha_control_gateway=get_ha_control_gateway(),
        event_id_generator=get_event_id_generator(),
        clock=get_clock(),
    )
