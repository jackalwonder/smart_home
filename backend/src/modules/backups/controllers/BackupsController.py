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
    home_id: str | None = Field(default=None, description="Legacy compatibility context field.")
    terminal_id: str | None = Field(default=None, description="Legacy compatibility context field.")
    operator_id: str | None = None
    note: str | None = None


class BackupRestoreBody(ApiSchema):
    home_id: str | None = Field(default=None, description="Legacy compatibility context field.")
    terminal_id: str | None = Field(default=None, description="Legacy compatibility context field.")
    operator_id: str | None = None


@router.post("", response_model=SuccessEnvelope[dict[str, Any]])
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
    return success_response(request, asdict(view))


@router.get("", response_model=SuccessEnvelope[list[dict[str, Any]]])
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
    return success_response(
        request,
        await service.list_backups(
            home_id=context.home_id,
            terminal_id=context.terminal_id,
        ),
    )


@router.post("/{backup_id}/restore", response_model=SuccessEnvelope[dict[str, Any]])
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
    return success_response(request, asdict(view))
