from __future__ import annotations

import asyncio
import http.cookiejar
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Any

import websockets


API_BASE_URL = os.getenv("SOAK_API_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
WS_URL = os.getenv("SOAK_WS_URL", "ws://127.0.0.1:8000/ws")
HOME_ID = os.getenv("SOAK_HOME_ID", "11111111-1111-1111-1111-111111111111")
TERMINAL_ID = os.getenv("SOAK_TERMINAL_ID", "22222222-2222-2222-2222-222222222222")
PIN = os.getenv("SOAK_PIN", "1234")
BOOTSTRAP_TOKEN = os.getenv("SOAK_BOOTSTRAP_TOKEN", "").strip()
WINDOW_SECONDS = int(os.getenv("SOAK_WINDOW_SECONDS", "1800"))
INTERVAL_SECONDS = int(os.getenv("SOAK_INTERVAL_SECONDS", "180"))
CONTROLLED_NEGATIVE_PROBES = os.getenv("SOAK_NEGATIVE_PROBES", "1") != "0"


class HttpClient:
    def __init__(self) -> None:
        self._jar = http.cookiejar.CookieJar()
        self._opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self._jar))

    def call(
        self,
        method: str,
        path: str,
        *,
        body: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
        timeout: int = 30,
    ) -> tuple[int, Any]:
        request_headers = dict(headers or {})
        data = None
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            request_headers["content-type"] = "application/json"
        request = urllib.request.Request(
            f"{API_BASE_URL}{path}",
            data=data,
            headers=request_headers,
            method=method,
        )
        try:
            with self._opener.open(request, timeout=timeout) as response:
                raw = response.read().decode("utf-8")
                return response.status, json.loads(raw) if raw else None
        except urllib.error.HTTPError as exc:
            raw = exc.read().decode("utf-8", errors="replace")
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                payload = raw[:500]
            return exc.code, payload


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def emit(phase: str, payload: dict[str, Any]) -> None:
    print(json.dumps({"phase": phase, "at": now_iso(), **payload}, ensure_ascii=False), flush=True)


def envelope_data(label: str, status: int, payload: Any) -> Any:
    if not 200 <= status < 300:
        raise RuntimeError(f"{label} returned HTTP {status}: {payload}")
    if not isinstance(payload, dict) or not payload.get("success"):
        raise RuntimeError(f"{label} returned unsuccessful envelope: {payload}")
    return payload.get("data")


def fetch_auth_session(client: HttpClient) -> Any:
    if not BOOTSTRAP_TOKEN:
        raise RuntimeError("SOAK_BOOTSTRAP_TOKEN is required; legacy auth session bootstrap is removed.")
    status, payload = client.call(
        "POST",
        "/api/v1/auth/session/bootstrap",
        headers={"authorization": f"Bootstrap {BOOTSTRAP_TOKEN}"},
    )
    return envelope_data("auth_session_bootstrap", status, payload)


async def ws_bearer_probe(access_token: str, last_event_id: str | None) -> dict[str, Any]:
    params = {"access_token": access_token}
    if last_event_id:
        params["last_event_id"] = last_event_id
    uri = f"{WS_URL}?{urllib.parse.urlencode(params)}"
    async with websockets.connect(uri) as websocket:
        try:
            raw_message = await asyncio.wait_for(websocket.recv(), timeout=2)
        except asyncio.TimeoutError:
            return {"opened": True, "event_id": None, "event_type": None}
    payload = json.loads(raw_message)
    return {
        "opened": True,
        "event_id": payload.get("event_id"),
        "event_type": payload.get("event_type"),
        "snapshot_required": payload.get("snapshot_required"),
    }


def run_negative_http_probes(client: HttpClient, valid_token: str) -> list[dict[str, Any]]:
    probes = [
        (
            "settings_query_home_terminal_no_bearer",
            "GET",
            f"/api/v1/settings?home_id={HOME_ID}&terminal_id={TERMINAL_ID}",
            None,
            {},
        ),
        (
            "settings_legacy_headers_no_bearer",
            "GET",
            "/api/v1/settings",
            None,
            {"x-home-id": HOME_ID, "x-terminal-id": TERMINAL_ID},
        ),
        (
            "settings_query_access_token_no_authorization",
            "GET",
            f"/api/v1/settings?{urllib.parse.urlencode({'access_token': valid_token})}",
            None,
            {},
        ),
        (
            "pin_session_query_context_no_bearer",
            "GET",
            f"/api/v1/auth/pin/session?home_id={HOME_ID}&terminal_id={TERMINAL_ID}",
            None,
            {},
        ),
        (
            "device_control_result_legacy_context_no_bearer",
            "GET",
            f"/api/v1/device-controls/not-real?home_id={HOME_ID}",
            None,
            {},
        ),
    ]
    results: list[dict[str, Any]] = []
    for name, method, path, body, headers in probes:
        status, payload = client.call(method, path, body=body, headers=headers)
        error = payload.get("error") if isinstance(payload, dict) else None
        results.append(
            {
                "case": name,
                "status": status,
                "success": payload.get("success") if isinstance(payload, dict) else None,
                "error_code": error.get("code") if isinstance(error, dict) else None,
                "message": error.get("message") if isinstance(error, dict) else None,
            }
        )
    return results


