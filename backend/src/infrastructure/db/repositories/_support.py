from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from psycopg.types.json import Jsonb
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.db.connection.Database import Database
from src.shared.kernel.RepoContext import RepoContext


@asynccontextmanager
async def session_scope(
    database: Database,
    ctx: RepoContext | None = None,
) -> AsyncIterator[tuple[AsyncSession, bool]]:
    tx_session = getattr(ctx.tx, "session", None) if ctx is not None and ctx.tx is not None else None
    if tx_session is not None:
        yield tx_session, False
        return

    async with database.session_factory()() as session:
        yield session, True


def as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def to_jsonb(value: Any) -> Jsonb:
    return Jsonb(value if value is not None else {})


def to_jsonb_list(value: Any) -> Jsonb:
    return Jsonb(value if value is not None else [])
