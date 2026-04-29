from __future__ import annotations

import importlib.util
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = REPO_ROOT.parent / "scripts" / "check_plaintext_secrets.py"


def load_secret_scan_module():
    spec = importlib.util.spec_from_file_location("check_plaintext_secrets", SCRIPT_PATH)
    assert spec is not None
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_secret_scan_allows_empty_example_values() -> None:
    module = load_secret_scan_module()

    assert module.scan_file(REPO_ROOT.parent / "deploy" / "sgcc_electricity" / ".env.example") == []


def test_secret_scan_flags_plaintext_env_values(tmp_path: Path) -> None:
    module = load_secret_scan_module()
    secret_file = tmp_path / "bad.env"
    secret_file.write_text(
        "PHONE_NUMBER=13800138000\n"
        "PASSWORD=not-a-placeholder\n"
        "HOME_ASSISTANT_ACCESS_TOKEN=eyJabc.def.ghi\n",
        encoding="utf-8",
    )

    violations = module.scan_file(secret_file)

    assert len(violations) == 3


def test_secret_scan_skips_deleted_tracked_paths(tmp_path: Path) -> None:
    module = load_secret_scan_module()

    assert module.scan_file(tmp_path / "deleted.env") == []
