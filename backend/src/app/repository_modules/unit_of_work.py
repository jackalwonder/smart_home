from __future__ import annotations

from injector import Module, provider, singleton

from src.infrastructure.db.connection.Database import Database
from src.infrastructure.db.unit_of_work.PostgresUnitOfWork import PostgresUnitOfWork


class UnitOfWorkModule(Module):
    @provider
    @singleton
    def provide_unit_of_work(self, db: Database) -> PostgresUnitOfWork:
        return PostgresUnitOfWork(db)
