from __future__ import annotations

from src.app.container import (
    get_backup_restore_service,
    get_backup_service,
    get_floorplan_asset_service,
    get_request_context_service,
)
from src.modules.auth.services.query.RequestContextService import RequestContext
from src.modules.backups.services.BackupRestoreService import (
    BackupRestoreAuditView,
    BackupRestoreView,
)
from src.modules.backups.services.BackupService import BackupCreateView
from src.modules.page_assets.services.FloorplanAssetService import FloorplanAssetView


class FakeFloorplanAssetService:
    async def upload_floorplan(self, **_kwargs):
        return FloorplanAssetView(
            asset_updated=True,
            asset_id="asset-1",
            background_image_url="/tmp/floorplan.png",
            background_image_size={"width": 1920, "height": 1080},
            updated_at="2026-04-14T10:00:00Z",
        )


class FakeBackupService:
    async def create_backup(self, **_kwargs):
        return BackupCreateView(
            backup_id="bk_1",
            created_at="2026-04-14T10:00:00Z",
            status="READY",
        )

    async def list_backups(self, **_kwargs):
        return {
            "items": [
                {
                    "backup_id": "bk_1",
                    "created_at": "2026-04-14T10:00:00Z",
                    "restored_at": "2026-04-14T10:05:00Z",
                    "created_by": "Operator",
                    "status": "READY",
                    "note": "nightly",
                }
            ]
        }


class FakeBackupRestoreService:
    async def list_restore_audits(self, **_kwargs):
        return [
            BackupRestoreAuditView(
                audit_id="audit-1",
                backup_id="bk_1",
                restored_at="2026-04-14T10:05:00Z",
                operator_id="member-1",
                operator_name="Operator",
                terminal_id="terminal-1",
                before_version="bk_1",
                settings_version="sv_1",
                layout_version="lv_1",
                result_status="SUCCESS",
                error_code=None,
                error_message=None,
                failure_reason=None,
            )
        ]

    async def restore_backup(self, **_kwargs):
        return BackupRestoreView(
            restored=True,
            settings_version="sv_1",
            layout_version="lv_1",
            audit_id="audit-1",
            effective_at="2026-04-14T10:05:00Z",
            message="Backup restored successfully",
        )


class FakeRequestContextService:
    async def resolve_http_request(self, *_args, **_kwargs):
        return RequestContext(home_id="home-1", terminal_id="terminal-1", operator_id="member-1")


def test_assets_and_backup_routes_are_wrapped(app, client):
    app.dependency_overrides[get_floorplan_asset_service] = lambda: FakeFloorplanAssetService()
    app.dependency_overrides[get_backup_service] = lambda: FakeBackupService()
    app.dependency_overrides[get_backup_restore_service] = lambda: FakeBackupRestoreService()
    app.dependency_overrides[get_request_context_service] = lambda: FakeRequestContextService()

    asset_response = client.post(
        "/api/v1/page-assets/floorplan",
        data={
            "operator_id": "member-1",
            "replace_current": "true",
        },
        files={"file": ("floorplan.png", b"png-bytes", "image/png")},
    )
    create_response = client.post(
        "/api/v1/system/backups",
        json={"operator_id": "member-1"},
    )
    list_response = client.get("/api/v1/system/backups")
    audit_response = client.get("/api/v1/system/backups/restores")
    restore_response = client.post(
        "/api/v1/system/backups/bk_1/restore",
        json={"operator_id": "member-1"},
    )

    assert asset_response.status_code == 200
    assert asset_response.json()["success"] is True
    assert asset_response.json()["data"]["asset_id"] == "asset-1"

    assert create_response.status_code == 200
    assert create_response.json()["data"]["backup_id"] == "bk_1"

    assert list_response.status_code == 200
    assert list_response.json()["data"]["items"][0]["backup_id"] == "bk_1"
    assert list_response.json()["data"]["items"][0]["restored_at"] == "2026-04-14T10:05:00Z"

    assert audit_response.status_code == 200
    assert audit_response.json()["data"]["items"][0]["audit_id"] == "audit-1"
    assert audit_response.json()["data"]["items"][0]["backup_id"] == "bk_1"
    assert audit_response.json()["data"]["items"][0]["settings_version"] == "sv_1"
    assert audit_response.json()["data"]["items"][0]["error_code"] is None

    assert restore_response.status_code == 200
    assert restore_response.json()["data"]["restored"] is True
    assert restore_response.json()["data"]["layout_version"] == "lv_1"
    assert restore_response.json()["data"]["audit_id"] == "audit-1"
