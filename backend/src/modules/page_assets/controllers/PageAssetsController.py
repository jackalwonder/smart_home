from __future__ import annotations

from dataclasses import asdict
from typing import Any

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile

from src.app.container import get_floorplan_asset_service, get_request_context_service
from src.modules.auth.services.query.RequestContextService import RequestContextService
from src.modules.page_assets.services.FloorplanAssetService import FloorplanAssetService
from src.shared.http.ResponseEnvelope import SuccessEnvelope, success_response

router = APIRouter(prefix="/api/v1/page-assets", tags=["page_assets"])


@router.post("/floorplan", response_model=SuccessEnvelope[dict[str, Any]])
async def upload_floorplan(
    request: Request,
    home_id: str | None = Form(default=None, description="Legacy compatibility context field."),
    terminal_id: str = Form(...),
    operator_id: str | None = Form(default=None),
    replace_current: bool = Form(default=False),
    file: UploadFile = File(...),
    service: FloorplanAssetService = Depends(get_floorplan_asset_service),
    request_context_service: RequestContextService = Depends(get_request_context_service),
) -> object:
    context = await request_context_service.resolve_http_request(
        request,
        explicit_home_id=home_id,
        explicit_terminal_id=terminal_id,
        require_home=True,
        require_terminal=True,
    )
    payload = await file.read()
    view = await service.upload_floorplan(
        home_id=context.home_id,
        terminal_id=context.terminal_id,
        operator_id=operator_id or context.operator_id,
        filename=file.filename or "floorplan.bin",
        content_type=file.content_type,
        data=payload,
        replace_current=replace_current,
    )
    return success_response(request, asdict(view))
