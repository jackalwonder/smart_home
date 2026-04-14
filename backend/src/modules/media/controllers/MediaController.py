from __future__ import annotations

from fastapi import APIRouter, Body, Depends, Query, Request
from pydantic import BaseModel, Field

from src.app.container import get_media_service
from src.modules.media.services.MediaService import MediaService
from src.shared.http.ResponseEnvelope import success_response

router = APIRouter(prefix="/api/v1/media/default", tags=["media"])


class BindMediaBody(BaseModel):
    home_id: str
    terminal_id: str
    device_id: str = Field(...)
    member_id: str | None = None


class UnbindMediaBody(BaseModel):
    home_id: str
    terminal_id: str
    member_id: str | None = None


@router.get("")
async def get_default_media(
    request: Request,
    home_id: str = Query(...),
    service: MediaService = Depends(get_media_service),
) -> object:
    return success_response(request, await service.get_default_media(home_id))


@router.put("/binding")
async def bind_default_media(
    request: Request,
    body: BindMediaBody = Body(...),
    service: MediaService = Depends(get_media_service),
) -> object:
    return success_response(
        request,
        await service.bind_default_media(body.home_id, body.terminal_id, body.device_id, body.member_id),
    )


@router.delete("/binding")
async def unbind_default_media(
    request: Request,
    body: UnbindMediaBody = Body(...),
    service: MediaService = Depends(get_media_service),
) -> object:
    return success_response(
        request,
        await service.unbind_default_media(body.home_id, body.terminal_id, body.member_id),
    )
