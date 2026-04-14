from __future__ import annotations

from datetime import datetime

from sqlalchemy import text

from src.infrastructure.db.connection.Database import Database
from src.infrastructure.db.repositories._support import session_scope
from src.repositories.query.auth.AuthSessionQueryRepository import (
    AuthSessionContextReadModel,
)
from src.repositories.read_models.index import CurrentSettingsVersion, FunctionSettingsReadModel
from src.repositories.rows.index import HomeAuthConfigRow, HomeRow, PinSessionRow, TerminalRow
from src.shared.kernel.RepoContext import RepoContext


class AuthSessionQueryRepositoryImpl:
    def __init__(self, database: Database) -> None:
        self._database = database

    async def get_auth_session_context(
        self,
        home_id: str,
        terminal_id: str,
        now: datetime,
        ctx: RepoContext | None = None,
    ) -> AuthSessionContextReadModel:
        async with session_scope(self._database, ctx) as (session, _):
            home_row = (
                await session.execute(
                    text(
                        """
                        SELECT
                            id::text AS id,
                            home_code,
                            display_name,
                            timezone,
                            status
                        FROM homes
                        WHERE id = :home_id
                        """
                    ),
                    {"home_id": home_id},
                )
            ).mappings().one()
            terminal_row = (
                await session.execute(
                    text(
                        """
                        SELECT
                            id::text AS id,
                            home_id::text AS home_id,
                            terminal_code,
                            terminal_mode::text AS terminal_mode,
                            terminal_name
                        FROM terminals
                        WHERE id = :terminal_id
                          AND home_id = :home_id
                        """
                    ),
                    {"terminal_id": terminal_id, "home_id": home_id},
                )
            ).mappings().one()
            auth_row = (
                await session.execute(
                    text(
                        """
                        SELECT
                            id::text AS id,
                            home_id::text AS home_id,
                            login_mode::text AS login_mode,
                            pin_retry_limit,
                            pin_lock_minutes,
                            pin_session_ttl_seconds
                        FROM home_auth_configs
                        WHERE home_id = :home_id
                        """
                    ),
                    {"home_id": home_id},
                )
            ).mappings().one()
            pin_row = (
                await session.execute(
                    text(
                        """
                        SELECT
                            id::text AS id,
                            home_id::text AS home_id,
                            terminal_id::text AS terminal_id,
                            member_id::text AS member_id,
                            verified_for_action,
                            is_active,
                            verified_at::text AS verified_at,
                            expires_at::text AS expires_at
                        FROM pin_sessions
                        WHERE home_id = :home_id
                          AND terminal_id = :terminal_id
                          AND is_active = true
                          AND expires_at > :now
                        ORDER BY verified_at DESC
                        LIMIT 1
                        """
                    ),
                    {"home_id": home_id, "terminal_id": terminal_id, "now": now},
                )
            ).mappings().one_or_none()
            settings_row = (
                await session.execute(
                    text(
                        """
                        SELECT
                            id::text AS id,
                            home_id::text AS home_id,
                            settings_version,
                            effective_at::text AS effective_at
                        FROM v_current_settings_versions
                        WHERE home_id = :home_id
                        """
                    ),
                    {"home_id": home_id},
                )
            ).mappings().one_or_none()

            function_settings_row = None
            if settings_row is not None:
                function_settings_row = (
                    await session.execute(
                        text(
                            """
                            SELECT
                                music_enabled,
                                low_battery_threshold::float8 AS low_battery_threshold,
                                offline_threshold_seconds,
                                favorite_limit
                            FROM function_settings
                            WHERE settings_version_id = :settings_version_id
                            """
                        ),
                        {"settings_version_id": settings_row["id"]},
                    )
                ).mappings().one_or_none()

        return AuthSessionContextReadModel(
            home=HomeRow(
                id=home_row["id"],
                home_code=home_row["home_code"],
                display_name=home_row["display_name"],
                timezone=home_row["timezone"],
                status=home_row["status"],
            ),
            terminal=TerminalRow(
                id=terminal_row["id"],
                home_id=terminal_row["home_id"],
                terminal_code=terminal_row["terminal_code"],
                terminal_mode=terminal_row["terminal_mode"],
                terminal_name=terminal_row["terminal_name"],
            ),
            auth_config=HomeAuthConfigRow(
                id=auth_row["id"],
                home_id=auth_row["home_id"],
                login_mode=auth_row["login_mode"],
                pin_retry_limit=auth_row["pin_retry_limit"],
                pin_lock_minutes=auth_row["pin_lock_minutes"],
                pin_session_ttl_seconds=auth_row["pin_session_ttl_seconds"],
            ),
            active_pin_session=PinSessionRow(
                id=pin_row["id"],
                home_id=pin_row["home_id"],
                terminal_id=pin_row["terminal_id"],
                member_id=pin_row["member_id"],
                verified_for_action=pin_row["verified_for_action"],
                is_active=pin_row["is_active"],
                verified_at=pin_row["verified_at"],
                expires_at=pin_row["expires_at"],
            )
            if pin_row is not None
            else None,
            current_settings_version=CurrentSettingsVersion(
                id=settings_row["id"],
                home_id=settings_row["home_id"],
                settings_version=settings_row["settings_version"],
                effective_at=settings_row["effective_at"],
            )
            if settings_row is not None
            else None,
            function_settings=FunctionSettingsReadModel(
                music_enabled=function_settings_row["music_enabled"],
                low_battery_threshold=function_settings_row["low_battery_threshold"],
                offline_threshold_seconds=function_settings_row["offline_threshold_seconds"],
                favorite_limit=function_settings_row["favorite_limit"],
            )
            if function_settings_row is not None
            else None,
        )
