from __future__ import annotations

from dataclasses import asdict

from fastapi import APIRouter, Body, Depends, Query, Request
from pydantic import BaseModel, Field

from src.app.container import get_backup_restore_service, get_backup_service
from src.modules.backups.services.BackupRestoreService import BackupRestoreService
from src.modules.backups.services.BackupService import BackupService
from src.shared.http.ResponseEnvelope import success_response

router = APIRouter(prefix="/api/v1/system/backups", tags=["backups"])


class BackupCreateBody(BaseModel):
    home_id: str = Field(...)
    terminal_id: str = Field(...)
    operator_id: str | None = None
    note: str | None = None


class BackupRestoreBody(BaseModel):
    home_id: str = Field(...)
    terminal_id: str = Field(...)
    operator_id: str | None = None


@router.post("")
async def create_backup(
    request: Request,
    body: BackupCreateBody = Body(...),
    service: BackupService = Depends(get_backup_service),
) -> object:
    view = await service.create_backup(
        home_id=body.home_id,
        terminal_id=body.terminal_id,
        operator_id=body.operator_id,
        note=body.note,
    )
    return success_response(request, asdict(view))


@router.get("")
async def list_backups(
    request: Request,
    home_id: str = Query(...),
    terminal_id: str = Query(...),
    service: BackupService = Depends(get_backup_service),
) -> object:
    return success_response(
        request,
        await service.list_backups(home_id=home_id, terminal_id=terminal_id),
    )


@router.post("/{backup_id}/restore")
async def restore_backup(
    request: Request,
    backup_id: str,
    body: BackupRestoreBody = Body(...),
    service: BackupRestoreService = Depends(get_backup_restore_service),
) -> object:
    view = await service.restore_backup(
        home_id=body.home_id,
        backup_id=backup_id,
        terminal_id=body.terminal_id,
        operator_id=body.operator_id,
    )
    return success_response(request, asdict(view))
