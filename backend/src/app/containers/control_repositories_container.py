from __future__ import annotations

from functools import lru_cache

from src.app.containers import core_container
from src.infrastructure.db.repositories.base.control.DeviceControlRequestRepositoryImpl import (
    DeviceControlRequestRepositoryImpl,
)
from src.infrastructure.db.repositories.base.control.DeviceControlTransitionRepositoryImpl import (
    DeviceControlTransitionRepositoryImpl,
)
from src.infrastructure.db.repositories.query.control.DeviceControlQueryRepositoryImpl import (
    DeviceControlQueryRepositoryImpl,
)


def _database():
    return core_container.get_database()


@lru_cache(maxsize=1)
def get_device_control_query_repository() -> DeviceControlQueryRepositoryImpl:
    return DeviceControlQueryRepositoryImpl(_database())


@lru_cache(maxsize=1)
def get_device_control_request_repository() -> DeviceControlRequestRepositoryImpl:
    return DeviceControlRequestRepositoryImpl(_database())


@lru_cache(maxsize=1)
def get_device_control_transition_repository() -> DeviceControlTransitionRepositoryImpl:
    return DeviceControlTransitionRepositoryImpl(_database())
