from __future__ import annotations

import importlib.util
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
MIGRATION_PATH = REPO_ROOT / "alembic" / "versions" / "20260414_0001_initial_schema.py"


def load_migration_module():
    spec = importlib.util.spec_from_file_location("initial_schema_migration", MIGRATION_PATH)
    assert spec is not None
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_initial_schema_migration_is_self_contained() -> None:
    source = MIGRATION_PATH.read_text(encoding="utf-8")

    assert "家庭智能中控_Web_App_PostgreSQL首版DDL_v2.4.sql" not in source
    assert "from pathlib import Path" not in source
    assert ".read_text(" not in source


def test_initial_schema_statements_include_core_schema() -> None:
    module = load_migration_module()

    statements = module._statements()
    joined = ";\n".join(statements)

    assert statements[0] == "CREATE EXTENSION IF NOT EXISTS pgcrypto"
    assert not any(statement.upper() in {"BEGIN", "COMMIT"} for statement in statements)
    assert "CREATE TYPE terminal_mode_enum AS ENUM" in joined
    assert "CREATE TABLE homes" in joined
    assert "CREATE TABLE ws_event_outbox" in joined
    assert "CREATE VIEW v_current_layout_versions AS" in joined
