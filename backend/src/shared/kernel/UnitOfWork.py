from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Protocol, TypeVar

from src.shared.kernel.RepoContext import DbTx

T = TypeVar("T")


class UnitOfWork(Protocol):
    async def run_in_transaction(self, fn: Callable[[DbTx], Awaitable[T]]) -> T: ...
