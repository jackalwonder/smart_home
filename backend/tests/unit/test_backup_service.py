from __future__ import annotations

import json

from src.modules.backups.services.BackupService import build_snapshot_preview


def test_build_snapshot_preview_summarizes_snapshot_and_current_versions():
    snapshot = {
        "settings": {
            "settings_version": "sv_1",
            "page_settings": {"room_label_mode": "ROOM_NAME"},
            "function_settings": {"favorite_limit": 8},
            "favorites": [{"device_id": "device-1"}, {"device_id": "device-2"}],
        },
        "layout": {
            "layout_version": "lv_1",
            "background_asset_id": "asset-1",
            "hotspots": [{"hotspot_id": "hs-1"}, {"hotspot_id": "hs-2"}],
        },
    }

    preview = build_snapshot_preview(
        json.dumps(snapshot).encode("utf-8"),
        current_settings_version="sv_2",
        current_layout_version="lv_1",
    )

    assert preview["summary"] == {
        "snapshot_status": "READY",
        "settings_version": "sv_1",
        "layout_version": "lv_1",
        "favorite_count": 2,
        "hotspot_count": 2,
        "has_page_settings": True,
        "has_function_settings": True,
        "has_background_asset": True,
    }
    assert preview["comparison"] == {
        "current_settings_version": "sv_2",
        "current_layout_version": "lv_1",
        "settings_matches_current": False,
        "layout_matches_current": True,
    }


def test_build_snapshot_preview_marks_invalid_snapshot():
    preview = build_snapshot_preview(
        b"{bad-json",
        current_settings_version="sv_1",
        current_layout_version="lv_1",
    )

    assert preview["summary"]["snapshot_status"] == "INVALID"
    assert preview["summary"]["favorite_count"] == 0
    assert preview["summary"]["hotspot_count"] == 0
    assert preview["comparison"]["settings_matches_current"] is False
    assert preview["comparison"]["layout_matches_current"] is False
