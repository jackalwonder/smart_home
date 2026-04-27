from __future__ import annotations

from injector import Module, provider, singleton

from src.shared.kernel.implementations import SystemClock, UuidIdGenerator
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
from src.infrastructure.capabilities.impl.DbCapabilityProvider import DbCapabilityProvider
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
from src.infrastructure.security.impl.FernetConnectionSecretCipher import (
    FernetConnectionSecretCipher,
)
from src.shared.config.Settings import Settings


class AuthModule(Module):
    @provider
    @singleton
    def provide_management_pin_guard(
        self,
        pin_session_repo: PinSessionRepositoryImpl,
        clock: SystemClock,
    ) -> ManagementPinGuard:
        return ManagementPinGuard(
            pin_session_repository=pin_session_repo,
            clock=clock,
        )

    @provider
    @singleton
    def provide_access_token_resolver(
        self, settings: Settings
    ) -> JwtAccessTokenResolver:
        return JwtAccessTokenResolver(
            secret=settings.access_token_secret,
            issuer=settings.access_token_issuer,
            audience=settings.access_token_audience,
            ttl_seconds=settings.access_token_ttl_seconds,
            leeway_seconds=settings.access_token_leeway_seconds,
        )

    @provider
    @singleton
    def provide_bootstrap_token_resolver(
        self, settings: Settings
    ) -> JwtBootstrapTokenResolver:
        return JwtBootstrapTokenResolver(
            secret=settings.bootstrap_token_secret,
            issuer=settings.access_token_issuer,
            audience=settings.access_token_audience,
            ttl_seconds=settings.bootstrap_token_ttl_seconds,
            leeway_seconds=settings.bootstrap_token_leeway_seconds,
        )

    @provider
    def provide_request_context_service(
        self,
        request_context_repo: RequestContextRepositoryImpl,
        access_token_resolver: JwtAccessTokenResolver,
    ) -> RequestContextService:
        return RequestContextService(request_context_repo, access_token_resolver)

    @provider
    @singleton
    def provide_session_query_service(
        self,
        auth_session_query_repo: AuthSessionQueryRepositoryImpl,
        capability_provider: DbCapabilityProvider,
        clock: SystemClock,
    ) -> SessionQueryService:
        return SessionQueryService(
            auth_session_query_repository=auth_session_query_repo,
            capability_provider=capability_provider,
            clock=clock,
        )

    @provider
    @singleton
    def provide_pin_verification_service(
        self,
        home_auth_config_repo: HomeAuthConfigRepositoryImpl,
        pin_session_repo: PinSessionRepositoryImpl,
        pin_lock_repo: PinLockRepositoryImpl,
        id_generator: UuidIdGenerator,
        clock: SystemClock,
    ) -> PinVerificationService:
        return PinVerificationService(
            home_auth_config_repository=home_auth_config_repo,
            pin_session_repository=pin_session_repo,
            pin_lock_repository=pin_lock_repo,
            id_generator=id_generator,
            clock=clock,
        )

    @provider
    @singleton
    def provide_bootstrap_token_service(
        self,
        repository: TerminalBootstrapTokenRepositoryImpl,
        resolver: JwtBootstrapTokenResolver,
        clock: SystemClock,
    ) -> BootstrapTokenService:
        return BootstrapTokenService(
            repository=repository,
            resolver=resolver,
            clock=clock,
        )

    @provider
    @singleton
    def provide_terminal_pairing_code_service(
        self,
        settings: Settings,
        repository: TerminalPairingCodeRepositoryImpl,
        bootstrap_token_service: BootstrapTokenService,
        bootstrap_token_resolver: JwtBootstrapTokenResolver,
        connection_secret_cipher: FernetConnectionSecretCipher,
        clock: SystemClock,
    ) -> TerminalPairingCodeService:
        return TerminalPairingCodeService(
            repository=repository,
            bootstrap_token_service=bootstrap_token_service,
            bootstrap_token_resolver=bootstrap_token_resolver,
            connection_secret_cipher=connection_secret_cipher,
            clock=clock,
            pairing_code_ttl_seconds=settings.pairing_code_ttl_seconds,
            pairing_code_issue_cooldown_seconds=settings.pairing_code_issue_cooldown_seconds,
        )
