"""Add hotspot icon assets.

Revision ID: 20260421_0004
Revises: 20260418_0003
Create Date: 2026-04-21 00:00:00
"""
from __future__ import annotations

from alembic import op

revision = "20260421_0004"
down_revision = "20260418_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE asset_type_enum ADD VALUE IF NOT EXISTS 'HOTSPOT_ICON'")
    op.execute(
        """
        ALTER TABLE layout_hotspots
        ADD COLUMN IF NOT EXISTS icon_asset_id uuid
        REFERENCES page_assets(id) ON DELETE SET NULL
        """
    )
    op.execute(
        """
        ALTER TABLE draft_hotspots
        ADD COLUMN IF NOT EXISTS icon_asset_id uuid
        REFERENCES page_assets(id) ON DELETE SET NULL
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_layout_hotspots_icon_asset_id
        ON layout_hotspots (icon_asset_id)
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_draft_hotspots_icon_asset_id
        ON draft_hotspots (icon_asset_id)
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_draft_hotspots_icon_asset_id")
    op.execute("DROP INDEX IF EXISTS idx_layout_hotspots_icon_asset_id")
    op.execute("ALTER TABLE draft_hotspots DROP COLUMN IF EXISTS icon_asset_id")
    op.execute("ALTER TABLE layout_hotspots DROP COLUMN IF EXISTS icon_asset_id")
