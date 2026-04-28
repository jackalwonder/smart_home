from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from src.shared.config.Settings import LOCAL_APP_ENVS, get_settings
from src.shared.errors.AppError import AppError
from src.shared.errors.ErrorCode import ErrorCode
from src.shared.http.ResponseEnvelope import error_response

logger = logging.getLogger(__name__)


def status_code_for_error(code: ErrorCode) -> int:
    if code == ErrorCode.NOT_FOUND:
        return 404
    if code == ErrorCode.METHOD_NOT_ALLOWED:
        return 405
    if code == ErrorCode.INTERNAL_SERVER_ERROR:
        return 500
    if code == ErrorCode.UNAUTHORIZED:
        return 401
    if code in {
        ErrorCode.REQUEST_ID_CONFLICT,
        ErrorCode.VERSION_CONFLICT,
        ErrorCode.DRAFT_LOCK_LOST,
        ErrorCode.DRAFT_LOCK_TAKEN_OVER,
    }:
        return 409
    if code in {ErrorCode.PIN_REQUIRED, ErrorCode.PIN_LOCKED}:
        return 403
    if code in {ErrorCode.DEVICE_NOT_FOUND, ErrorCode.CONTROL_REQUEST_NOT_FOUND}:
        return 404
    if code == ErrorCode.FORBIDDEN:
        return 403
    if code == ErrorCode.HA_UNAVAILABLE:
        return 503
    return 400


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def app_error_handler(request: Request, exc: AppError):
        request.state.error_code = str(exc.code)
        return error_response(
            request,
            str(exc.code),
            exc.message,
            details=exc.details,
            status_code=exc.status_code or status_code_for_error(exc.code),
        )

    @app.exception_handler(RequestValidationError)
    async def request_validation_error_handler(request: Request, exc: RequestValidationError):
        request.state.error_code = str(ErrorCode.INVALID_PARAMS)
        details = {
            "fields": [
                {
                    "field": ".".join(str(part) for part in error["loc"] if part != "body"),
                    "reason": error["type"],
                }
                for error in exc.errors()
            ]
        }
        return error_response(
            request,
            str(ErrorCode.INVALID_PARAMS),
            "请求参数不合法",
            details=details,
            status_code=400,
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException):
        if exc.status_code == 404:
            code = ErrorCode.NOT_FOUND
            message = "接口不存在"
        elif exc.status_code == 405:
            code = ErrorCode.METHOD_NOT_ALLOWED
            message = "请求方法不被允许"
        else:
            code = ErrorCode.INVALID_PARAMS
            message = str(exc.detail) if isinstance(exc.detail, str) else "请求不合法"
        request.state.error_code = str(code)
        return error_response(
            request,
            str(code),
            message,
            status_code=exc.status_code,
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        request.state.error_code = str(ErrorCode.INTERNAL_SERVER_ERROR)
        logger.exception(
            "Unhandled exception while processing request trace_id=%s path=%s",
            getattr(request.state, "trace_id", None),
            request.url.path,
            exc_info=(type(exc), exc, exc.__traceback__),
        )
        normalized_env = get_settings().app_env.strip().lower()
        details = None
        if normalized_env in LOCAL_APP_ENVS:
            details = {"exception_type": exc.__class__.__name__}
        return error_response(
            request,
            str(ErrorCode.INTERNAL_SERVER_ERROR),
            "服务端内部异常",
            details=details,
            status_code=500,
        )
