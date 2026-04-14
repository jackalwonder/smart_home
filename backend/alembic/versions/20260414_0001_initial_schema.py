from __future__ import annotations

from pathlib import Path

from alembic import op

revision = "20260414_0001"
down_revision = None
branch_labels = None
depends_on = None


def _ddl_path() -> Path:
    filename = "家庭智能中控_Web_App_PostgreSQL首版DDL_v2.4.sql"
    current = Path(__file__).resolve()
    candidates = [
        current.parents[2] / filename,
        current.parents[3] / filename,
    ]
    for path in candidates:
        if path.exists():
            return path
    raise FileNotFoundError(filename)


def _statements() -> list[str]:
    raw = _ddl_path().read_text(encoding="utf-8")
    statements = []
    for chunk in raw.split(";\n"):
        statement = chunk.strip()
        if not statement or statement.upper() in {"BEGIN", "COMMIT"}:
            continue
        statements.append(statement)
    return statements


def upgrade() -> None:
    bind = op.get_bind()
    for statement in _statements():
        bind.exec_driver_sql(statement)


def downgrade() -> None:
    raise NotImplementedError("Initial schema downgrade is not supported.")
