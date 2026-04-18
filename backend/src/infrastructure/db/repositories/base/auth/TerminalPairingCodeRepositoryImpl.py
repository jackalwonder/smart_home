from __future__ import annotations

from sqlalchemy import text

from src.infrastructure.db.connection.Database import Database
from src.infrastructure.db.repositories._support import session_scope, to_jsonb
from src.repositories.base.auth.TerminalPairingCodeRepository import (
    NewTerminalPairingAuditRow,
    NewTerminalPairingSessionRow,
    TerminalPairingSessionRow,
)
from src.repositories.rows.index import TerminalRow
from src.shared.kernel.RepoContext import RepoContext


def _to_pairing_row(row) -> TerminalPairingSessionRow:
    return TerminalPairingSessionRow(
        pairing_id=row["pairing_id"],
        home_id=row["home_id"],
        terminal_id=row["terminal_id"],
        terminal_code=row["terminal_code"],
        terminal_name=row["terminal_name"],
        terminal_mode=row["terminal_mode"],
        pairing_code_hash=row["pairing_code_hash"],
        issued_at=row["issued_at"],
        expires_at=row["expires_at"],
        claimed_at=row["claimed_at"],
        claimed_by_member_id=row["claimed_by_member_id"],
        claimed_by_terminal_id=row["claimed_by_terminal_id"],
        bootstrap_token_ciphertext=row["bootstrap_token_ciphertext"],
        bootstrap_token_expires_at=row["bootstrap_token_expires_at"],
        completed_at=row["completed_at"],
        invalidated_at=row["invalidated_at"],
    )


