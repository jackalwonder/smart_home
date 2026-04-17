from __future__ import annotations

import json
from datetime import datetime, timezone
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
    def __init__(self, session=None):
        self.calls = 0
        self._session = session

    async def run_in_transaction(self, func):
        self.calls += 1
        return await func(SimpleNamespace(session=self._session))


class _MappingsResult:
    def __init__(self, row):
        self._row = row

    def mappings(self):
        return self

    def all(self):
        if isinstance(self._row, list):
            return self._row
        if self._row is None:
            return []
        return [self._row]

    def one_or_none(self):
        return self._row

    def one(self):
        assert self._row is not None
        return self._row


class _BackupSession:
    def __init__(self, row):
        self._row = row

    async def execute(self, *_args, **_kwargs):
        return _MappingsResult(self._row)


class _AuditSession:
    def __init__(self, rows):
        self._rows = rows
        self.params = None

    async def execute(self, _stmt, params=None):
        self.params = params
        return _MappingsResult(self._rows)


class _TransactionSession:
    def __init__(self):
        self.audit_params = None
        self.backup_restore_params = None

    async def execute(self, stmt, params=None):
        sql = str(stmt)
        if "INSERT INTO audit_logs" in sql:
            self.audit_params = params
            return _MappingsResult({"audit_id": "audit-1"})
        if "UPDATE system_backups" in sql:
            self.backup_restore_params = params
            return _MappingsResult(None)
        raise AssertionError(f"Unexpected SQL: {sql}")


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


class _SettingsVersionRepository:
    async def insert(self, input, ctx=None):
        return SimpleNamespace(id="settings-version-row-1")


class _PageSettingsRepository:
    async def upsert_for_settings_version(self, input, ctx=None):
        return None


class _FunctionSettingsRepository:
    async def upsert_for_settings_version(self, input, ctx=None):
        return None


class _FavoriteDevicesRepository:
    async def replace_for_settings_version(self, settings_version_id, favorites, ctx=None):
        return None


class _LayoutVersionRepository:
    async def insert(self, input, ctx=None):
        return SimpleNamespace(id="layout-version-row-1")


class _LayoutHotspotRepository:
    async def replace_for_layout_version(self, layout_version_id, hotspots, ctx=None):
        return None


class _WsEventOutboxRepository:
    def __init__(self):
        self.inserted = None

    async def insert(self, input, ctx=None):
        self.inserted = input
        return SimpleNamespace(id="event-row-1")


class _VersionTokenGenerator:
    def next_settings_version(self):
        return "sv_restored"

    def next_layout_version(self):
        return "lv_restored"


class _EventIdGenerator:
    def next_event_id(self):
        return "event-1"


class _Clock:
    def now(self):
        return datetime(2026, 4, 17, 10, 0, 0, tzinfo=timezone.utc)


def _build_service(unit_of_work, *, outbox_repository=None):
    return BackupRestoreService(
        database=SimpleNamespace(),
        unit_of_work=unit_of_work,
        management_pin_guard=_NoopPinGuard(),
        settings_version_repository=_SettingsVersionRepository(),
        favorite_devices_repository=_FavoriteDevicesRepository(),
        page_settings_repository=_PageSettingsRepository(),
        function_settings_repository=_FunctionSettingsRepository(),
        layout_version_repository=_LayoutVersionRepository(),
        layout_hotspot_repository=_LayoutHotspotRepository(),
        ws_event_outbox_repository=outbox_repository or _WsEventOutboxRepository(),
        version_token_generator=_VersionTokenGenerator(),
        event_id_generator=_EventIdGenerator(),
        clock=_Clock(),
    )


async def _restore(monkeypatch, row, unit_of_work, *, outbox_repository=None):
    monkeypatch.setattr(
        restore_module,
        "session_scope",
        lambda _database: _SessionScope(_BackupSession(row)),
    )
    service = _build_service(unit_of_work, outbox_repository=outbox_repository)
    return await service.restore_backup(
        home_id="home-1",
        backup_id="bk_1",
        terminal_id="terminal-1",
        operator_id="member-1",
    )


@pytest.mark.asyncio
async def test_list_restore_audits_returns_bounded_history(monkeypatch):
    audit_session = _AuditSession(
        [
            {
                "audit_id": "audit-1",
                "backup_id": "bk_1",
                "restored_at": "2026-04-17T10:00:00+00:00",
                "operator_id": "member-1",
                "operator_name": "Operator",
                "terminal_id": "terminal-1",
                "before_version": "bk_1",
                "settings_version": "sv_restored",
                "layout_version": "lv_restored",
                "result_status": "SUCCESS",
            }
        ]
    )
    monkeypatch.setattr(
        restore_module,
        "session_scope",
        lambda _database: _SessionScope(audit_session),
    )
    service = _build_service(_UnitOfWork())

    result = await service.list_restore_audits(
        home_id="home-1",
        terminal_id="terminal-1",
        limit=500,
    )

    assert audit_session.params == {"home_id": "home-1", "limit": 100}
    assert result[0].audit_id == "audit-1"
    assert result[0].backup_id == "bk_1"
    assert result[0].settings_version == "sv_restored"
    assert result[0].layout_version == "lv_restored"


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


@pytest.mark.asyncio
async def test_restore_writes_audit_log_and_returns_audit_id(monkeypatch):
    transaction_session = _TransactionSession()
    unit_of_work = _UnitOfWork(session=transaction_session)
    outbox_repository = _WsEventOutboxRepository()

    result = await _restore(
        monkeypatch,
        {"status": "READY", "snapshot_blob": _valid_snapshot_blob()},
        unit_of_work,
        outbox_repository=outbox_repository,
    )

    assert result.audit_id == "audit-1"
    assert unit_of_work.calls == 1
    assert transaction_session.audit_params["action_type"] == "BACKUP_RESTORE"
    assert transaction_session.audit_params["target_type"] == "SYSTEM_BACKUP"
    assert transaction_session.audit_params["target_id"] == "bk_1"
    assert transaction_session.audit_params["before_version"] == "bk_1"
    assert transaction_session.audit_params["after_version"] == "sv_restored"
    assert transaction_session.audit_params["result_status"] == "SUCCESS"
    assert transaction_session.backup_restore_params["backup_id"] == "bk_1"
    assert outbox_repository.inserted.payload_json["audit_id"] == "audit-1"
