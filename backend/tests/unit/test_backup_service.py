from __future__ import annotations

import json
from datetime import datetime, timezone

import pytest

from src.modules.backups.services.BackupService import BackupService, build_snapshot_preview
from src.repositories.base.backups.BackupRepository import BackupListRow


class _Clock:
    def now(self):
        return datetime(2026, 4, 14, 10, 0, 0, tzinfo=timezone.utc)


class _NoopPinGuard:
    async def require_active_session(self, *_args, **_kwargs):
        return None


class _BackupRepository:
    def __init__(self):
        self.created = []
        self.snapshot = {
            "settings": {
                "settings_version": "sv_1",
                "page_settings": {"room_label_mode": "ROOM_NAME"},
                "function_settings": {"favorite_limit": 8},
                "favorites": [{"device_id": "device-1"}],
            },
            "layout": {
                "layout_version": "lv_1",
                "background_asset_id": None,
                "hotspots": [],
            },
        }
        self.rows = []

    async def build_current_snapshot(self, home_id):
        assert home_id == "home-1"
        return self.snapshot

    async def create_backup(self, row):
        self.created.append(row)

    async def list_backups(self, home_id):
        assert home_id == "home-1"
        return self.rows


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


@pytest.mark.asyncio
async def test_create_backup_delegates_snapshot_and_persistence_to_repository():
    repository = _BackupRepository()
    service = BackupService(
        backup_repository=repository,
        management_pin_guard=_NoopPinGuard(),
        clock=_Clock(),
    )

    view = await service.create_backup(
        home_id="home-1",
        terminal_id="terminal-1",
        operator_id="member-1",
        note="before restore",
    )

    assert view.backup_id == "bk_20260414100000000000"
    assert view.status == "READY"
    assert len(repository.created) == 1
    created = repository.created[0]
    assert created.created_by_terminal_id == "terminal-1"
    assert created.created_by_member_id == "member-1"
    assert json.loads(created.snapshot_blob.decode("utf-8")) == repository.snapshot


@pytest.mark.asyncio
async def test_list_backups_builds_preview_from_repository_rows():
    repository = _BackupRepository()
    repository.rows = [
        BackupListRow(
            backup_id="bk_1",
            created_at="2026-04-14T10:00:00+00:00",
            restored_at=None,
            created_by="Alice",
            status="READY",
            note=None,
            snapshot_blob=json.dumps(repository.snapshot).encode("utf-8"),
            current_settings_version="sv_2",
            current_layout_version="lv_1",
        )
    ]
    service = BackupService(
        backup_repository=repository,
        management_pin_guard=_NoopPinGuard(),
        clock=_Clock(),
    )

    result = await service.list_backups(home_id="home-1", terminal_id="terminal-1")

    assert result["items"][0]["backup_id"] == "bk_1"
    assert result["items"][0]["created_by"] == "Alice"
    assert result["items"][0]["summary"]["settings_version"] == "sv_1"
    assert result["items"][0]["comparison"]["settings_matches_current"] is False
