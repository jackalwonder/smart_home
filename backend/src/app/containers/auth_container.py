from __future__ import annotations

from functools import lru_cache

from src.app.containers import core_container, repositories_container
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


@lru_cache(maxsize=1)
def get_management_pin_guard() -> ManagementPinGuard:
    return ManagementPinGuard(
        pin_session_repository=repositories_container.get_pin_session_repository(),
        clock=core_container.get_clock(),
    )


@lru_cache(maxsize=1)
def get_access_token_resolver() -> AccessTokenResolver:
    settings = core_container.get_settings()
    return JwtAccessTokenResolver(
        secret=settings.access_token_secret,
        issuer=settings.access_token_issuer,
        audience=settings.access_token_audience,
        ttl_seconds=settings.access_token_ttl_seconds,
        leeway_seconds=settings.access_token_leeway_seconds,
    )


@lru_cache(maxsize=1)
def get_bootstrap_token_resolver() -> BootstrapTokenResolver:
    settings = core_container.get_settings()
    return JwtBootstrapTokenResolver(
        secret=settings.bootstrap_token_secret,
        issuer=settings.access_token_issuer,
        audience=settings.access_token_audience,
        ttl_seconds=settings.bootstrap_token_ttl_seconds,
        leeway_seconds=settings.bootstrap_token_leeway_seconds,
    )


def get_request_context_service() -> RequestContextService:
    return RequestContextService(
        repositories_container.get_request_context_repository(),
        access_token_resolver=get_access_token_resolver(),
    )


@lru_cache(maxsize=1)
def get_session_query_service() -> SessionQueryService:
    return SessionQueryService(
        auth_session_query_repository=repositories_container.get_auth_session_query_repository(),
        capability_provider=core_container.get_capability_provider(),
        clock=core_container.get_clock(),
    )


@lru_cache(maxsize=1)
def get_pin_verification_service() -> PinVerificationService:
    return PinVerificationService(
        home_auth_config_repository=repositories_container.get_home_auth_config_repository(),
        pin_session_repository=repositories_container.get_pin_session_repository(),
        pin_lock_repository=repositories_container.get_pin_lock_repository(),
        id_generator=core_container.get_id_generator(),
        clock=core_container.get_clock(),
    )


@lru_cache(maxsize=1)
def get_bootstrap_token_service() -> BootstrapTokenService:
    return BootstrapTokenService(
        repository=repositories_container.get_terminal_bootstrap_token_repository(),
        resolver=get_bootstrap_token_resolver(),
        clock=core_container.get_clock(),
    )


@lru_cache(maxsize=1)
def get_terminal_pairing_code_service() -> TerminalPairingCodeService:
    settings = core_container.get_settings()
    return TerminalPairingCodeService(
        repository=repositories_container.get_terminal_pairing_code_repository(),
        bootstrap_token_service=get_bootstrap_token_service(),
        bootstrap_token_resolver=get_bootstrap_token_resolver(),
        connection_secret_cipher=core_container.get_connection_secret_cipher(),
        clock=core_container.get_clock(),
        pairing_code_ttl_seconds=settings.pairing_code_ttl_seconds,
        pairing_code_issue_cooldown_seconds=settings.pairing_code_issue_cooldown_seconds,
    )
