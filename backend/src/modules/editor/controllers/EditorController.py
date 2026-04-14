from __future__ import annotations

from dataclasses import asdict
from typing import Any

from fastapi import APIRouter, Body, Depends, Query, Request
from pydantic import BaseModel, Field

from src.app.container import (
    get_editor_draft_service,
    get_editor_publish_service,
    get_editor_session_service,
)
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
from src.shared.http.ResponseEnvelope import success_response

router = APIRouter(prefix="/api/v1/editor", tags=["editor"])


class EditorSessionRequestBody(BaseModel):
    home_id: str
    terminal_id: str
    takeover_if_locked: bool = False
    member_id: str | None = None


class EditorHeartbeatRequestBody(BaseModel):
    home_id: str
    terminal_id: str


class EditorDraftSaveRequestBody(BaseModel):
    home_id: str
    terminal_id: str
    lease_id: str
    draft_version: str
    base_layout_version: str
    background_asset_id: str | None = None
    layout_meta: dict[str, Any] = Field(default_factory=dict)
    hotspots: list[dict[str, Any]] = Field(default_factory=list)
    member_id: str | None = None


class EditorPublishRequestBody(BaseModel):
    home_id: str
    terminal_id: str
    lease_id: str
    draft_version: str
    base_layout_version: str
    member_id: str | None = None


class EditorDraftDeleteRequestBody(BaseModel):
    home_id: str
    terminal_id: str
    lease_id: str
    draft_version: str | None = None


@router.post("/sessions")
async def open_editor_session(
    request: Request,
    body: EditorSessionRequestBody = Body(...),
    service: EditorSessionService = Depends(get_editor_session_service),
) -> object:
    view: EditorSessionView = await service.open_session(
        EditorSessionInput(
            home_id=body.home_id,
            terminal_id=body.terminal_id,
            takeover_if_locked=body.takeover_if_locked,
            member_id=body.member_id,
        )
    )
    return success_response(request, asdict(view))


@router.get("/draft")
async def get_editor_draft(
    request: Request,
    home_id: str = Query(...),
    service: EditorDraftService = Depends(get_editor_draft_service),
) -> object:
    view = await service.get_draft(EditorDraftInput(home_id=home_id))
    if view is None:
        return success_response(
            request,
            {
                "draft_exists": False,
                "draft_version": None,
                "base_layout_version": None,
                "lock_status": "READ_ONLY",
                "layout": None,
                "readonly": True,
            },
        )
    return success_response(
        request,
        {
            "draft_exists": True,
            "draft_version": view.draft_version,
            "base_layout_version": view.base_layout_version,
            "lock_status": "GRANTED" if view.active_lease is not None else "READ_ONLY",
            "layout": {
                "background_image_url": view.background_asset_id,
                "background_image_size": None,
                "hotspots": view.hotspots,
                "layout_meta": view.layout_meta,
            },
            "readonly": view.active_lease is None,
        },
    )


@router.post("/sessions/{lease_id}/heartbeat")
async def editor_heartbeat(
    request: Request,
    lease_id: str,
    body: EditorHeartbeatRequestBody = Body(...),
    service: EditorSessionService = Depends(get_editor_session_service),
) -> object:
    view: EditorHeartbeatView = await service.heartbeat(
        EditorHeartbeatInput(
            home_id=body.home_id,
            terminal_id=body.terminal_id,
            lease_id=lease_id,
        )
    )
    return success_response(request, asdict(view))


@router.post("/sessions/{lease_id}/takeover")
async def editor_takeover(
    request: Request,
    lease_id: str,
    body: EditorSessionRequestBody = Body(...),
    service: EditorSessionService = Depends(get_editor_session_service),
) -> object:
    view = await service.open_session(
        EditorSessionInput(
            home_id=body.home_id,
            terminal_id=body.terminal_id,
            takeover_if_locked=True,
            member_id=body.member_id,
        )
    )
    return success_response(
        request,
        {
            "taken_over": True,
            "new_lease_id": view.lease_id,
            "lease_expires_at": view.lease_expires_at,
            "previous_terminal_id": view.locked_by,
            "draft_version": view.draft_version,
        },
    )


@router.put("/draft")
async def save_editor_draft(
    request: Request,
    body: EditorDraftSaveRequestBody = Body(...),
    service: EditorDraftService = Depends(get_editor_draft_service),
) -> object:
    view: EditorDraftSaveView = await service.save_draft(
        EditorDraftSaveInput(
            home_id=body.home_id,
            terminal_id=body.terminal_id,
            lease_id=body.lease_id,
            draft_version=body.draft_version,
            base_layout_version=body.base_layout_version,
            background_asset_id=body.background_asset_id,
            layout_meta=body.layout_meta,
            hotspots=body.hotspots,
            member_id=body.member_id,
        )
    )
    return success_response(request, asdict(view))


@router.post("/publish")
async def publish_editor_draft(
    request: Request,
    body: EditorPublishRequestBody = Body(...),
    service: EditorPublishService = Depends(get_editor_publish_service),
) -> object:
    view: EditorPublishView = await service.publish(
        EditorPublishInput(
            home_id=body.home_id,
            terminal_id=body.terminal_id,
            lease_id=body.lease_id,
            draft_version=body.draft_version,
            base_layout_version=body.base_layout_version,
            member_id=body.member_id,
        )
    )
    return success_response(request, asdict(view))


@router.delete("/draft")
async def discard_editor_draft(
    request: Request,
    body: EditorDraftDeleteRequestBody = Body(...),
    service: EditorDraftService = Depends(get_editor_draft_service),
) -> object:
    return success_response(
        request,
        await service.discard_draft(
            EditorDraftDiscardInput(
                home_id=body.home_id,
                terminal_id=body.terminal_id,
                lease_id=body.lease_id,
                draft_version=body.draft_version,
            )
        ),
    )
