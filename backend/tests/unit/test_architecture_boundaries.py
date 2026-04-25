from __future__ import annotations

import ast
from pathlib import Path


MODULE_DB_ACCESS_ALLOWLIST = {
    "src/modules/auth/services/query/RequestContextService.py",
    "src/modules/backups/services/BackupRestoreService.py",
    "src/modules/home_overview/services/DeviceCatalogService.py",
    "src/modules/system_connections/services/HaEntitySyncService.py",
    "src/modules/system_connections/services/HaRealtimeSyncService.py",
}


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _is_disallowed_import(node: ast.AST) -> bool:
    if isinstance(node, ast.ImportFrom):
        if node.module == "sqlalchemy":
            return any(alias.name == "text" for alias in node.names)
        if node.module == "src.infrastructure.db.connection.Database":
            return any(alias.name == "Database" for alias in node.names)
        return node.module == "src.infrastructure.db.repositories._support"
    if isinstance(node, ast.Import):
        return any(
            alias.name in {
                "src.infrastructure.db.connection.Database",
                "src.infrastructure.db.repositories._support",
            }
            for alias in node.names
        )
    return False


def test_modules_do_not_add_direct_database_access():
    root = _repo_root()
    violations: list[str] = []
    for path in sorted((root / "src" / "modules").rglob("*.py")):
        relative_path = path.relative_to(root).as_posix()
        if relative_path in MODULE_DB_ACCESS_ALLOWLIST:
            continue
        tree = ast.parse(path.read_text(encoding="utf-8"))
        if any(_is_disallowed_import(node) for node in ast.walk(tree)):
            violations.append(relative_path)

    assert violations == []
