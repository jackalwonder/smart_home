from __future__ import annotations

from sqlalchemy import text

from src.infrastructure.db.connection.Database import Database
from src.infrastructure.db.repositories._support import session_scope
from src.repositories.base.auth.TerminalBootstrapTokenRepository import (
    NewTerminalBootstrapTokenRow,
    RotatedTerminalBootstrapToken,
    TerminalBootstrapTokenRow,
)
from src.repositories.rows.index import TerminalRow
from src.shared.kernel.RepoContext import RepoContext


def _to_bootstrap_token_row(row) -> TerminalBootstrapTokenRow:
    return TerminalBootstrapTokenRow(
        id=row["id"],
        home_id=row["home_id"],
        terminal_id=row["terminal_id"],
        terminal_mode=row["terminal_mode"],
        token_jti=row["token_jti"],
        issued_at=row["issued_at"],
        expires_at=row["expires_at"],
        last_used_at=row["last_used_at"],
        revoked_at=row["revoked_at"],
    )


class TerminalBootstrapTokenRepositoryImpl:
    def __init__(self, database: Database) -> None:
        self._database = database

    async def find_terminal(
        self,
        home_id: str,
        terminal_id: str,
        ctx: RepoContext | None = None,
    ) -> TerminalRow | None:
        stmt = text(
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
        )
        async with session_scope(self._database, ctx) as (session, _):
            row = (
                await session.execute(
                    stmt,
                    {"home_id": home_id, "terminal_id": terminal_id},
                )
            ).mappings().one_or_none()
        if row is None:
            return None
        return TerminalRow(
            id=row["id"],
            home_id=row["home_id"],
            terminal_code=row["terminal_code"],
            terminal_mode=row["terminal_mode"],
            terminal_name=row["terminal_name"],
        )

    async def rotate_for_terminal(
        self,
        input: NewTerminalBootstrapTokenRow,
        revoked_at: str,
        ctx: RepoContext | None = None,
    ) -> RotatedTerminalBootstrapToken:
        revoke_stmt = text(
            """
            UPDATE terminal_bootstrap_tokens
            SET revoked_at = :revoked_at, updated_at = now()
            WHERE terminal_id = :terminal_id
              AND revoked_at IS NULL
              AND expires_at > :revoked_at
            """
        )
        insert_stmt = text(
            """
            INSERT INTO terminal_bootstrap_tokens (
                terminal_id,
                token_hash,
                token_jti,
                issued_at,
                expires_at,
                created_by_member_id,
                created_by_terminal_id
            ) VALUES (
                :terminal_id,
                :token_hash,
                :token_jti,
                :issued_at,
                :expires_at,
                :created_by_member_id,
                :created_by_terminal_id
            )
            RETURNING
                id::text AS id,
                token_jti,
                issued_at::text AS issued_at,
                expires_at::text AS expires_at,
                last_used_at::text AS last_used_at,
                revoked_at::text AS revoked_at
            """
        )
        terminal_stmt = text(
            """
            SELECT
                t.home_id::text AS home_id,
                t.terminal_mode::text AS terminal_mode
            FROM terminals t
            WHERE t.id = :terminal_id
            """
        )
        async with session_scope(self._database, ctx) as (session, owned):
            terminal_row = (
                await session.execute(terminal_stmt, {"terminal_id": input.terminal_id})
            ).mappings().one()
            revoke_result = await session.execute(
                revoke_stmt,
                {"terminal_id": input.terminal_id, "revoked_at": revoked_at},
            )
            row = (
                await session.execute(
                    insert_stmt,
                    {
                        "terminal_id": input.terminal_id,
                        "token_hash": input.token_hash,
                        "token_jti": input.token_jti,
                        "issued_at": input.issued_at,
                        "expires_at": input.expires_at,
                        "created_by_member_id": input.created_by_member_id,
                        "created_by_terminal_id": input.created_by_terminal_id,
                    },
                )
            ).mappings().one()
            if owned:
                await session.commit()
        token = TerminalBootstrapTokenRow(
            id=row["id"],
            home_id=terminal_row["home_id"],
            terminal_id=input.terminal_id,
            terminal_mode=terminal_row["terminal_mode"],
            token_jti=row["token_jti"],
            issued_at=row["issued_at"],
            expires_at=row["expires_at"],
            last_used_at=row["last_used_at"],
            revoked_at=row["revoked_at"],
        )
        return RotatedTerminalBootstrapToken(
            token=token,
            revoked_count=revoke_result.rowcount or 0,
        )

    async def find_usable(
        self,
        *,
        token_jti: str,
        token_hash: str,
        home_id: str,
        terminal_id: str,
        now: str,
        ctx: RepoContext | None = None,
    ) -> TerminalBootstrapTokenRow | None:
        stmt = text(
            """
            SELECT
                tbt.id::text AS id,
                t.home_id::text AS home_id,
                tbt.terminal_id::text AS terminal_id,
                t.terminal_mode::text AS terminal_mode,
                tbt.token_jti,
                tbt.issued_at::text AS issued_at,
                tbt.expires_at::text AS expires_at,
                tbt.last_used_at::text AS last_used_at,
                tbt.revoked_at::text AS revoked_at
            FROM terminal_bootstrap_tokens tbt
            JOIN terminals t ON t.id = tbt.terminal_id
            WHERE tbt.token_jti = :token_jti
              AND tbt.token_hash = :token_hash
              AND t.home_id = :home_id
              AND tbt.terminal_id = :terminal_id
              AND tbt.revoked_at IS NULL
              AND tbt.expires_at > :now
            """
        )
        async with session_scope(self._database, ctx) as (session, _):
            row = (
                await session.execute(
                    stmt,
                    {
                        "token_jti": token_jti,
                        "token_hash": token_hash,
                        "home_id": home_id,
                        "terminal_id": terminal_id,
                        "now": now,
                    },
                )
            ).mappings().one_or_none()
        return _to_bootstrap_token_row(row) if row is not None else None

    async def mark_used(
        self,
        token_id: str,
        used_at: str,
        ctx: RepoContext | None = None,
    ) -> None:
        stmt = text(
            """
            UPDATE terminal_bootstrap_tokens
            SET last_used_at = :used_at, updated_at = now()
            WHERE id = :token_id
            """
        )
        async with session_scope(self._database, ctx) as (session, owned):
            await session.execute(stmt, {"token_id": token_id, "used_at": used_at})
            if owned:
                await session.commit()
