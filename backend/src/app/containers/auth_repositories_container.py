from __future__ import annotations

from functools import lru_cache

from src.app.containers import core_container
from src.infrastructure.db.repositories.base.auth.HomeAuthConfigRepositoryImpl import (
    HomeAuthConfigRepositoryImpl,
)
from src.infrastructure.db.repositories.base.auth.PinLockRepositoryImpl import (
    PinLockRepositoryImpl,
)
from src.infrastructure.db.repositories.base.auth.PinSessionRepositoryImpl import (
    PinSessionRepositoryImpl,
)
from src.infrastructure.db.repositories.base.auth.TerminalBootstrapTokenRepositoryImpl import (
    TerminalBootstrapTokenRepositoryImpl,
)
from src.infrastructure.db.repositories.base.auth.TerminalPairingCodeRepositoryImpl import (
    TerminalPairingCodeRepositoryImpl,
)
from src.infrastructure.db.repositories.query.auth.AuthSessionQueryRepositoryImpl import (
    AuthSessionQueryRepositoryImpl,
)
from src.infrastructure.db.repositories.query.auth.RequestContextRepositoryImpl import (
    RequestContextRepositoryImpl,
)


def _database():
    return core_container.get_database()


@lru_cache(maxsize=1)
def get_auth_session_query_repository() -> AuthSessionQueryRepositoryImpl:
    return AuthSessionQueryRepositoryImpl(_database())


@lru_cache(maxsize=1)
def get_request_context_repository() -> RequestContextRepositoryImpl:
    return RequestContextRepositoryImpl(_database())


@lru_cache(maxsize=1)
def get_home_auth_config_repository() -> HomeAuthConfigRepositoryImpl:
    return HomeAuthConfigRepositoryImpl(_database())


@lru_cache(maxsize=1)
def get_pin_session_repository() -> PinSessionRepositoryImpl:
    return PinSessionRepositoryImpl(_database())


@lru_cache(maxsize=1)
def get_terminal_bootstrap_token_repository() -> TerminalBootstrapTokenRepositoryImpl:
    return TerminalBootstrapTokenRepositoryImpl(_database())


@lru_cache(maxsize=1)
def get_terminal_pairing_code_repository() -> TerminalPairingCodeRepositoryImpl:
    return TerminalPairingCodeRepositoryImpl(_database())


@lru_cache(maxsize=1)
def get_pin_lock_repository() -> PinLockRepositoryImpl:
    return PinLockRepositoryImpl(_database())
