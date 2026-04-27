from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from src.shared.errors.AppError import AppError
from src.shared.errors.ErrorCode import ErrorCode
from src.shared.http.ResponseEnvelope import error_response


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
        return error_response(
            request,
            str(ErrorCode.INTERNAL_SERVER_ERROR),
            "服务端内部异常",
            details={"exception_type": exc.__class__.__name__},
            status_code=500,
        )
