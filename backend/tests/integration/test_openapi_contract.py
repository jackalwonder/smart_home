from __future__ import annotations

from fastapi.routing import APIRoute


def _resolve_ref(openapi: dict, schema: dict) -> dict:
    current = schema
    while "$ref" in current:
        ref_key = current["$ref"].split("/")[-1]
        current = openapi["components"]["schemas"][ref_key]
    return current


def _collect_object_properties(openapi: dict, schema: dict) -> dict:
    resolved = _resolve_ref(openapi, schema)
    properties = dict(resolved.get("properties") or {})
    for branch in resolved.get("allOf", []):
        branch_resolved = _resolve_ref(openapi, branch)
        properties.update(branch_resolved.get("properties") or {})
    return properties


def test_openapi_can_be_exported_from_runtime(client):
    response = client.get("/openapi.json")

    assert response.status_code == 200
    body = response.json()
    assert isinstance(body, dict)
    assert body["openapi"].startswith("3.")
    assert "paths" in body


def test_openapi_contains_bearer_scheme_and_key_paths(client):
    openapi = client.get("/openapi.json").json()
    schemes = openapi["components"]["securitySchemes"]
    assert "BearerAuth" in schemes
    assert schemes["BearerAuth"]["type"] == "http"
    assert schemes["BearerAuth"]["scheme"] == "bearer"

    expected_paths = {
        "/api/v1/auth/session",
        "/api/v1/home/overview",
        "/api/v1/devices/{device_id}",
        "/api/v1/device-controls",
        "/api/v1/device-controls/{request_id}",
        "/api/v1/settings",
        "/api/v1/editor/publish",
    }
    assert expected_paths.issubset(set(openapi["paths"].keys()))

    pin_session_parameters = openapi["paths"]["/api/v1/auth/pin/session"]["get"]["parameters"]
    parameter_flags = {
        parameter["name"]: parameter.get("deprecated", False) for parameter in pin_session_parameters
    }
    assert parameter_flags["home_id"] is True
    assert parameter_flags["terminal_id"] is True


def test_all_http_api_routes_declare_response_model(app):
    missing = []
    for route in app.routes:
        if not isinstance(route, APIRoute):
            continue
        if not route.path.startswith("/api/v1/"):
            continue
        if route.response_model is None:
            missing.append(f"{sorted(route.methods)} {route.path}")
    assert missing == []


def test_openapi_success_and_error_envelope_shape(client):
    openapi = client.get("/openapi.json").json()
    auth_session_operation = openapi["paths"]["/api/v1/auth/session"]["get"]
    success_schema = auth_session_operation["responses"]["200"]["content"]["application/json"]["schema"]
    success_properties = _collect_object_properties(openapi, success_schema)
    assert {"success", "data", "error", "meta"}.issubset(set(success_properties.keys()))

    meta_properties = _collect_object_properties(openapi, success_properties["meta"])
    assert {"trace_id", "server_time"}.issubset(set(meta_properties.keys()))

    for code in ("404", "405", "500"):
        assert code in auth_session_operation["responses"]
        error_schema = auth_session_operation["responses"][code]["content"]["application/json"]["schema"]
        error_properties = _collect_object_properties(openapi, error_schema)
        assert {"success", "data", "error", "meta"}.issubset(set(error_properties.keys()))
