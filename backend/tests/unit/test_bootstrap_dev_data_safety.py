from __future__ import annotations

from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]


def test_entrypoint_requires_explicit_dev_bootstrap_flag() -> None:
    entrypoint = (REPO_ROOT / "docker-entrypoint.sh").read_text(encoding="utf-8")

    assert "BOOTSTRAP_DEV_DATA" in entrypoint
    assert "local|dev|development|test" in entrypoint
    assert "exit 1" in entrypoint


def test_dev_seed_does_not_overwrite_existing_pin_config() -> None:
    script = (REPO_ROOT / "scripts" / "bootstrap_dev_data.py").read_text(encoding="utf-8")

    home_auth_section = script.split("INSERT INTO home_auth_configs", 1)[1].split(
        "INSERT INTO settings_versions",
        1,
    )[0]

    assert "ON CONFLICT (home_id) DO NOTHING" in home_auth_section
    assert "SET pin_hash = EXCLUDED.pin_hash" not in home_auth_section
