from __future__ import annotations

from src.app.container_getters._shared import resolve
from src.infrastructure.db.unit_of_work.PostgresUnitOfWork import PostgresUnitOfWork


def get_unit_of_work() -> PostgresUnitOfWork:
    return resolve(PostgresUnitOfWork)


__all__ = [
    "get_unit_of_work",
]

