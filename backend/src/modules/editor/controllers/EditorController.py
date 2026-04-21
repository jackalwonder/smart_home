from __future__ import annotations

from dataclasses import asdict
from typing import Any

from fastapi import APIRouter, Body, Depends, Query, Request
from pydantic import Field

from src.app.container import (
    get_editor_draft_service,
    get_editor_publish_service,
    get_editor_session_service,
    get_request_context_service,
)
from src.modules.auth.services.query.RequestContextService import RequestContextService
from src.modules.editor.services.EditorDraftService import (
    EditorDraftDiffInput,
    EditorDraftDiffView,
    EditorDraftDiscardInput,
    EditorDraftInput,
    EditorDraftSaveInput,
    EditorDraftSaveView,
    EditorDraftService,
)
from src.modules.editor.services.EditorPublishService import (
    EditorPublishInput,
    EditorPublishService,
    EditorPublishView,
)
from src.modules.editor.services.EditorSessionService import (
    EditorHeartbeatInput,
    EditorHeartbeatView,
    EditorSessionInput,
    EditorSessionService,
    EditorSessionView,
)
from src.shared.http.ApiSchema import ApiSchema
from src.shared.http.ResponseEnvelope import SuccessEnvelope, success_response

router = APIRouter(prefix="/api/v1/editor", tags=["editor"])


class EditorSessionRequestBody(ApiSchema):
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
    takeover_if_locked: bool = False
    member_id: str | None = None


class EditorHeartbeatRequestBody(ApiSchema):
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


class EditorDraftSaveRequestBody(ApiSchema):
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
    lease_id: str
    draft_version: str
    base_layout_version: str
    background_asset_id: str | None = None
    layout_meta: dict[str, Any] = Field(default_factory=dict)
    hotspots: list["EditorDraftSaveHotspotRequestBody"] = Field(default_factory=list)
    member_id: str | None = None


class EditorPublishRequestBody(ApiSchema):
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
    lease_id: str
    draft_version: str
    base_layout_version: str
    member_id: str | None = None


class EditorDraftDeleteRequestBody(ApiSchema):
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
    lease_id: str
    draft_version: str | None = None


class EditorDraftDiffRequestBody(ApiSchema):
    base_layout_version: str | None = None
    background_asset_id: str | None = None
    layout_meta: dict[str, Any] = Field(default_factory=dict)
    hotspots: list["EditorDraftSaveHotspotRequestBody"] = Field(default_factory=list)


class EditorDraftSaveHotspotRequestBody(ApiSchema):
    hotspot_id: str
    device_id: str
    x: float
    y: float
    icon_type: str | None = None
    icon_asset_id: str | None = None
    label_mode: str | None = None
    is_visible: bool = True
    structure_order: int = 0


class EditorLockedByResponse(ApiSchema):
    terminal_id: str | None = None
    operator_id: str | None = None


class EditorSessionResponse(ApiSchema):
    granted: bool
    lock_status: str
    lease_id: str | None = None
    lease_expires_at: str | None = None
    heartbeat_interval_seconds: int | None = None
    locked_by: EditorLockedByResponse | None = None
    draft_version: str | None = None
    current_layout_version: str | None = None
    previous_terminal_id: str | None = None


class EditorDraftLayoutImageSizeResponse(ApiSchema):
    width: int | None = None
    height: int | None = None


class EditorDraftHotspotResponse(ApiSchema):
    hotspot_id: str
    device_id: str
    display_name: str | None = None
    x: float
    y: float
    icon_type: str | None = None
    icon_asset_id: str | None = None
    icon_asset_url: str | None = None
    label_mode: str | None = None
    is_visible: bool
    structure_order: int


class EditorDraftLayoutResponse(ApiSchema):
    background_asset_id: str | None = None
    background_image_url: str | None = None
    background_image_size: EditorDraftLayoutImageSizeResponse | None = None
    hotspots: list[EditorDraftHotspotResponse] = Field(default_factory=list)
    layout_meta: dict[str, Any] = Field(default_factory=dict)


class EditorDraftResponse(ApiSchema):
    draft_exists: bool
    draft_version: str | None = None
    base_layout_version: str | None = None
    lock_status: str
    layout: EditorDraftLayoutResponse | None = None
    readonly: bool


class EditorHeartbeatResponse(ApiSchema):
    lease_id: str
    lease_expires_at: str
    lock_status: str


