from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Generic, TypeVar
from uuid import uuid4

from fastapi import Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from src.shared.http.ApiSchema import ApiSchema

T = TypeVar("T")


class ResponseMeta(ApiSchema):
    trace_id: str
    server_time: str


class ErrorBody(ApiSchema):
    code: str
    message: str
    details: dict[str, Any] | None = None


class SuccessEnvelope(BaseModel, Generic[T]):
    model_config = ConfigDict(extra="forbid")

    success: bool = Field(default=True)
    data: T
    error: None = None
    meta: ResponseMeta


class ErrorEnvelope(ApiSchema):
    success: bool = Field(default=False)
    data: None = None
    error: ErrorBody
    meta: ResponseMeta


def _server_time() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _meta(request: Request) -> dict[str, str]:
    trace_id = getattr(request.state, "trace_id", None) or str(uuid4())
    return {
        "trace_id": trace_id,
        "server_time": _server_time(),
    }


def success_response(
    request: Request,
    data: Any,
    *,
    status_code: int = 200,
) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={
            "success": True,
            "data": jsonable_encoder(data),
            "error": None,
            "meta": _meta(request),
        },
    )


def error_response(
    request: Request,
    code: str,
    message: str,
    *,
    details: dict[str, Any] | None = None,
    status_code: int = 400,
) -> JSONResponse:
    error: dict[str, Any] = {
        "code": code,
        "message": message,
    }
    if details is not None:
        error["details"] = jsonable_encoder(details)
    return JSONResponse(
        status_code=status_code,
        content={
            "success": False,
            "data": None,
            "error": error,
            "meta": _meta(request),
        },
    )
