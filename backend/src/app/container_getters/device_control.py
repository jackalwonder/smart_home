from __future__ import annotations

from src.app.container_getters._shared import resolve
from src.infrastructure.db.repositories.base.control.DeviceControlRequestRepositoryImpl import (
    DeviceControlRequestRepositoryImpl,
)
from src.infrastructure.db.repositories.base.control.DeviceControlTransitionRepositoryImpl import (
    DeviceControlTransitionRepositoryImpl,
)
from src.infrastructure.db.repositories.query.control.DeviceControlQueryRepositoryImpl import (
    DeviceControlQueryRepositoryImpl,
)
from src.modules.device_control.services.command.DeviceControlCommandService import (
    DeviceControlCommandService,
)
from src.modules.device_control.services.query.DeviceControlResultQueryService import (
    DeviceControlResultQueryService,
)


def get_device_control_query_repository() -> DeviceControlQueryRepositoryImpl:
    return resolve(DeviceControlQueryRepositoryImpl)


def get_device_control_request_repository() -> DeviceControlRequestRepositoryImpl:
    return resolve(DeviceControlRequestRepositoryImpl)


def get_device_control_transition_repository() -> DeviceControlTransitionRepositoryImpl:
    return resolve(DeviceControlTransitionRepositoryImpl)


def get_device_control_result_query_service() -> DeviceControlResultQueryService:
    return resolve(DeviceControlResultQueryService)


def get_device_control_command_service() -> DeviceControlCommandService:
    return resolve(DeviceControlCommandService)


__all__ = [
    "get_device_control_command_service",
    "get_device_control_query_repository",
    "get_device_control_request_repository",
    "get_device_control_result_query_service",
    "get_device_control_transition_repository",
]

