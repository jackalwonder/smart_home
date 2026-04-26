from __future__ import annotations

import http.cookiejar
import json
import os
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Any


API_BASE_URL = os.getenv("SOAK_API_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
HOME_ID = os.getenv("SOAK_HOME_ID", "11111111-1111-1111-1111-111111111111")
MANAGEMENT_TERMINAL_ID = os.getenv(
    "SOAK_MANAGEMENT_TERMINAL_ID",
    os.getenv("SOAK_TERMINAL_ID", "22222222-2222-2222-2222-222222222222"),
)
PAIRING_TERMINAL_ID = os.getenv(
    "SOAK_PAIRING_TERMINAL_ID",
    "33333333-3333-3333-3333-333333333333",
)
PIN = os.getenv("SOAK_PIN", "1234")
MANAGEMENT_BOOTSTRAP_TOKEN = (
    os.getenv("SOAK_MANAGEMENT_BOOTSTRAP_TOKEN")
    or os.getenv("SOAK_BOOTSTRAP_TOKEN")
    or ""
).strip()
WINDOW_SECONDS = int(os.getenv("SOAK_WINDOW_SECONDS", "1800"))
ROUND_INTERVAL_SECONDS = int(os.getenv("SOAK_INTERVAL_SECONDS", "60"))
POLL_INTERVAL_SECONDS = float(os.getenv("SOAK_PAIRING_POLL_INTERVAL_SECONDS", "3"))
DELIVERY_TIMEOUT_SECONDS = int(os.getenv("SOAK_PAIRING_DELIVERY_TIMEOUT_SECONDS", "30"))
PRECLAIM_POLLS = int(os.getenv("SOAK_PAIRING_PRECLAIM_POLLS", "2"))
ENFORCE_LEGACY_ZERO = os.getenv("SOAK_ENFORCE_LEGACY_ZERO", "1") != "0"


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
    ) -> tuple[int, Any, float]:
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
        started = time.perf_counter()
        try:
            with self._opener.open(request, timeout=timeout) as response:
                raw = response.read().decode("utf-8")
                return (
                    response.status,
                    json.loads(raw) if raw else None,
                    round((time.perf_counter() - started) * 1000, 2),
                )
        except urllib.error.HTTPError as exc:
            raw = exc.read().decode("utf-8", errors="replace")
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                payload = raw[:500]
            return exc.code, payload, round((time.perf_counter() - started) * 1000, 2)


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


def exchange_bootstrap_token(client: HttpClient, token: str, label: str) -> dict[str, Any]:
    status, payload, _latency_ms = client.call(
        "POST",
        "/api/v1/auth/session/bootstrap",
        headers={"authorization": f"Bootstrap {token}"},
    )
    return envelope_data(label, status, payload)


def verify_management_pin(client: HttpClient) -> dict[str, Any]:
    status, payload, _latency_ms = client.call(
        "POST",
        "/api/v1/auth/pin/verify",
        body={
            "home_id": HOME_ID,
            "terminal_id": MANAGEMENT_TERMINAL_ID,
            "pin": PIN,
            "target_action": "MANAGEMENT",
        },
    )
    return envelope_data("pin_verify", status, payload)


def issue_pairing_session(client: HttpClient) -> tuple[dict[str, Any], float]:
    status, payload, latency_ms = client.call(
        "POST",
        f"/api/v1/terminals/{PAIRING_TERMINAL_ID}/pairing-code-sessions",
    )
    return envelope_data("pairing_issue", status, payload), latency_ms


def poll_pairing_session(
    client: HttpClient,
    pairing_id: str,
) -> tuple[dict[str, Any], float]:
    status, payload, latency_ms = client.call(
        "GET",
        f"/api/v1/terminals/{PAIRING_TERMINAL_ID}/pairing-code-sessions/{pairing_id}",
    )
    return envelope_data("pairing_poll", status, payload), latency_ms


def claim_pairing_code(
    client: HttpClient,
    access_token: str,
    pairing_code: str,
) -> tuple[dict[str, Any], float]:
    status, payload, latency_ms = client.call(
        "POST",
        "/api/v1/terminals/pairing-code-claims",
        body={"pairing_code": pairing_code},
        headers={"authorization": f"Bearer {access_token}"},
    )
    return envelope_data("pairing_claim", status, payload), latency_ms


def fetch_observability(client: HttpClient) -> dict[str, Any]:
    status, payload, _latency_ms = client.call("GET", "/observabilityz")
    return envelope_data("observabilityz", status, payload)


def assert_legacy_zero(observability: dict[str, Any]) -> None:
    if not ENFORCE_LEGACY_ZERO:
        return
    legacy_context = observability.get("legacy_context") or {}
    auth_bootstrap = observability.get("auth_session_bootstrap") or {}
    runtime_accepted = legacy_context.get("runtime_accepted_requests_total")
    legacy_bootstrap = auth_bootstrap.get("legacy_requests_total")
    if runtime_accepted != 0 or legacy_bootstrap != 0:
        raise RuntimeError(
            "legacy counters are not zero: "
            f"runtime_accepted={runtime_accepted}, legacy_bootstrap={legacy_bootstrap}"
        )


