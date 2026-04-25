from __future__ import annotations

from functools import lru_cache

from src.modules.auth.services.command.BootstrapTokenService import BootstrapTokenService
from src.modules.auth.services.command.PinVerificationService import PinVerificationService
from src.modules.auth.services.command.TerminalPairingCodeService import (
    TerminalPairingCodeService,
)
from src.modules.auth.services.guard.ManagementPinGuard import ManagementPinGuard
from src.modules.auth.services.query.AccessTokenResolver import (
    AccessTokenResolver,
    JwtAccessTokenResolver,
)
from src.modules.auth.services.query.BootstrapTokenResolver import (
    BootstrapTokenResolver,
    JwtBootstrapTokenResolver,
)
from src.modules.auth.services.query.RequestContextService import RequestContextService
from src.modules.auth.services.query.SessionQueryService import SessionQueryService


def _root():
    from src.app import container

    return container


@lru_cache(maxsize=1)
def get_management_pin_guard() -> ManagementPinGuard:
    root = _root()
    return ManagementPinGuard(
        pin_session_repository=root.get_pin_session_repository(),
        clock=root.get_clock(),
    )


@lru_cache(maxsize=1)
def get_access_token_resolver() -> AccessTokenResolver:
    root = _root()
    settings = root.get_settings()
    return JwtAccessTokenResolver(
        secret=settings.access_token_secret,
        issuer=settings.access_token_issuer,
        audience=settings.access_token_audience,
        ttl_seconds=settings.access_token_ttl_seconds,
        leeway_seconds=settings.access_token_leeway_seconds,
    )


@lru_cache(maxsize=1)
def get_bootstrap_token_resolver() -> BootstrapTokenResolver:
    root = _root()
    settings = root.get_settings()
    return JwtBootstrapTokenResolver(
        secret=settings.bootstrap_token_secret,
        issuer=settings.access_token_issuer,
        audience=settings.access_token_audience,
        ttl_seconds=settings.bootstrap_token_ttl_seconds,
        leeway_seconds=settings.bootstrap_token_leeway_seconds,
    )


def get_request_context_service() -> RequestContextService:
    root = _root()
    return RequestContextService(
        root.get_database(),
        access_token_resolver=get_access_token_resolver(),
    )


@lru_cache(maxsize=1)
def get_session_query_service() -> SessionQueryService:
    root = _root()
    return SessionQueryService(
        auth_session_query_repository=root.get_auth_session_query_repository(),
        capability_provider=root.get_capability_provider(),
        clock=root.get_clock(),
    )


@lru_cache(maxsize=1)
def get_pin_verification_service() -> PinVerificationService:
    root = _root()
    return PinVerificationService(
        home_auth_config_repository=root.get_home_auth_config_repository(),
        pin_session_repository=root.get_pin_session_repository(),
        pin_lock_repository=root.get_pin_lock_repository(),
        id_generator=root.get_id_generator(),
        clock=root.get_clock(),
    )


@lru_cache(maxsize=1)
def get_bootstrap_token_service() -> BootstrapTokenService:
    root = _root()
    return BootstrapTokenService(
        repository=root.get_terminal_bootstrap_token_repository(),
        resolver=get_bootstrap_token_resolver(),
        clock=root.get_clock(),
    )


@lru_cache(maxsize=1)
def get_terminal_pairing_code_service() -> TerminalPairingCodeService:
    root = _root()
    return TerminalPairingCodeService(
        repository=root.get_terminal_pairing_code_repository(),
        bootstrap_token_service=get_bootstrap_token_service(),
        bootstrap_token_resolver=get_bootstrap_token_resolver(),
        connection_secret_cipher=root.get_connection_secret_cipher(),
        clock=root.get_clock(),
        pairing_code_ttl_seconds=root.get_settings().pairing_code_ttl_seconds,
        pairing_code_issue_cooldown_seconds=root.get_settings().pairing_code_issue_cooldown_seconds,
    )
