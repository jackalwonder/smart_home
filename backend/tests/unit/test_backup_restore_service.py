from __future__ import annotations

import json
from types import SimpleNamespace

import pytest

import src.modules.backups.services.BackupRestoreService as restore_module
from src.modules.backups.services.BackupRestoreService import BackupRestoreService
from src.shared.errors.AppError import AppError
from src.shared.errors.ErrorCode import ErrorCode


class _NoopPinGuard:
    async def require_active_session(self, *_args, **_kwargs):
        return None


class _UnitOfWork:
    def __init__(self):
        self.calls = 0

    async def run_in_transaction(self, func):
        self.calls += 1
        return await func(SimpleNamespace(session=None))


class _MappingsResult:
    def __init__(self, row):
        self._row = row

    def mappings(self):
        return self

    def one_or_none(self):
        return self._row


class _BackupSession:
    def __init__(self, row):
        self._row = row

    async def execute(self, *_args, **_kwargs):
        return _MappingsResult(self._row)


class _SessionScope:
    def __init__(self, session):
        self._session = session

    async def __aenter__(self):
        return self._session, True

    async def __aexit__(self, exc_type, exc, tb):
        return False


def _valid_snapshot_blob() -> bytes:
    return json.dumps(
        {
            "settings": {
                "page_settings": None,
                "function_settings": None,
                "favorites": [],
            },
            "layout": {
                "layout_meta": {},
                "hotspots": [],
            },
        }
    ).encode("utf-8")


def _build_service(unit_of_work):
    return BackupRestoreService(
        database=SimpleNamespace(),
        unit_of_work=unit_of_work,
        management_pin_guard=_NoopPinGuard(),
        settings_version_repository=None,
        favorite_devices_repository=None,
        page_settings_repository=None,
        function_settings_repository=None,
        layout_version_repository=None,
        layout_hotspot_repository=None,
        ws_event_outbox_repository=None,
        version_token_generator=None,
        event_id_generator=None,
        clock=None,
    )


async def _restore(monkeypatch, row, unit_of_work):
    monkeypatch.setattr(
        restore_module,
        "session_scope",
        lambda _database: _SessionScope(_BackupSession(row)),
    )
    service = _build_service(unit_of_work)
    return await service.restore_backup(
        home_id="home-1",
        backup_id="bk_1",
        terminal_id="terminal-1",
        operator_id="member-1",
    )


@pytest.mark.asyncio
async def test_restore_rejects_non_ready_backup_before_transaction(monkeypatch):
    unit_of_work = _UnitOfWork()

    with pytest.raises(AppError) as exc_info:
        await _restore(
            monkeypatch,
            {"status": "FAILED", "snapshot_blob": _valid_snapshot_blob()},
            unit_of_work,
        )

    assert exc_info.value.code == ErrorCode.INVALID_PARAMS
    assert exc_info.value.details["fields"][0]["reason"] == "status_not_ready"
    assert exc_info.value.details["fields"][0]["status"] == "FAILED"
    assert unit_of_work.calls == 0


@pytest.mark.asyncio
async def test_restore_rejects_corrupt_snapshot_before_transaction(monkeypatch):
    unit_of_work = _UnitOfWork()

    with pytest.raises(AppError) as exc_info:
        await _restore(
            monkeypatch,
            {"status": "READY", "snapshot_blob": b"{not-json"},
            unit_of_work,
        )

    assert exc_info.value.code == ErrorCode.INVALID_PARAMS
    assert exc_info.value.details["fields"][0]["field"] == "snapshot_blob"
    assert exc_info.value.details["fields"][0]["reason"] == "invalid_json"
    assert unit_of_work.calls == 0


@pytest.mark.asyncio
async def test_restore_rejects_invalid_hotspot_snapshot_before_transaction(monkeypatch):
    unit_of_work = _UnitOfWork()
    snapshot = {
        "settings": {
            "page_settings": None,
            "function_settings": None,
            "favorites": [],
        },
        "layout": {
            "layout_meta": {},
            "hotspots": [
                {
                    "hotspot_id": "hs-1",
                    "device_id": "device-1",
                    "x": 10,
                }
            ],
        },
    }

    with pytest.raises(AppError) as exc_info:
        await _restore(
            monkeypatch,
            {"status": "READY", "snapshot_blob": json.dumps(snapshot).encode("utf-8")},
            unit_of_work,
        )

    assert exc_info.value.code == ErrorCode.INVALID_PARAMS
    assert exc_info.value.details["fields"][0]["field"] == "layout.hotspots.0.y"
    assert exc_info.value.details["fields"][0]["reason"] == "must_be_number"
    assert unit_of_work.calls == 0
