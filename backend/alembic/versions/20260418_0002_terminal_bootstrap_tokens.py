"""Add terminal bootstrap tokens.

Revision ID: 20260418_0002
Revises: 20260414_0001
Create Date: 2026-04-18 00:00:00
"""
from __future__ import annotations

from alembic import op

revision = "20260418_0002"
down_revision = "20260414_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE terminal_bootstrap_tokens (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            terminal_id uuid NOT NULL REFERENCES terminals(id) ON DELETE CASCADE,
            token_hash text NOT NULL,
            token_jti text NOT NULL UNIQUE,
            issued_at timestamptz NOT NULL DEFAULT now(),
            expires_at timestamptz NOT NULL,
            last_used_at timestamptz,
            revoked_at timestamptz,
            created_by_member_id uuid REFERENCES members(id) ON DELETE SET NULL,
            created_by_terminal_id uuid REFERENCES terminals(id) ON DELETE SET NULL,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now(),
            CHECK (expires_at >= issued_at),
            UNIQUE (terminal_id, token_hash)
        )
        """
    )
    op.execute(
        """
        CREATE INDEX idx_terminal_bootstrap_tokens_terminal_active
        ON terminal_bootstrap_tokens (terminal_id, revoked_at, expires_at)
        """
    )
    op.execute(
        """
        CREATE INDEX idx_terminal_bootstrap_tokens_expires_at
        ON terminal_bootstrap_tokens (expires_at)
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS terminal_bootstrap_tokens")
