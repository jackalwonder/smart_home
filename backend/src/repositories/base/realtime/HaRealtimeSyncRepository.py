from __future__ import annotations

from typing import Protocol


class HaRealtimeSyncRepository(Protocol):
    async def list_home_ids(self) -> list[str]: ...
