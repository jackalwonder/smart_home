from __future__ import annotations

from dataclasses import asdict

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile

from src.app.container import get_floorplan_asset_service
from src.modules.page_assets.services.FloorplanAssetService import FloorplanAssetService
from src.shared.http.ResponseEnvelope import success_response

router = APIRouter(prefix="/api/v1/page-assets", tags=["page_assets"])


@router.post("/floorplan")
async def upload_floorplan(
    request: Request,
    home_id: str = Form(...),
    terminal_id: str = Form(...),
    operator_id: str | None = Form(default=None),
    replace_current: bool = Form(default=False),
    file: UploadFile = File(...),
    service: FloorplanAssetService = Depends(get_floorplan_asset_service),
) -> object:
    payload = await file.read()
    view = await service.upload_floorplan(
        home_id=home_id,
        terminal_id=terminal_id,
        operator_id=operator_id,
        filename=file.filename or "floorplan.bin",
        content_type=file.content_type,
        data=payload,
        replace_current=replace_current,
    )
    return success_response(request, asdict(view))
