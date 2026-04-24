from __future__ import annotations

from dataclasses import asdict

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from fastapi.responses import FileResponse

from src.app.container import get_floorplan_asset_service, get_request_context_service
from src.modules.auth.services.query.RequestContextService import RequestContextService
from src.modules.page_assets.services.FloorplanAssetService import FloorplanAssetService
from src.shared.http.ApiSchema import ApiSchema
from src.shared.http.ResponseEnvelope import SuccessEnvelope, success_response

router = APIRouter(prefix="/api/v1/page-assets", tags=["page_assets"])


class FloorplanImageSizeResponse(ApiSchema):
    width: int | None = None
    height: int | None = None


class FloorplanAssetResponse(ApiSchema):
    asset_updated: bool
    asset_id: str
    background_image_url: str
    background_image_size: FloorplanImageSizeResponse
    updated_at: str


class HotspotIconAssetResponse(ApiSchema):
    asset_id: str
    icon_asset_url: str
    mime_type: str
    width: int | None = None
    height: int | None = None
    updated_at: str


@router.post("/floorplan", response_model=SuccessEnvelope[FloorplanAssetResponse])
async def upload_floorplan(
    request: Request,
    home_id: str | None = Form(
        default=None,
        description="Legacy compatibility context field.",
    ),
    terminal_id: str | None = Form(
        default=None,
        description="Legacy compatibility context field.",
    ),
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
    return success_response(request, FloorplanAssetResponse.model_validate(asdict(view)))


@router.get(
    "/floorplan/{asset_id}/file",
    response_class=FileResponse,
    response_model=str,
    responses={
        200: {
            "description": "Floorplan image file",
            "content": {
                "image/png": {},
                "image/jpeg": {},
                "image/gif": {},
                "image/webp": {},
            },
        }
    },
)
async def get_floorplan_file(
    asset_id: str,
    request: Request,
    home_id: str | None = None,
    terminal_id: str | None = None,
    service: FloorplanAssetService = Depends(get_floorplan_asset_service),
    request_context_service: RequestContextService = Depends(get_request_context_service),
) -> FileResponse:
    context = await request_context_service.resolve_http_request(
        request,
        explicit_home_id=home_id,
        explicit_terminal_id=terminal_id,
        require_home=True,
    )
    view = await service.get_floorplan_file(
        home_id=context.home_id,
        asset_id=asset_id,
    )
    return FileResponse(view.path, media_type=view.mime_type)


@router.post("/hotspot-icons", response_model=SuccessEnvelope[HotspotIconAssetResponse])
async def upload_hotspot_icon(
    request: Request,
    home_id: str | None = Form(
        default=None,
        description="Legacy compatibility context field.",
    ),
    terminal_id: str | None = Form(
        default=None,
        description="Legacy compatibility context field.",
    ),
    operator_id: str | None = Form(default=None),
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
    view = await service.upload_hotspot_icon(
        home_id=context.home_id,
        terminal_id=context.terminal_id,
        operator_id=operator_id or context.operator_id,
        filename=file.filename or "hotspot-icon.bin",
        content_type=file.content_type,
        data=payload,
    )
    return success_response(request, HotspotIconAssetResponse.model_validate(asdict(view)))


@router.get(
    "/hotspot-icons/{asset_id}/file",
    response_class=FileResponse,
    response_model=str,
    responses={
        200: {
            "description": "Hotspot icon image file",
            "content": {
                "image/svg+xml": {},
                "image/png": {},
                "image/jpeg": {},
                "image/webp": {},
            },
        }
    },
)
async def get_hotspot_icon_file(
    asset_id: str,
    request: Request,
    home_id: str | None = None,
    terminal_id: str | None = None,
    service: FloorplanAssetService = Depends(get_floorplan_asset_service),
    request_context_service: RequestContextService = Depends(get_request_context_service),
) -> FileResponse:
    context = await request_context_service.resolve_http_request(
        request,
        explicit_home_id=home_id,
        explicit_terminal_id=terminal_id,
        require_home=True,
    )
    view = await service.get_hotspot_icon_file(
        home_id=context.home_id,
        asset_id=asset_id,
    )
    return FileResponse(view.path, media_type=view.mime_type)
