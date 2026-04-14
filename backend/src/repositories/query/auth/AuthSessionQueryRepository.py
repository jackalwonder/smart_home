from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

from src.repositories.read_models.index import CurrentSettingsVersion, FunctionSettingsReadModel
from src.repositories.rows.index import HomeAuthConfigRow, HomeRow, PinSessionRow, TerminalRow
from src.shared.kernel.RepoContext import RepoContext


@dataclass(frozen=True)
class AuthSessionContextReadModel:
    home: HomeRow
    terminal: TerminalRow
    auth_config: HomeAuthConfigRow
    active_pin_session: PinSessionRow | None
    current_settings_version: CurrentSettingsVersion | None
    function_settings: FunctionSettingsReadModel | None


class AuthSessionQueryRepository(Protocol):
    async def get_auth_session_context(
        self,
        home_id: str,
        terminal_id: str,
        now: datetime,
        ctx: RepoContext | None = None,
    ) -> AuthSessionContextReadModel: ...
