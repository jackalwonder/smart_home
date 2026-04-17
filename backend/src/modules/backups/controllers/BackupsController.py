from __future__ import annotations

from dataclasses import asdict
from typing import Any

from fastapi import APIRouter, Body, Depends, Query, Request
from pydantic import Field

from src.app.container import (
    get_backup_restore_service,
    get_backup_service,
    get_request_context_service,
)
from src.modules.auth.services.query.RequestContextService import RequestContextService
from src.modules.backups.services.BackupRestoreService import BackupRestoreService
from src.modules.backups.services.BackupService import BackupService
from src.shared.http.ApiSchema import ApiSchema
from src.shared.http.ResponseEnvelope import SuccessEnvelope, success_response

router = APIRouter(prefix="/api/v1/system/backups", tags=["backups"])


class BackupCreateBody(ApiSchema):
    home_id: str | None = Field(
        default=None,
        description="Legacy compatibility context field.",
        json_schema_extra={"deprecated": True},
    )
    terminal_id: str | None = Field(
        default=None,
        description="Legacy compatibility context field.",
        json_schema_extra={"deprecated": True},
    )
    operator_id: str | None = None
    note: str | None = None


class BackupRestoreBody(ApiSchema):
    home_id: str | None = Field(
        default=None,
        description="Legacy compatibility context field.",
        json_schema_extra={"deprecated": True},
    )
    terminal_id: str | None = Field(
        default=None,
        description="Legacy compatibility context field.",
        json_schema_extra={"deprecated": True},
    )
    operator_id: str | None = None


class BackupCreateResponse(ApiSchema):
    backup_id: str
    created_at: str
    status: str


class BackupListItemResponse(ApiSchema):
    backup_id: str
    created_at: str
    restored_at: str | None = None
    created_by: str | None = None
    status: str
    note: str | None = None


class BackupListResponse(ApiSchema):
    items: list[BackupListItemResponse] = Field(default_factory=list)


class BackupRestoreResponse(ApiSchema):
    restored: bool
    settings_version: str
    layout_version: str
    audit_id: str
    effective_at: str
    message: str


class BackupRestoreAuditItemResponse(ApiSchema):
    audit_id: str
    backup_id: str
    restored_at: str
    operator_id: str | None = None
    operator_name: str | None = None
    terminal_id: str | None = None
    before_version: str | None = None
    settings_version: str | None = None
    layout_version: str | None = None
    result_status: str
    error_code: str | None = None
    error_message: str | None = None
    failure_reason: str | None = None


class BackupRestoreAuditListResponse(ApiSchema):
    items: list[BackupRestoreAuditItemResponse] = Field(default_factory=list)


@router.post("", response_model=SuccessEnvelope[BackupCreateResponse])
async def create_backup(
    request: Request,
    body: BackupCreateBody = Body(...),
    service: BackupService = Depends(get_backup_service),
    request_context_service: RequestContextService = Depends(get_request_context_service),
) -> object:
    context = await request_context_service.resolve_http_request(
        request,
        explicit_home_id=body.home_id,
        explicit_terminal_id=body.terminal_id,
        require_home=True,
        require_terminal=True,
    )
    view = await service.create_backup(
        home_id=context.home_id,
        terminal_id=context.terminal_id,
        operator_id=body.operator_id or context.operator_id,
        note=body.note,
    )
    return success_response(request, BackupCreateResponse.model_validate(asdict(view)))


@router.get("", response_model=SuccessEnvelope[BackupListResponse])
async def list_backups(
    request: Request,
    service: BackupService = Depends(get_backup_service),
    request_context_service: RequestContextService = Depends(get_request_context_service),
) -> object:
    context = await request_context_service.resolve_http_request(
        request,
        require_home=True,
        require_terminal=True,
    )
    payload = await service.list_backups(
        home_id=context.home_id,
        terminal_id=context.terminal_id,
    )
    return success_response(request, BackupListResponse.model_validate(payload))


@router.get("/restores", response_model=SuccessEnvelope[BackupRestoreAuditListResponse])
async def list_restore_audits(
    request: Request,
    limit: int = Query(default=20, ge=1, le=100),
    service: BackupRestoreService = Depends(get_backup_restore_service),
    request_context_service: RequestContextService = Depends(get_request_context_service),
) -> object:
    context = await request_context_service.resolve_http_request(
        request,
        require_home=True,
        require_terminal=True,
    )
    audits = await service.list_restore_audits(
        home_id=context.home_id,
        terminal_id=context.terminal_id,
        limit=limit,
    )
    return success_response(
        request,
        BackupRestoreAuditListResponse(
            items=[BackupRestoreAuditItemResponse.model_validate(asdict(audit)) for audit in audits]
        ),
    )


@router.post("/{backup_id}/restore", response_model=SuccessEnvelope[BackupRestoreResponse])
async def restore_backup(
    request: Request,
    backup_id: str,
    body: BackupRestoreBody = Body(...),
    service: BackupRestoreService = Depends(get_backup_restore_service),
    request_context_service: RequestContextService = Depends(get_request_context_service),
) -> object:
    context = await request_context_service.resolve_http_request(
        request,
        explicit_home_id=body.home_id,
        explicit_terminal_id=body.terminal_id,
        require_home=True,
        require_terminal=True,
    )
    view = await service.restore_backup(
        home_id=context.home_id,
        backup_id=backup_id,
        terminal_id=context.terminal_id,
        operator_id=body.operator_id or context.operator_id,
    )
    return success_response(request, BackupRestoreResponse.model_validate(asdict(view)))
