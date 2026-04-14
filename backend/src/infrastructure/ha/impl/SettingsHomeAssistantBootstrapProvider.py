from __future__ import annotations

from src.infrastructure.ha.HomeAssistantBootstrapProvider import (
    HomeAssistantBootstrapConfig,
)
from src.shared.config.Settings import Settings


class SettingsHomeAssistantBootstrapProvider:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def get_config(self) -> HomeAssistantBootstrapConfig | None:
        if not self._settings.home_assistant_bootstrap_enabled:
            return None
        base_url = self._settings.home_assistant_bootstrap_url.strip()
        access_token = (self._settings.home_assistant_bootstrap_access_token or "").strip()
        if not base_url or not access_token:
            return None
        return HomeAssistantBootstrapConfig(
            connection_mode=self._settings.home_assistant_bootstrap_connection_mode,
            base_url=base_url.rstrip("/"),
            auth_payload={"access_token": access_token},
        )
