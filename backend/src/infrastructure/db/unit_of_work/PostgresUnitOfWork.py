from __future__ import annotations

from dataclasses import dataclass, field
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.db.connection.Database import Database


@dataclass(frozen=True)
class SqlAlchemyDbTx:
    session: AsyncSession
    id: str = field(default_factory=lambda: str(uuid4()))


class PostgresUnitOfWork:
    def __init__(self, database: Database) -> None:
        self._database = database

    async def run_in_transaction(self, fn):
        async with self._database.session_factory() as session:
            async with session.begin():
                tx = SqlAlchemyDbTx(session=session)
                return await fn(tx)
