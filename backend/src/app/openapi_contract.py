from __future__ import annotations

from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi
from fastapi.routing import APIRoute

HTTP_METHODS = {"get", "post", "put", "patch", "delete", "head", "options"}
STANDARD_ERROR_RESPONSES: dict[str, str] = {
    "400": "Invalid request parameters",
    "401": "Unauthorized",
    "403": "PIN required or permission denied",
    "404": "Resource not found",
    "405": "Method not allowed",
    "409": "Business conflict",
    "500": "Internal server error",
}
LEGACY_CONTEXT_PARAM_NAMES = {"home_id", "terminal_id", "token", "access_token"}


def build_operation_id(route: APIRoute) -> str:
    methods = sorted(
        method.lower()
        for method in route.methods
        if method in {"GET", "POST", "PUT", "PATCH", "DELETE"}
    )
    method_token = "_".join(methods) if methods else "http"
    path_token = (
        route.path_format.strip("/")
        .replace("/", "_")
        .replace("-", "_")
        .replace("{", "")
        .replace("}", "")
    )
    if not path_token:
        path_token = "root"
    return f"{method_token}_{path_token}"


def error_envelope_schema() -> dict:
    return {
        "type": "object",
        "additionalProperties": False,
        "required": ["success", "data", "error", "meta"],
        "properties": {
            "success": {"type": "boolean"},
            "data": {"type": "null"},
            "error": {
                "type": "object",
                "additionalProperties": False,
                "required": ["code", "message"],
                "properties": {
                    "code": {"type": "string"},
                    "message": {"type": "string"},
                    "details": {"type": "object", "additionalProperties": True},
                },
            },
            "meta": {
                "type": "object",
                "additionalProperties": False,
                "required": ["trace_id", "server_time"],
                "properties": {
                    "trace_id": {"type": "string"},
                    "server_time": {"type": "string"},
                },
            },
        },
    }


def attach_openapi_contract(app: FastAPI) -> None:
    def custom_openapi() -> dict:
        if app.openapi_schema is not None:
            return app.openapi_schema
        schema = get_openapi(
            title=app.title,
            version=app.version,
            routes=app.routes,
        )
        components = schema.setdefault("components", {})
        security_schemes = components.setdefault("securitySchemes", {})
        security_schemes["BearerAuth"] = {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
            "description": "Primary auth path. home_id/terminal_id from token claim are authoritative.",
        }
        security_schemes["BootstrapAuth"] = {
            "type": "apiKey",
            "in": "header",
            "name": "Authorization",
            "description": "Session bootstrap only. Use Authorization: Bootstrap <bootstrap_token>.",
        }

        for path, operations in schema.get("paths", {}).items():
            for method, operation in operations.items():
                if method not in HTTP_METHODS:
                    continue
                if path.startswith("/api/v1/"):
                    operation.setdefault("security", [{"BearerAuth": []}])
                if path == "/api/v1/auth/session/bootstrap":
                    operation["security"] = [{"BootstrapAuth": []}]
                if path == "/api/v1/auth/session/dev":
                    operation["security"] = []
                if path.startswith("/api/v1/terminals/") and "/pairing-code-sessions" in path:
                    operation["security"] = []
                responses = operation.setdefault("responses", {})
                for code, description in STANDARD_ERROR_RESPONSES.items():
                    responses.setdefault(
                        code,
                        {
                            "description": description,
                            "content": {
                                "application/json": {
                                    "schema": error_envelope_schema(),
                                }
                            },
                        },
                    )
                for parameter in operation.get("parameters", []):
                    if (
                        parameter.get("name") in LEGACY_CONTEXT_PARAM_NAMES
                        and parameter.get("in") in {"query", "header", "cookie"}
                    ):
                        parameter["deprecated"] = True
                        note = "Legacy compatibility field. Bearer access token claim is authoritative."
                        description = parameter.get("description")
                        if description is None or note not in description:
                            parameter["description"] = (
                                f"{description} {note}".strip() if description else note
                            )
        app.openapi_schema = schema
        return app.openapi_schema

    app.openapi = custom_openapi
