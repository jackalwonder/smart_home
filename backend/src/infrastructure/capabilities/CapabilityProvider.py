from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class CapabilitySnapshot:
    energy_enabled: bool
    editor_enabled: bool


class CapabilityProvider(Protocol):
    async def get_capabilities(self, home_id: str) -> CapabilitySnapshot: ...
