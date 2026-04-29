from __future__ import annotations

from injector import Module, provider, singleton

from src.infrastructure.db.connection.Database import Database
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


class AuthRepositoryModule(Module):
    @provider
    @singleton
    def provide_auth_session_query_repository(
        self, db: Database
    ) -> AuthSessionQueryRepositoryImpl:
        return AuthSessionQueryRepositoryImpl(db)

    @provider
    @singleton
    def provide_request_context_repository(
        self, db: Database
    ) -> RequestContextRepositoryImpl:
        return RequestContextRepositoryImpl(db)

    @provider
    @singleton
    def provide_home_auth_config_repository(
        self, db: Database
    ) -> HomeAuthConfigRepositoryImpl:
        return HomeAuthConfigRepositoryImpl(db)

    @provider
    @singleton
    def provide_pin_session_repository(self, db: Database) -> PinSessionRepositoryImpl:
        return PinSessionRepositoryImpl(db)

    @provider
    @singleton
    def provide_terminal_bootstrap_token_repository(
        self, db: Database
    ) -> TerminalBootstrapTokenRepositoryImpl:
        return TerminalBootstrapTokenRepositoryImpl(db)

    @provider
    @singleton
    def provide_terminal_pairing_code_repository(
        self, db: Database
    ) -> TerminalPairingCodeRepositoryImpl:
        return TerminalPairingCodeRepositoryImpl(db)

    @provider
    @singleton
    def provide_pin_lock_repository(self, db: Database) -> PinLockRepositoryImpl:
        return PinLockRepositoryImpl(db)
