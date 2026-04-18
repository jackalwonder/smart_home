"""Add terminal pairing code sessions.

Revision ID: 20260418_0003
Revises: 20260418_0002
Create Date: 2026-04-18 00:30:00
"""
from __future__ import annotations

from alembic import op

revision = "20260418_0003"
down_revision = "20260418_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE terminal_pairing_code_sessions (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            terminal_id uuid NOT NULL REFERENCES terminals(id) ON DELETE CASCADE,
            pairing_code_hash text NOT NULL,
            issued_at timestamptz NOT NULL DEFAULT now(),
            expires_at timestamptz NOT NULL,
            claimed_at timestamptz,
            claimed_by_member_id uuid REFERENCES members(id) ON DELETE SET NULL,
            claimed_by_terminal_id uuid REFERENCES terminals(id) ON DELETE SET NULL,
            bootstrap_token_ciphertext text,
            bootstrap_token_expires_at timestamptz,
            completed_at timestamptz,
            invalidated_at timestamptz,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now(),
            CHECK (expires_at >= issued_at)
        )
        """
    )
    op.execute(
        """
        CREATE INDEX idx_terminal_pairing_code_sessions_terminal_active
        ON terminal_pairing_code_sessions (terminal_id, invalidated_at, completed_at, expires_at)
        """
    )
    op.execute(
        """
        CREATE INDEX idx_terminal_pairing_code_sessions_pairing_hash
        ON terminal_pairing_code_sessions (pairing_code_hash, expires_at)
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS terminal_pairing_code_sessions")