class EditorTakeoverResponse(ApiSchema):
    taken_over: bool
    new_lease_id: str | None = None
    lease_expires_at: str | None = None
    previous_terminal_id: str | None = None
    draft_version: str | None = None


class EditorDraftSaveResponse(ApiSchema):
    saved_to_draft: bool
    draft_version: str
    preview_only: bool
    lock_status: str


class EditorPublishResponse(ApiSchema):
    published: bool
    layout_version: str
    effective_at: str
    lock_released: bool


class EditorDraftDiscardResponse(ApiSchema):
    discarded: bool
    lock_released: bool


class EditorDraftDiffItemResponse(ApiSchema):
    change_type: str
    label: str
    count: int
    summary: str
    preview: list[str] = Field(default_factory=list)


class EditorDraftDiffResponse(ApiSchema):
    base_layout_version: str | None = None
    compared_layout_version: str | None = None
    has_changes: bool
    total_changes: int
    items: list[EditorDraftDiffItemResponse] = Field(default_factory=list)


def _serialize_editor_session(view: EditorSessionView) -> EditorSessionResponse:
    payload = asdict(view)
    payload["locked_by"] = (
        {
            "terminal_id": view.locked_by,
            "operator_id": None,
        }
        if view.locked_by is not None
        else None
    )
    return EditorSessionResponse.model_validate(payload)


@router.post("/sessions", response_model=SuccessEnvelope[EditorSessionResponse])
async def open_editor_session(
    request: Request,
    body: EditorSessionRequestBody = Body(...),
    service: EditorSessionService = Depends(get_editor_session_service),
    request_context_service: RequestContextService = Depends(get_request_context_service),
) -> object:
    context = await request_context_service.resolve_http_request(
        request,
        explicit_home_id=body.home_id,
        explicit_terminal_id=body.terminal_id,
        require_home=True,
        require_terminal=True,
    )
    view: EditorSessionView = await service.open_session(
        EditorSessionInput(
            home_id=context.home_id,
            terminal_id=context.terminal_id,
            takeover_if_locked=body.takeover_if_locked,
            member_id=body.member_id or context.operator_id,
        )
    )
    return success_response(request, _serialize_editor_session(view))


@router.get("/draft", response_model=SuccessEnvelope[EditorDraftResponse])
async def get_editor_draft(
    request: Request,
    lease_id: str | None = Query(default=None),
    service: EditorDraftService = Depends(get_editor_draft_service),
    request_context_service: RequestContextService = Depends(get_request_context_service),
) -> object:
    context = await request_context_service.resolve_http_request(
        request,
        require_home=True,
        require_terminal=False,
    )
    view = await service.get_draft(
        EditorDraftInput(
            home_id=context.home_id,
            terminal_id=context.terminal_id,
            lease_id=lease_id,
        )
    )
    return success_response(request, EditorDraftResponse.model_validate(asdict(view)))


@router.post("/draft/diff", response_model=SuccessEnvelope[EditorDraftDiffResponse])
async def preview_editor_draft_diff(
    request: Request,
    body: EditorDraftDiffRequestBody = Body(...),
    service: EditorDraftService = Depends(get_editor_draft_service),
    request_context_service: RequestContextService = Depends(get_request_context_service),
) -> object:
    context = await request_context_service.resolve_http_request(
        request,
        require_home=True,
        require_terminal=False,
    )
    view: EditorDraftDiffView = await service.preview_diff(
        EditorDraftDiffInput(
            home_id=context.home_id,
            base_layout_version=body.base_layout_version,
            background_asset_id=body.background_asset_id,
            layout_meta=body.layout_meta,
            hotspots=[hotspot.model_dump() for hotspot in body.hotspots],
        )
    )
    return success_response(request, EditorDraftDiffResponse.model_validate(asdict(view)))


@router.post("/sessions/{lease_id}/heartbeat", response_model=SuccessEnvelope[EditorHeartbeatResponse])
async def editor_heartbeat(
    request: Request,
    lease_id: str,
    body: EditorHeartbeatRequestBody = Body(...),
    service: EditorSessionService = Depends(get_editor_session_service),
    request_context_service: RequestContextService = Depends(get_request_context_service),
) -> object:
    context = await request_context_service.resolve_http_request(
        request,
        explicit_home_id=body.home_id,
        explicit_terminal_id=body.terminal_id,
        require_home=True,
        require_terminal=True,
    )
    view: EditorHeartbeatView = await service.heartbeat(
        EditorHeartbeatInput(
            home_id=context.home_id,
            terminal_id=context.terminal_id,
            lease_id=lease_id,
        )
    )
    return success_response(request, EditorHeartbeatResponse.model_validate(asdict(view)))


