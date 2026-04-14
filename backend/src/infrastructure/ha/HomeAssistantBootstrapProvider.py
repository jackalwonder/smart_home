from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol


@dataclass(frozen=True)
class HomeAssistantBootstrapConfig:
    connection_mode: str
    base_url: str
    auth_payload: dict[str, Any]


class HomeAssistantBootstrapProvider(Protocol):
    def get_config(self) -> HomeAssistantBootstrapConfig | None: ...
