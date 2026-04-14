from __future__ import annotations

from src.infrastructure.capabilities.CapabilityProvider import CapabilitySnapshot


class StaticCapabilityProvider:
    def __init__(self, energy_enabled: bool, editor_enabled: bool) -> None:
        self._energy_enabled = energy_enabled
        self._editor_enabled = editor_enabled

    async def get_capabilities(self, home_id: str) -> CapabilitySnapshot:
        return CapabilitySnapshot(
            energy_enabled=self._energy_enabled,
            editor_enabled=self._editor_enabled,
        )
