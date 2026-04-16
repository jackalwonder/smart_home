from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Depends, Query, Request
from pydantic import Field

from src.app.container import get_media_service, get_request_context_service
from src.modules.auth.services.query.RequestContextService import RequestContextService
from src.modules.media.services.MediaService import MediaService
from src.shared.http.ApiSchema import ApiSchema
from src.shared.http.ResponseEnvelope import SuccessEnvelope, success_response

router = APIRouter(prefix="/api/v1/media/default", tags=["media"])


class BindMediaBody(ApiSchema):
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
    device_id: str = Field(...)
    member_id: str | None = None


class UnbindMediaBody(ApiSchema):
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
    member_id: str | None = None


class MediaControlSchemaItemResponse(ApiSchema):
    action_type: str
    target_scope: str | None = None
    target_key: str | None = None
    value_type: str | None = None
    value_range: dict[str, Any] | None = None
    allowed_values: list[Any] | None = None
    unit: str | None = None
    is_quick_action: bool
    requires_detail_entry: bool


class DefaultMediaResponse(ApiSchema):
    binding_status: str
    availability_status: str | None = None
    device_id: str | None = None
    display_name: str | None = None
    play_state: str | None = None
    track_title: str | None = None
    artist: str | None = None
    cover_url: str | None = None
    entry_behavior: str
    confirmation_type: str
    control_schema: list[MediaControlSchemaItemResponse] = Field(default_factory=list)


class MediaBindingResponse(ApiSchema):
    saved: bool
    binding_status: str
    availability_status: str | None = None
    device_id: str | None = None
    display_name: str | None = None
    updated_at: str


@router.get("", response_model=SuccessEnvelope[DefaultMediaResponse])
async def get_default_media(
    request: Request,
    service: MediaService = Depends(get_media_service),
    request_context_service: RequestContextService = Depends(get_request_context_service),
) -> object:
    context = await request_context_service.resolve_http_request(request, require_home=True)
    payload = await service.get_default_media(context.home_id)
    return success_response(request, DefaultMediaResponse.model_validate(payload))


@router.put("/binding", response_model=SuccessEnvelope[MediaBindingResponse])
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
    payload = await service.bind_default_media(
        context.home_id,
        context.terminal_id,
        body.device_id,
        body.member_id or context.operator_id,
    )
    return success_response(request, MediaBindingResponse.model_validate(payload))


@router.delete("/binding", response_model=SuccessEnvelope[MediaBindingResponse])
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
    payload = await service.unbind_default_media(
        context.home_id,
        context.terminal_id,
        body.member_id or context.operator_id,
    )
    return success_response(request, MediaBindingResponse.model_validate(payload))
