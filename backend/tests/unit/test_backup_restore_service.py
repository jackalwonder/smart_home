from __future__ import annotations

import json
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from src.modules.backups.services.BackupRestoreService import BackupRestoreService
from src.repositories.base.backups.BackupRestoreRepository import (
    BackupRestoreAuditRow,
    BackupRestoreBackupRow,
)
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
        return await func(SimpleNamespace(id="tx-1"))


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


class _BackupRestoreRepository:
    def __init__(
        self,
        *,
        backup_row: BackupRestoreBackupRow | None = None,
        audit_rows: list[BackupRestoreAuditRow] | None = None,
    ) -> None:
        self.backup_row = backup_row
        self.audit_rows = audit_rows or []
        self.list_limit = None
        self.failure_audit = None
        self.success_audit = None
        self.restored_backup = None

    async def list_restore_audits(self, *, home_id, limit):
        self.list_limit = limit
        return self.audit_rows

    async def get_backup(self, *, home_id, backup_id):
        return self.backup_row

    async def insert_restore_failure_audit(self, input):
        self.failure_audit = input

    async def insert_restore_success_audit(self, input, ctx=None):
        self.success_audit = input
        return "audit-1"

    async def mark_backup_restored(self, *, home_id, backup_id, restored_at, ctx=None):
        self.restored_backup = {
            "home_id": home_id,
            "backup_id": backup_id,
            "restored_at": restored_at,
        }


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