def wait_for_delivery(
    client: HttpClient,
    pairing_id: str,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    polls: list[dict[str, Any]] = []
    deadline = time.monotonic() + DELIVERY_TIMEOUT_SECONDS
    while time.monotonic() <= deadline:
        poll, latency_ms = poll_pairing_session(client, pairing_id)
        polls.append(
            {
                "status": poll.get("status"),
                "latency_ms": latency_ms,
                "has_bootstrap_token": bool(poll.get("bootstrap_token")),
            }
        )
        if poll.get("bootstrap_token"):
            return poll, polls
        if poll.get("status") in {"EXPIRED", "INVALIDATED", "COMPLETED"}:
            raise RuntimeError(f"pairing stopped before delivery: {poll}")
        time.sleep(POLL_INTERVAL_SECONDS)
    raise RuntimeError(f"pairing delivery timed out after {DELIVERY_TIMEOUT_SECONDS}s: {polls}")


def one_round(round_index: int) -> dict[str, Any]:
    management_client = HttpClient()
    terminal_client = HttpClient()

    if not MANAGEMENT_BOOTSTRAP_TOKEN:
        raise RuntimeError(
            "SOAK_MANAGEMENT_BOOTSTRAP_TOKEN or SOAK_BOOTSTRAP_TOKEN is required "
            "for management-side claim."
        )

    management_session = exchange_bootstrap_token(
        management_client,
        MANAGEMENT_BOOTSTRAP_TOKEN,
        "management_auth_session_bootstrap",
    )
    access_token = management_session["access_token"]
    pin_status = verify_management_pin(management_client)

    issued, issue_latency_ms = issue_pairing_session(terminal_client)
    preclaim_polls: list[dict[str, Any]] = []
    for _index in range(max(0, PRECLAIM_POLLS)):
        poll, latency_ms = poll_pairing_session(terminal_client, issued["pairing_id"])
        preclaim_polls.append({"status": poll.get("status"), "latency_ms": latency_ms})
        if poll.get("status") != "PENDING":
            raise RuntimeError(f"expected PENDING before claim, got {poll}")
        time.sleep(POLL_INTERVAL_SECONDS)

    claimed, claim_latency_ms = claim_pairing_code(
        management_client,
        access_token,
        issued["pairing_code"],
    )
    delivered, delivery_polls = wait_for_delivery(terminal_client, issued["pairing_id"])
    terminal_session = exchange_bootstrap_token(
        terminal_client,
        delivered["bootstrap_token"],
        "delivered_bootstrap_exchange",
    )
    completed, completed_latency_ms = poll_pairing_session(terminal_client, issued["pairing_id"])
    if completed.get("bootstrap_token"):
        raise RuntimeError("completed pairing poll returned bootstrap token again")

    observability = fetch_observability(management_client)
    assert_legacy_zero(observability)

    return {
        "round": round_index,
        "pairing_id": issued["pairing_id"],
        "terminal_id": issued["terminal_id"],
        "terminal_code": issued["terminal_code"],
        "pin_session_active": pin_status.get("pin_session_active"),
        "issue_latency_ms": issue_latency_ms,
        "claim_latency_ms": claim_latency_ms,
        "preclaim_polls": preclaim_polls,
        "delivery_polls": delivery_polls,
        "delivery_poll_count": len(delivery_polls),
        "delivered_status": delivered.get("status"),
        "completed_status": completed.get("status"),
        "completed_latency_ms": completed_latency_ms,
        "terminal_session_scope": terminal_session.get("scope"),
        "terminal_session_token_type": terminal_session.get("token_type"),
        "claim_rotated": claimed.get("rotated"),
        "observability": {
            "legacy_context": observability.get("legacy_context"),
            "auth_session_bootstrap": observability.get("auth_session_bootstrap"),
            "terminal_pairing": observability.get("terminal_pairing"),
        },
    }


def main() -> None:
    started_monotonic = time.monotonic()
    emit(
        "window_started",
        {
            "api_base_url": API_BASE_URL,
            "home_id": HOME_ID,
            "management_terminal_id": MANAGEMENT_TERMINAL_ID,
            "pairing_terminal_id": PAIRING_TERMINAL_ID,
            "window_seconds": WINDOW_SECONDS,
            "round_interval_seconds": ROUND_INTERVAL_SECONDS,
            "poll_interval_seconds": POLL_INTERVAL_SECONDS,
            "delivery_timeout_seconds": DELIVERY_TIMEOUT_SECONDS,
            "preclaim_polls": PRECLAIM_POLLS,
            "enforce_legacy_zero": ENFORCE_LEGACY_ZERO,
            "management_auth_mode": "bootstrap_token" if MANAGEMENT_BOOTSTRAP_TOKEN else "missing",
        },
    )

    failures: list[dict[str, Any]] = []
    round_index = 1
    while True:
        try:
            emit("round", {"result": one_round(round_index)})
        except Exception as exc:  # noqa: BLE001 - soak reports all round failures.
            failure = {"round": round_index, "error": f"{type(exc).__name__}: {exc}"}
            failures.append(failure)
            emit("round_failure", failure)

        elapsed = time.monotonic() - started_monotonic
        if elapsed >= WINDOW_SECONDS:
            break
        time.sleep(min(ROUND_INTERVAL_SECONDS, max(0, WINDOW_SECONDS - elapsed)))
        round_index += 1

    final_observability = fetch_observability(HttpClient())
    emit(
        "summary",
        {
            "rounds": round_index,
            "failures": failures,
            "final_observability": {
                "legacy_context": final_observability.get("legacy_context"),
                "auth_session_bootstrap": final_observability.get("auth_session_bootstrap"),
                "terminal_pairing": final_observability.get("terminal_pairing"),
            },
        },
    )
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
