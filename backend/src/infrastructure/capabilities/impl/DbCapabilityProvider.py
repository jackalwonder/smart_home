from __future__ import annotations

from sqlalchemy import text

from src.infrastructure.capabilities.CapabilityProvider import CapabilitySnapshot
from src.infrastructure.db.connection.Database import Database
from src.infrastructure.db.repositories._support import as_dict
from src.shared.config.Settings import Settings


class DbCapabilityProvider:
    def __init__(self, database: Database, settings: Settings) -> None:
        self._database = database
        self._settings = settings

    async def get_capabilities(self, home_id: str) -> CapabilitySnapshot:
        async with self._database.session_factory()() as session:
            row = (
                await session.execute(
                    text(
                        """
                        SELECT capability_flags_json
                        FROM homes
                        WHERE id = :home_id
                        """
                    ),
                    {"home_id": home_id},
                )
            ).mappings().one_or_none()
        flags = as_dict(row["capability_flags_json"]) if row is not None else {}
        return CapabilitySnapshot(
            energy_enabled=bool(flags.get("energy_enabled", self._settings.capability_energy_enabled)),
            editor_enabled=bool(flags.get("editor_enabled", self._settings.capability_editor_enabled)),
        )