def _build_service(
    unit_of_work,
    *,
    backup_restore_repository=None,
    outbox_repository=None,
):
    return BackupRestoreService(
        backup_restore_repository=backup_restore_repository or _BackupRestoreRepository(),
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


async def _restore(row, unit_of_work, *, outbox_repository=None, backup_restore_repository=None):
    repository = backup_restore_repository or _BackupRestoreRepository(backup_row=row)
    service = _build_service(
        unit_of_work,
        backup_restore_repository=repository,
        outbox_repository=outbox_repository,
    )
    return await service.restore_backup(
        home_id="home-1",
        backup_id="bk_1",
        terminal_id="terminal-1",
        operator_id="member-1",
    )


@pytest.mark.asyncio
async def test_list_restore_audits_returns_bounded_history():
    repository = _BackupRestoreRepository(
        audit_rows=[
            BackupRestoreAuditRow(
                audit_id="audit-1",
                backup_id="bk_1",
                restored_at="2026-04-17T10:00:00+00:00",
                operator_id="member-1",
                operator_name="Operator",
                terminal_id="terminal-1",
                before_version="bk_1",
                settings_version="sv_restored",
                layout_version="lv_restored",
                result_status="SUCCESS",
                error_code=None,
                error_message=None,
                failure_reason=None,
            )
        ]
    )
    service = _build_service(_UnitOfWork(), backup_restore_repository=repository)

    result = await service.list_restore_audits(
        home_id="home-1",
        terminal_id="terminal-1",
        limit=500,
    )

    assert repository.list_limit == 100
    assert result[0].audit_id == "audit-1"
    assert result[0].backup_id == "bk_1"
    assert result[0].settings_version == "sv_restored"
    assert result[0].layout_version == "lv_restored"
    assert result[0].error_code is None


@pytest.mark.asyncio
async def test_list_restore_audits_includes_failure_details():
    repository = _BackupRestoreRepository(
        audit_rows=[
            BackupRestoreAuditRow(
                audit_id="audit-2",
                backup_id="bk_2",
                restored_at="2026-04-17T10:01:00+00:00",
                operator_id="member-1",
                operator_name="Operator",
                terminal_id="terminal-1",
                before_version="bk_2",
                settings_version=None,
                layout_version=None,
                result_status="FAILED",
                error_code="INVALID_PARAMS",
                error_message="backup snapshot is invalid",
                failure_reason="invalid_json",
            )
        ]
    )
    service = _build_service(_UnitOfWork(), backup_restore_repository=repository)

    result = await service.list_restore_audits(
        home_id="home-1",
        terminal_id="terminal-1",
    )

    assert result[0].result_status == "FAILED"
    assert result[0].error_code == "INVALID_PARAMS"
    assert result[0].error_message == "backup snapshot is invalid"
    assert result[0].failure_reason == "invalid_json"


@pytest.mark.asyncio
async def test_restore_rejects_non_ready_backup_before_transaction():
    unit_of_work = _UnitOfWork()
    repository = _BackupRestoreRepository(
        backup_row=BackupRestoreBackupRow(status="FAILED", snapshot_blob=_valid_snapshot_blob())
    )
    service = _build_service(unit_of_work, backup_restore_repository=repository)

    with pytest.raises(AppError) as exc_info:
        await service.restore_backup(
            home_id="home-1",
            backup_id="bk_1",
            terminal_id="terminal-1",
            operator_id="member-1",
        )

    assert exc_info.value.code == ErrorCode.INVALID_PARAMS
    assert exc_info.value.details["fields"][0]["reason"] == "status_not_ready"
    assert exc_info.value.details["fields"][0]["status"] == "FAILED"
    assert repository.failure_audit.backup_id == "bk_1"
    assert repository.failure_audit.error_code == "INVALID_PARAMS"
    assert unit_of_work.calls == 0


@pytest.mark.asyncio
async def test_restore_rejects_corrupt_snapshot_before_transaction():
    unit_of_work = _UnitOfWork()
    repository = _BackupRestoreRepository(
        backup_row=BackupRestoreBackupRow(status="READY", snapshot_blob=b"{not-json")
    )
    service = _build_service(unit_of_work, backup_restore_repository=repository)

    with pytest.raises(AppError) as exc_info:
        await service.restore_backup(
            home_id="home-1",
            backup_id="bk_1",
            terminal_id="terminal-1",
            operator_id="member-1",
        )

    assert exc_info.value.code == ErrorCode.INVALID_PARAMS
    assert exc_info.value.details["fields"][0]["field"] == "snapshot_blob"
    assert exc_info.value.details["fields"][0]["reason"] == "invalid_json"
    assert repository.failure_audit.backup_id == "bk_1"
    assert unit_of_work.calls == 0


@pytest.mark.asyncio
async def test_restore_rejects_invalid_hotspot_snapshot_before_transaction():
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
    repository = _BackupRestoreRepository(
        backup_row=BackupRestoreBackupRow(
            status="READY",
            snapshot_blob=json.dumps(snapshot).encode("utf-8"),
        )
    )

    with pytest.raises(AppError) as exc_info:
        await _restore(
            repository.backup_row,
            unit_of_work,
            backup_restore_repository=repository,
        )

    assert exc_info.value.code == ErrorCode.INVALID_PARAMS
    assert exc_info.value.details["fields"][0]["field"] == "layout.hotspots.0.y"
    assert exc_info.value.details["fields"][0]["reason"] == "must_be_number"
    assert unit_of_work.calls == 0


@pytest.mark.asyncio
async def test_restore_rejects_missing_backup_with_failure_audit():
    unit_of_work = _UnitOfWork()
    repository = _BackupRestoreRepository(backup_row=None)
    service = _build_service(unit_of_work, backup_restore_repository=repository)

    with pytest.raises(AppError) as exc_info:
        await service.restore_backup(
            home_id="home-1",
            backup_id="bk_missing",
            terminal_id="terminal-1",
            operator_id="member-1",
        )

    assert exc_info.value.code == ErrorCode.INVALID_PARAMS
    assert repository.failure_audit.backup_id == "bk_missing"
    assert repository.failure_audit.error_code == "INVALID_PARAMS"
    assert unit_of_work.calls == 0


@pytest.mark.asyncio
async def test_restore_writes_audit_log_and_returns_audit_id():
    unit_of_work = _UnitOfWork()
    outbox_repository = _WsEventOutboxRepository()
    backup_restore_repository = _BackupRestoreRepository(
        backup_row=BackupRestoreBackupRow(status="READY", snapshot_blob=_valid_snapshot_blob())
    )

    result = await _restore(
        backup_restore_repository.backup_row,
        unit_of_work,
        outbox_repository=outbox_repository,
        backup_restore_repository=backup_restore_repository,
    )

    assert result.audit_id == "audit-1"
    assert unit_of_work.calls == 1
    assert backup_restore_repository.success_audit.backup_id == "bk_1"
    assert backup_restore_repository.success_audit.settings_version == "sv_restored"
    assert backup_restore_repository.success_audit.layout_version == "lv_restored"
    assert backup_restore_repository.restored_backup["backup_id"] == "bk_1"
    assert outbox_repository.inserted.payload_json["audit_id"] == "audit-1"