@router.post("/sessions/{lease_id}/takeover", response_model=SuccessEnvelope[EditorTakeoverResponse])
async def editor_takeover(
    request: Request,
    lease_id: str,
    body: EditorSessionRequestBody = Body(...),
    service: EditorSessionService = Depends(get_editor_session_service),
    request_context_service: RequestContextService = Depends(get_request_context_service),
) -> object:
    context = await request_context_service.resolve_http_request(
        request,
        explicit_home_id=body.home_id,
        explicit_terminal_id=body.terminal_id,
        require_home=True,
        require_terminal=True,
    )
    view = await service.open_session(
        EditorSessionInput(
            home_id=context.home_id,
            terminal_id=context.terminal_id,
            takeover_if_locked=True,
            member_id=body.member_id or context.operator_id,
            expected_lease_id=lease_id,
        )
    )
    payload = {
        "taken_over": True,
        "new_lease_id": view.lease_id,
        "lease_expires_at": view.lease_expires_at,
        "previous_terminal_id": view.previous_terminal_id,
        "draft_version": view.draft_version,
    }
    return success_response(request, EditorTakeoverResponse.model_validate(payload))


@router.put("/draft", response_model=SuccessEnvelope[EditorDraftSaveResponse])
async def save_editor_draft(
    request: Request,
    body: EditorDraftSaveRequestBody = Body(...),
    service: EditorDraftService = Depends(get_editor_draft_service),
    request_context_service: RequestContextService = Depends(get_request_context_service),
) -> object:
    context = await request_context_service.resolve_http_request(
        request,
        explicit_home_id=body.home_id,
        explicit_terminal_id=body.terminal_id,
        require_home=True,
        require_terminal=True,
    )
    view: EditorDraftSaveView = await service.save_draft(
        EditorDraftSaveInput(
            home_id=context.home_id,
            terminal_id=context.terminal_id,
            lease_id=body.lease_id,
            draft_version=body.draft_version,
            base_layout_version=body.base_layout_version,
            background_asset_id=body.background_asset_id,
            layout_meta=body.layout_meta,
            hotspots=[hotspot.model_dump() for hotspot in body.hotspots],
            member_id=body.member_id or context.operator_id,
        )
    )
    return success_response(request, EditorDraftSaveResponse.model_validate(asdict(view)))


@router.post("/publish", response_model=SuccessEnvelope[EditorPublishResponse])
async def publish_editor_draft(
    request: Request,
    body: EditorPublishRequestBody = Body(...),
    service: EditorPublishService = Depends(get_editor_publish_service),
    request_context_service: RequestContextService = Depends(get_request_context_service),
) -> object:
    context = await request_context_service.resolve_http_request(
        request,
        explicit_home_id=body.home_id,
        explicit_terminal_id=body.terminal_id,
        require_home=True,
        require_terminal=True,
    )
    view: EditorPublishView = await service.publish(
        EditorPublishInput(
            home_id=context.home_id,
            terminal_id=context.terminal_id,
            lease_id=body.lease_id,
            draft_version=body.draft_version,
            base_layout_version=body.base_layout_version,
            member_id=body.member_id or context.operator_id,
        )
    )
    return success_response(request, EditorPublishResponse.model_validate(asdict(view)))


@router.delete("/draft", response_model=SuccessEnvelope[EditorDraftDiscardResponse])
async def discard_editor_draft(
    request: Request,
    body: EditorDraftDeleteRequestBody = Body(...),
    service: EditorDraftService = Depends(get_editor_draft_service),
    request_context_service: RequestContextService = Depends(get_request_context_service),
) -> object:
    context = await request_context_service.resolve_http_request(
        request,
        explicit_home_id=body.home_id,
        explicit_terminal_id=body.terminal_id,
        require_home=True,
        require_terminal=True,
    )
    payload = await service.discard_draft(
        EditorDraftDiscardInput(
            home_id=context.home_id,
            terminal_id=context.terminal_id,
            lease_id=body.lease_id,
            draft_version=body.draft_version,
        )
    )
    return success_response(request, EditorDraftDiscardResponse.model_validate(payload))
