from __future__ import annotations

from src.app.container_getters._shared import resolve
from src.infrastructure.db.repositories.base.auth.HomeAuthConfigRepositoryImpl import (
    HomeAuthConfigRepositoryImpl,
)
from src.infrastructure.db.repositories.base.auth.PinLockRepositoryImpl import PinLockRepositoryImpl
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
from src.modules.auth.services.command.BootstrapTokenService import BootstrapTokenService
from src.modules.auth.services.command.PinVerificationService import PinVerificationService
from src.modules.auth.services.command.TerminalPairingCodeService import (
    TerminalPairingCodeService,
)
from src.modules.auth.services.guard.ManagementPinGuard import ManagementPinGuard
from src.modules.auth.services.query.AccessTokenResolver import JwtAccessTokenResolver
from src.modules.auth.services.query.BootstrapTokenResolver import JwtBootstrapTokenResolver
from src.modules.auth.services.query.RequestContextService import RequestContextService
from src.modules.auth.services.query.SessionQueryService import SessionQueryService


def get_auth_session_query_repository() -> AuthSessionQueryRepositoryImpl:
    return resolve(AuthSessionQueryRepositoryImpl)


def get_request_context_repository() -> RequestContextRepositoryImpl:
    return resolve(RequestContextRepositoryImpl)


def get_home_auth_config_repository() -> HomeAuthConfigRepositoryImpl:
    return resolve(HomeAuthConfigRepositoryImpl)


def get_pin_session_repository() -> PinSessionRepositoryImpl:
    return resolve(PinSessionRepositoryImpl)


def get_terminal_bootstrap_token_repository() -> TerminalBootstrapTokenRepositoryImpl:
    return resolve(TerminalBootstrapTokenRepositoryImpl)


def get_terminal_pairing_code_repository() -> TerminalPairingCodeRepositoryImpl:
    return resolve(TerminalPairingCodeRepositoryImpl)


def get_pin_lock_repository() -> PinLockRepositoryImpl:
    return resolve(PinLockRepositoryImpl)


def get_management_pin_guard() -> ManagementPinGuard:
    return resolve(ManagementPinGuard)


def get_access_token_resolver() -> JwtAccessTokenResolver:
    return resolve(JwtAccessTokenResolver)


def get_bootstrap_token_resolver() -> JwtBootstrapTokenResolver:
    return resolve(JwtBootstrapTokenResolver)


def get_request_context_service() -> RequestContextService:
    return resolve(RequestContextService)


def get_session_query_service() -> SessionQueryService:
    return resolve(SessionQueryService)


def get_pin_verification_service() -> PinVerificationService:
    return resolve(PinVerificationService)


def get_bootstrap_token_service() -> BootstrapTokenService:
    return resolve(BootstrapTokenService)


def get_terminal_pairing_code_service() -> TerminalPairingCodeService:
    return resolve(TerminalPairingCodeService)


__all__ = [
    "get_access_token_resolver",
    "get_auth_session_query_repository",
    "get_bootstrap_token_resolver",
    "get_bootstrap_token_service",
    "get_home_auth_config_repository",
    "get_management_pin_guard",
    "get_pin_lock_repository",
    "get_pin_session_repository",
    "get_pin_verification_service",
    "get_request_context_repository",
    "get_request_context_service",
    "get_session_query_service",
    "get_terminal_bootstrap_token_repository",
    "get_terminal_pairing_code_repository",
    "get_terminal_pairing_code_service",
]