class TerminalPairingCodeRepositoryImpl:
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

    async def issue_for_terminal(
        self,
        input: NewTerminalPairingSessionRow,
        invalidated_at: str,
        ctx: RepoContext | None = None,
    ) -> TerminalPairingSessionRow:
        invalidate_stmt = text(
            """
            UPDATE terminal_pairing_code_sessions
            SET invalidated_at = :invalidated_at, updated_at = now()
            WHERE terminal_id = :terminal_id
              AND invalidated_at IS NULL
              AND completed_at IS NULL
              AND claimed_at IS NULL
              AND expires_at > :invalidated_at
            """
        )
        insert_stmt = text(
            """
            INSERT INTO terminal_pairing_code_sessions (
                terminal_id,
                pairing_code_hash,
                issued_at,
                expires_at
            ) VALUES (
                :terminal_id,
                :pairing_code_hash,
                :issued_at,
                :expires_at
            )
            RETURNING id::text AS pairing_id
            """
        )
        select_stmt = text(
            """
            SELECT
                pcs.id::text AS pairing_id,
                t.home_id::text AS home_id,
                t.id::text AS terminal_id,
                t.terminal_code,
                t.terminal_name,
                t.terminal_mode::text AS terminal_mode,
                pcs.pairing_code_hash,
                pcs.issued_at::text AS issued_at,
                pcs.expires_at::text AS expires_at,
                pcs.claimed_at::text AS claimed_at,
                pcs.claimed_by_member_id::text AS claimed_by_member_id,
                pcs.claimed_by_terminal_id::text AS claimed_by_terminal_id,
                pcs.bootstrap_token_ciphertext,
                pcs.bootstrap_token_expires_at::text AS bootstrap_token_expires_at,
                pcs.completed_at::text AS completed_at,
                pcs.invalidated_at::text AS invalidated_at
            FROM terminal_pairing_code_sessions pcs
            JOIN terminals t ON t.id = pcs.terminal_id
            WHERE pcs.id = :pairing_id
            """
        )
        async with session_scope(self._database, ctx) as (session, owned):
            await session.execute(
                invalidate_stmt,
                {"terminal_id": input.terminal_id, "invalidated_at": invalidated_at},
            )
            inserted = (
                await session.execute(
                    insert_stmt,
                    {
                        "terminal_id": input.terminal_id,
                        "pairing_code_hash": input.pairing_code_hash,
                        "issued_at": input.issued_at,
                        "expires_at": input.expires_at,
                    },
                )
            ).mappings().one()
            row = (
                await session.execute(
                    select_stmt,
                    {"pairing_id": inserted["pairing_id"]},
                )
            ).mappings().one()
            if owned:
                await session.commit()
        return _to_pairing_row(row)

    async def find_session_for_terminal(
        self,
        *,
        terminal_id: str,
        pairing_id: str,
        ctx: RepoContext | None = None,
    ) -> TerminalPairingSessionRow | None:
        stmt = text(
            """
            SELECT
                pcs.id::text AS pairing_id,
                t.home_id::text AS home_id,
                t.id::text AS terminal_id,
                t.terminal_code,
                t.terminal_name,
                t.terminal_mode::text AS terminal_mode,
                pcs.pairing_code_hash,
                pcs.issued_at::text AS issued_at,
                pcs.expires_at::text AS expires_at,
                pcs.claimed_at::text AS claimed_at,
                pcs.claimed_by_member_id::text AS claimed_by_member_id,
                pcs.claimed_by_terminal_id::text AS claimed_by_terminal_id,
                pcs.bootstrap_token_ciphertext,
                pcs.bootstrap_token_expires_at::text AS bootstrap_token_expires_at,
                pcs.completed_at::text AS completed_at,
                pcs.invalidated_at::text AS invalidated_at
            FROM terminal_pairing_code_sessions pcs
            JOIN terminals t ON t.id = pcs.terminal_id
            WHERE pcs.id = :pairing_id
              AND pcs.terminal_id = :terminal_id
            """
        )
        async with session_scope(self._database, ctx) as (session, _):
            row = (
                await session.execute(
                    stmt,
                    {"pairing_id": pairing_id, "terminal_id": terminal_id},
                )
            ).mappings().one_or_none()
        return _to_pairing_row(row) if row is not None else None

    async def find_active_for_terminal(
        self,
        *,
        terminal_id: str,
        now: str,
        ctx: RepoContext | None = None,
    ) -> TerminalPairingSessionRow | None:
        stmt = text(
            """
            SELECT
                pcs.id::text AS pairing_id,
                t.home_id::text AS home_id,
                t.id::text AS terminal_id,
                t.terminal_code,
                t.terminal_name,
                t.terminal_mode::text AS terminal_mode,
                pcs.pairing_code_hash,
                pcs.issued_at::text AS issued_at,
                pcs.expires_at::text AS expires_at,
                pcs.claimed_at::text AS claimed_at,
                pcs.claimed_by_member_id::text AS claimed_by_member_id,
                pcs.claimed_by_terminal_id::text AS claimed_by_terminal_id,
                pcs.bootstrap_token_ciphertext,
                pcs.bootstrap_token_expires_at::text AS bootstrap_token_expires_at,
                pcs.completed_at::text AS completed_at,
                pcs.invalidated_at::text AS invalidated_at
            FROM terminal_pairing_code_sessions pcs
            JOIN terminals t ON t.id = pcs.terminal_id
            WHERE pcs.terminal_id = :terminal_id
              AND pcs.invalidated_at IS NULL
              AND pcs.completed_at IS NULL
              AND pcs.claimed_at IS NULL
              AND pcs.expires_at > :now
            ORDER BY pcs.issued_at DESC
            LIMIT 1
            """
        )
        async with session_scope(self._database, ctx) as (session, _):
            row = (
                await session.execute(
                    stmt,
                    {"terminal_id": terminal_id, "now": now},
                )
            ).mappings().one_or_none()
        return _to_pairing_row(row) if row is not None else None

    async def find_active_by_code_hash(
        self,
        *,
        home_id: str,
        pairing_code_hash: str,
        now: str,
        ctx: RepoContext | None = None,
    ) -> TerminalPairingSessionRow | None:
        stmt = text(
            """
            SELECT
                pcs.id::text AS pairing_id,
                t.home_id::text AS home_id,
                t.id::text AS terminal_id,
                t.terminal_code,
                t.terminal_name,
                t.terminal_mode::text AS terminal_mode,
                pcs.pairing_code_hash,
                pcs.issued_at::text AS issued_at,
                pcs.expires_at::text AS expires_at,
                pcs.claimed_at::text AS claimed_at,
                pcs.claimed_by_member_id::text AS claimed_by_member_id,
                pcs.claimed_by_terminal_id::text AS claimed_by_terminal_id,
                pcs.bootstrap_token_ciphertext,
                pcs.bootstrap_token_expires_at::text AS bootstrap_token_expires_at,
                pcs.completed_at::text AS completed_at,
                pcs.invalidated_at::text AS invalidated_at
            FROM terminal_pairing_code_sessions pcs
            JOIN terminals t ON t.id = pcs.terminal_id
            WHERE t.home_id = :home_id
              AND pcs.pairing_code_hash = :pairing_code_hash
              AND pcs.invalidated_at IS NULL
              AND pcs.completed_at IS NULL
              AND pcs.claimed_at IS NULL
              AND pcs.expires_at > :now
            ORDER BY pcs.issued_at DESC
            LIMIT 1
            """
        )
        async with session_scope(self._database, ctx) as (session, _):
            row = (
                await session.execute(
                    stmt,
                    {
                        "home_id": home_id,
                        "pairing_code_hash": pairing_code_hash,
                        "now": now,
                    },
                )
            ).mappings().one_or_none()
        return _to_pairing_row(row) if row is not None else None

    async def mark_claimed(
        self,
        *,
        pairing_id: str,
        claimed_at: str,
        claimed_by_member_id: str | None,
        claimed_by_terminal_id: str | None,
        bootstrap_token_ciphertext: str,
        bootstrap_token_expires_at: str,
        ctx: RepoContext | None = None,
    ) -> None:
        stmt = text(
            """
            UPDATE terminal_pairing_code_sessions
            SET
                claimed_at = :claimed_at,
                claimed_by_member_id = :claimed_by_member_id,
                claimed_by_terminal_id = :claimed_by_terminal_id,
                bootstrap_token_ciphertext = :bootstrap_token_ciphertext,
                bootstrap_token_expires_at = :bootstrap_token_expires_at,
                updated_at = now()
            WHERE id = :pairing_id
            """
        )
        async with session_scope(self._database, ctx) as (session, owned):
            await session.execute(
                stmt,
                {
                    "pairing_id": pairing_id,
                    "claimed_at": claimed_at,
                    "claimed_by_member_id": claimed_by_member_id,
                    "claimed_by_terminal_id": claimed_by_terminal_id,
                    "bootstrap_token_ciphertext": bootstrap_token_ciphertext,
                    "bootstrap_token_expires_at": bootstrap_token_expires_at,
                },
            )
            if owned:
                await session.commit()

    async def mark_completed(
        self,
        *,
        pairing_id: str,
        completed_at: str,
        clear_bootstrap_token: bool = True,
        ctx: RepoContext | None = None,
    ) -> None:
        if clear_bootstrap_token:
            stmt = text(
                """
                UPDATE terminal_pairing_code_sessions
                SET
                    completed_at = :completed_at,
                    bootstrap_token_ciphertext = NULL,
                    updated_at = now()
                WHERE id = :pairing_id
                """
            )
        else:
            stmt = text(
                """
                UPDATE terminal_pairing_code_sessions
                SET
                    completed_at = :completed_at,
                    updated_at = now()
                WHERE id = :pairing_id
                """
            )
        async with session_scope(self._database, ctx) as (session, owned):
            await session.execute(
                stmt,
                {"pairing_id": pairing_id, "completed_at": completed_at},
            )
            if owned:
                await session.commit()

    async def insert_audit(
        self,
        input: NewTerminalPairingAuditRow,
        ctx: RepoContext | None = None,
    ) -> str:
        stmt = text(
            """
            INSERT INTO audit_logs (
                home_id,
                operator_id,
                terminal_id,
                action_type,
                target_type,
                target_id,
                before_version,
                after_version,
                result_status,
                payload_json,
                created_at
            ) VALUES (
                :home_id,
                :operator_id,
                :terminal_id,
                :action_type,
                :target_type,
                :target_id,
                NULL,
                :after_version,
                :result_status,
                :payload_json,
                :created_at
            )
            RETURNING id::text AS audit_id
            """
        )
        async with session_scope(self._database, ctx) as (session, owned):
            row = (
                await session.execute(
                    stmt,
                    {
                        "home_id": input.home_id,
                        "operator_id": input.operator_id,
                        "terminal_id": input.acting_terminal_id,
                        "action_type": input.action_type,
                        "target_type": "TERMINAL_PAIRING_CODE",
                        "target_id": input.target_terminal_id,
                        "after_version": input.after_version,
                        "result_status": input.result_status,
                        "payload_json": to_jsonb(input.payload_json),
                        "created_at": input.created_at,
                    },
                )
            ).mappings().one()
            if owned:
                await session.commit()
        return row["audit_id"]
