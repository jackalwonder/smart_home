from __future__ import annotations

import ast
from pathlib import Path


MODULE_DB_ACCESS_ALLOWLIST: set[str] = set()
APP_IMPORT_ALLOWLIST = {
    "src/modules/realtime/RealtimeGateway.py",
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


def test_non_controller_modules_do_not_depend_on_app_container():
    root = _repo_root()
    violations: list[str] = []
    forbidden_modules = {
        "src.app.container",
        "src.app.injector",
    }
    for path in sorted((root / "src" / "modules").rglob("*.py")):
        relative_path = path.relative_to(root).as_posix()
        if "/controllers/" in relative_path or relative_path in APP_IMPORT_ALLOWLIST:
            continue
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom) and node.module in forbidden_modules:
                violations.append(relative_path)
                break
            if isinstance(node, ast.Import) and any(
                alias.name in forbidden_modules for alias in node.names
            ):
                violations.append(relative_path)
                break

    assert violations == []


def test_infrastructure_and_shared_layers_do_not_depend_on_app_layer():
    root = _repo_root()
    violations: list[str] = []
    for layer in ("infrastructure", "repositories", "shared"):
        for path in sorted((root / "src" / layer).rglob("*.py")):
            relative_path = path.relative_to(root).as_posix()
            tree = ast.parse(path.read_text(encoding="utf-8"))
            for node in ast.walk(tree):
                if isinstance(node, ast.ImportFrom) and node.module and node.module.startswith(
                    "src.app"
                ):
                    violations.append(relative_path)
                    break
                if isinstance(node, ast.Import) and any(
                    alias.name.startswith("src.app") for alias in node.names
                ):
                    violations.append(relative_path)
                    break

    assert violations == []
