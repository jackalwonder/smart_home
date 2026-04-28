from __future__ import annotations

import importlib.util
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
PATCH_SCRIPT = (
    REPO_ROOT.parent
    / "services"
    / "sgcc_electricity_direct_qrcode"
    / "patch_direct_qrcode.py"
)


def load_patch_module():
    spec = importlib.util.spec_from_file_location("patch_direct_qrcode", PATCH_SCRIPT)
    assert spec is not None
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_replace_once_replaces_single_marker() -> None:
    module = load_patch_module()

    patched = module.replace_once("before TARGET after TARGET", "TARGET", "PATCHED", "marker")

    assert patched == "before PATCHED after TARGET"


def test_replace_once_fails_when_upstream_marker_is_missing() -> None:
    module = load_patch_module()

    try:
        module.replace_once("before after", "TARGET", "PATCHED", "marker")
    except RuntimeError as exc:
        assert "missing marker marker" in str(exc)
    else:
        raise AssertionError("replace_once should fail when the upstream marker is missing")
