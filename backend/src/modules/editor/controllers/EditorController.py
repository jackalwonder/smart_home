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
    home_id: str | None = Field(default=None, description="Legacy compatibility context field.")
    terminal_id: str
    takeover_if_locked: bool = False
    member_id: str | None = None


class EditorHeartbeatRequestBody(ApiSchema):
    home_id: str | None = Field(default=None, description="Legacy compatibility context field.")
    terminal_id: str


class EditorDraftSaveRequestBody(ApiSchema):
    home_id: str | None = Field(default=None, description="Legacy compatibility context field.")
    terminal_id: str
    lease_id: str
    draft_version: str
    base_layout_version: str
    background_asset_id: str | None = None
    layout_meta: dict[str, Any] = Field(default_factory=dict)
    hotspots: list[dict[str, Any]] = Field(default_factory=list)
    member_id: str | None = None


class EditorPublishRequestBody(ApiSchema):
    home_id: str | None = Field(default=None, description="Legacy compatibility context field.")
    terminal_id: str
    lease_id: str
    draft_version: str
    base_layout_version: str
    member_id: str | None = None


class EditorDraftDeleteRequestBody(ApiSchema):
    home_id: str | None = Field(default=None, description="Legacy compatibility context field.")
    terminal_id: str
    lease_id: str
    draft_version: str | None = None


@router.post("/sessions", response_model=SuccessEnvelope[dict[str, Any]])
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
    return success_response(request, asdict(view))


@router.get("/draft", response_model=SuccessEnvelope[dict[str, Any]])
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
    return success_response(request, asdict(view))


@router.post("/sessions/{lease_id}/heartbeat", response_model=SuccessEnvelope[dict[str, Any]])
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
    return success_response(request, asdict(view))


@router.post("/sessions/{lease_id}/takeover", response_model=SuccessEnvelope[dict[str, Any]])
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
    return success_response(
        request,
        {
            "taken_over": True,
            "new_lease_id": view.lease_id,
            "lease_expires_at": view.lease_expires_at,
            "previous_terminal_id": view.previous_terminal_id,
            "draft_version": view.draft_version,
        },
    )


@router.put("/draft", response_model=SuccessEnvelope[dict[str, Any]])
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
            hotspots=body.hotspots,
            member_id=body.member_id or context.operator_id,
        )
    )
    return success_response(request, asdict(view))


@router.post("/publish", response_model=SuccessEnvelope[dict[str, Any]])
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
    return success_response(request, asdict(view))


@router.delete("/draft", response_model=SuccessEnvelope[dict[str, Any]])
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
    return success_response(
        request,
        await service.discard_draft(
            EditorDraftDiscardInput(
                home_id=context.home_id,
                terminal_id=context.terminal_id,
                lease_id=body.lease_id,
                draft_version=body.draft_version,
            )
        ),
    )
