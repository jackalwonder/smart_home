from __future__ import annotations

from fastapi import APIRouter, Body, Depends, Query, Request
from pydantic import BaseModel, Field

from src.app.container import get_media_service, get_request_context_service
from src.modules.auth.services.query.RequestContextService import RequestContextService
from src.modules.media.services.MediaService import MediaService
from src.shared.http.ResponseEnvelope import success_response

router = APIRouter(prefix="/api/v1/media/default", tags=["media"])


class BindMediaBody(BaseModel):
    home_id: str | None = None
    terminal_id: str | None = None
    device_id: str = Field(...)
    member_id: str | None = None


class UnbindMediaBody(BaseModel):
    home_id: str | None = None
    terminal_id: str | None = None
    member_id: str | None = None


@router.get("")
async def get_default_media(
    request: Request,
    service: MediaService = Depends(get_media_service),
    request_context_service: RequestContextService = Depends(get_request_context_service),
) -> object:
    context = await request_context_service.resolve_http_request(request, require_home=True)
    return success_response(request, await service.get_default_media(context.home_id))


@router.put("/binding")
async def bind_default_media(
    request: Request,
    body: BindMediaBody = Body(...),
    service: MediaService = Depends(get_media_service),
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
        await service.bind_default_media(
            context.home_id,
            context.terminal_id,
            body.device_id,
            body.member_id or context.operator_id,
        ),
    )


@router.delete("/binding")
async def unbind_default_media(
    request: Request,
    body: UnbindMediaBody = Body(...),
    service: MediaService = Depends(get_media_service),
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
        await service.unbind_default_media(
            context.home_id,
            context.terminal_id,
            body.member_id or context.operator_id,
        ),
    )