async def one_round(client: HttpClient, index: int, last_event_id: str | None) -> tuple[dict[str, Any], str | None]:
    session = fetch_auth_session(client)
    access_token = session["access_token"]
    headers = {"authorization": f"Bearer {access_token}"}

    status, payload = client.call(
        "POST",
        "/api/v1/auth/pin/verify",
        body={
            "home_id": HOME_ID,
            "terminal_id": TERMINAL_ID,
            "pin": PIN,
            "target_action": "MANAGEMENT",
        },
    )
    pin_verify = envelope_data("pin_verify", status, payload)

    status, payload = client.call("GET", "/api/v1/system-connections", headers=headers)
    connections = envelope_data("system_connections", status, payload)
    ha_before = (connections.get("home_assistant") or {}) if isinstance(connections, dict) else {}

    status, payload = client.call(
        "POST",
        "/api/v1/system-connections/home-assistant/test",
        body={"use_saved_config": True},
        headers=headers,
    )
    ha_test = envelope_data("ha_saved_config_test", status, payload)

    status, payload = client.call(
        "POST",
        "/api/v1/devices/reload",
        body={"force_full_sync": True},
        headers=headers,
        timeout=45,
    )
    reload_result = envelope_data("devices_reload", status, payload)

    status, payload = client.call("GET", "/api/v1/devices?page=1&page_size=20", headers=headers)
    devices = envelope_data("devices", status, payload)

    status, payload = client.call("GET", "/api/v1/settings", headers=headers)
    settings = envelope_data("settings", status, payload)

    ws_result = await ws_bearer_probe(access_token, last_event_id)
    next_last_event_id = ws_result.get("event_id") or last_event_id

    status, payload = client.call("GET", "/observabilityz")
    observability = envelope_data("observabilityz", status, payload)

    result = {
        "round": index,
        "pin_session_active": pin_verify.get("pin_session_active"),
        "ha_status_before": ha_before.get("connection_status"),
        "ha_test_status": ha_test.get("connection_status"),
        "ha_test_latency_ms": ha_test.get("latency_ms"),
        "reload_status": reload_result.get("reload_status"),
        "reload_message": reload_result.get("message"),
        "device_count_page": len(devices.get("items") or []) if isinstance(devices, dict) else None,
        "settings_version": settings.get("settings_version") if isinstance(settings, dict) else None,
        "ws": ws_result,
        "observability": {
            "http": observability.get("http"),
            "legacy_context": observability.get("legacy_context"),
            "websocket": observability.get("websocket"),
        },
    }
    return result, next_last_event_id


async def main() -> None:
    client = HttpClient()
    started_monotonic = time.monotonic()
    emit(
        "window_started",
        {
            "api_base_url": API_BASE_URL,
            "ws_url": WS_URL,
            "home_id": HOME_ID,
            "terminal_id": TERMINAL_ID,
            "window_seconds": WINDOW_SECONDS,
            "interval_seconds": INTERVAL_SECONDS,
            "auth_session_bootstrap_mode": "bootstrap_token"
            if BOOTSTRAP_TOKEN
            else "missing",
            "controlled_negative_probes": CONTROLLED_NEGATIVE_PROBES,
        },
    )

    failures: list[dict[str, Any]] = []
    last_event_id = None
    round_index = 1
    negative_probe_results: list[dict[str, Any]] = []

    while True:
        try:
            result, last_event_id = await one_round(client, round_index, last_event_id)
            emit("round", {"result": result})
            if CONTROLLED_NEGATIVE_PROBES and round_index == 1:
                token = fetch_auth_session(client)["access_token"]
                negative_probe_results = run_negative_http_probes(client, token)
                emit("controlled_negative_probes", {"results": negative_probe_results})
        except Exception as exc:  # noqa: BLE001 - script reports all round failures.
            failure = {"round": round_index, "error": f"{type(exc).__name__}: {exc}"}
            failures.append(failure)
            emit("round_failure", failure)

        elapsed = time.monotonic() - started_monotonic
        if elapsed >= WINDOW_SECONDS:
            break
        time.sleep(min(INTERVAL_SECONDS, max(0, WINDOW_SECONDS - elapsed)))
        round_index += 1

    status, payload = client.call("GET", "/observabilityz")
    final_observability = envelope_data("observabilityz", status, payload)
    final_session = fetch_auth_session(client)
    status, payload = client.call(
        "GET",
        "/api/v1/system-connections",
        headers={"authorization": f"Bearer {final_session['access_token']}"},
    )
    final_connections = envelope_data("system_connections", status, payload)

    emit(
        "summary",
        {
            "rounds": round_index,
            "failures": failures,
            "controlled_negative_probes": negative_probe_results,
            "final_observability": final_observability,
            "final_connections": final_connections,
        },
    )
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    asyncio.run(main())
