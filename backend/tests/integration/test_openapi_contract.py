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
    assert "BootstrapAuth" in schemes
    assert schemes["BootstrapAuth"]["type"] == "apiKey"
    assert schemes["BootstrapAuth"]["name"] == "Authorization"

    expected_paths = {
        "/api/v1/auth/session",
        "/api/v1/auth/session/bootstrap",
        "/api/v1/terminals/bootstrap-tokens",
        "/api/v1/terminals/bootstrap-token-audits",
        "/api/v1/terminals/{terminal_id}/bootstrap-token",
        "/api/v1/terminals/{terminal_id}/pairing-code-sessions",
        "/api/v1/terminals/{terminal_id}/pairing-code-sessions/{pairing_id}",
        "/api/v1/terminals/pairing-code-claims",
        "/api/v1/home/overview",
        "/api/v1/devices/{device_id}",
        "/api/v1/device-controls",
        "/api/v1/device-controls/{request_id}",
        "/api/v1/settings",
        "/api/v1/settings/sgcc-login-qrcode",
        "/api/v1/settings/sgcc-login-qrcode/bind-energy-account",
        "/api/v1/settings/sgcc-login-qrcode/file",
        "/api/v1/settings/sgcc-login-qrcode/regenerate",
        "/api/v1/editor/publish",
    }
    assert expected_paths.issubset(set(openapi["paths"].keys()))

    pin_session_operation = openapi["paths"]["/api/v1/auth/pin/session"]["get"]
    pin_session_parameters = pin_session_operation.get("parameters", [])
    assert {parameter["name"] for parameter in pin_session_parameters}.isdisjoint(
        {"home_id", "terminal_id"}
    )
    bootstrap_operation = openapi["paths"]["/api/v1/auth/session/bootstrap"]["post"]
    assert bootstrap_operation["security"] == [{"BootstrapAuth": []}]
    pairing_issue_operation = openapi["paths"]["/api/v1/terminals/{terminal_id}/pairing-code-sessions"]["post"]
    pairing_poll_operation = openapi["paths"]["/api/v1/terminals/{terminal_id}/pairing-code-sessions/{pairing_id}"]["get"]
    assert pairing_issue_operation["security"] == []
    assert pairing_poll_operation["security"] == []


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
