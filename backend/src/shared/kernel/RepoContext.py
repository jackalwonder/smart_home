from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol


class DbTx(Protocol):
    @property
    def id(self) -> str: ...


@dataclass(frozen=True)
class RepoContext:
    tx: DbTx | None = None
    now: datetime | None = None
