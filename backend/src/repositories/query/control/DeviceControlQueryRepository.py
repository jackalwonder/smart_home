from __future__ import annotations

from typing import Protocol

from src.repositories.read_models.index import DeviceControlResultReadModel
from src.shared.kernel.RepoContext import RepoContext


class DeviceControlQueryRepository(Protocol):
    async def get_control_result(
        self,
        home_id: str,
        request_id: str,
        ctx: RepoContext | None = None,
    ) -> DeviceControlResultReadModel | None: ...
