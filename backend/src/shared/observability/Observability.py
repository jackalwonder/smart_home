from __future__ import annotations

import json
import logging
import sys
from collections import Counter
from datetime import datetime, timezone
from threading import Lock
from typing import Any, Mapping


logger = logging.getLogger("smart_home.observability")
if not logger.handlers:
    _handler = logging.StreamHandler(sys.stdout)
    _handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(_handler)
logger.setLevel(logging.INFO)
logger.propagate = False

HTTP_QUERY_LEGACY_FIELDS = {
    "home_id",
    "terminal_id",
    "token",
    "session_token",
    "access_token",
}
HTTP_HEADER_LEGACY_FIELDS = {
    "x-home-id",
    "x-terminal-id",
}
HTTP_COOKIE_LEGACY_FIELDS = {
    "home_id",
    "terminal_id",
    "pin_session_token",
    "session_token",
    "access_token",
}
WS_QUERY_LEGACY_FIELDS = {
    "home_id",
    "terminal_id",
    "token",
}
WS_HEADER_LEGACY_FIELDS = HTTP_HEADER_LEGACY_FIELDS
WS_COOKIE_LEGACY_FIELDS = {
    "home_id",
    "terminal_id",
    "pin_session_token",
    "session_token",
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalize_headers(headers: Mapping[str, str]) -> dict[str, str]:
    return {key.lower(): value for key, value in headers.items()}


def _collect_fields(
    *,
    query_params: Mapping[str, str],
    headers: Mapping[str, str],
    cookies: Mapping[str, str],
    query_fields: set[str],
    header_fields: set[str],
    cookie_fields: set[str],
) -> list[str]:
    normalized_headers = _normalize_headers(headers)
    fields: list[str] = []
    for field in sorted(query_fields):
        if query_params.get(field):
            fields.append(f"query.{field}")
    for field in sorted(header_fields):
        if normalized_headers.get(field):
            fields.append(f"header.{field}")
    for field in sorted(cookie_fields):
        if cookies.get(field):
            fields.append(f"cookie.{field}")
    return fields


def collect_http_legacy_context_fields(
    *,
    query_params: Mapping[str, str],
    headers: Mapping[str, str],
    cookies: Mapping[str, str],
) -> list[str]:
    return _collect_fields(
        query_params=query_params,
        headers=headers,
        cookies=cookies,
        query_fields=HTTP_QUERY_LEGACY_FIELDS,
        header_fields=HTTP_HEADER_LEGACY_FIELDS,
        cookie_fields=HTTP_COOKIE_LEGACY_FIELDS,
    )


def collect_ws_legacy_context_fields(
    *,
    query_params: Mapping[str, str],
    headers: Mapping[str, str],
    cookies: Mapping[str, str],
) -> list[str]:
    return _collect_fields(
        query_params=query_params,
        headers=headers,
        cookies=cookies,
        query_fields=WS_QUERY_LEGACY_FIELDS,
        header_fields=WS_HEADER_LEGACY_FIELDS,
        cookie_fields=WS_COOKIE_LEGACY_FIELDS,
    )


def log_structured_event(event_name: str, payload: Mapping[str, Any]) -> None:
    logger.info(
        json.dumps(
            {
                "timestamp": _now_iso(),
                "event": event_name,
                **payload,
            },
            ensure_ascii=False,
            sort_keys=True,
            default=str,
        )
    )


class ObservabilityMetrics:
    def __init__(self) -> None:
        self._lock = Lock()
        self.reset()

    def reset(self) -> None:
        with self._lock:
            self._http_requests = 0
            self._http_status_counts: Counter[str] = Counter()
            self._http_auth_mode_counts: Counter[str] = Counter()
            self._legacy_context_field_counts: Counter[str] = Counter()
            self._runtime_legacy_context_field_counts: Counter[str] = Counter()
            self._runtime_accepted_legacy_requests = 0
            self._runtime_rejected_legacy_requests = 0
            self._auth_session_bootstrap_requests = 0
            self._auth_session_bootstrap_status_counts: Counter[str] = Counter()
            self._auth_session_bootstrap_auth_mode_counts: Counter[str] = Counter()
            self._auth_session_bootstrap_legacy_requests = 0
            self._auth_session_bootstrap_legacy_context_field_counts: Counter[str] = Counter()
            self._terminal_pairing_requests = 0
            self._terminal_pairing_status_counts: Counter[str] = Counter()
            self._terminal_pairing_auth_mode_counts: Counter[str] = Counter()
            self._terminal_pairing_legacy_context_field_counts: Counter[str] = Counter()
            self._terminal_pairing_event_counts: Counter[str] = Counter()
            self._ws_connections = 0
            self._ws_auth_mode_counts: Counter[str] = Counter()
            self._ws_rejections = 0
            self._ws_rejection_reason_counts: Counter[str] = Counter()
            self._ws_rejected_legacy_context_field_counts: Counter[str] = Counter()
            self._ws_resume_counts: Counter[str] = Counter()
            self._ws_events_sent = 0
            self._ws_snapshot_required_events = 0
            self._ws_ack_counts: Counter[str] = Counter()

    def record_http_request(
        self,
        *,
        status_code: int,
        auth_mode: str | None,
        legacy_context_fields: list[str],
        scope: str = "runtime",
    ) -> None:
        with self._lock:
            self._http_requests += 1
            self._http_status_counts[str(status_code)] += 1
            self._http_auth_mode_counts[auth_mode or "unresolved"] += 1
            self._legacy_context_field_counts.update(legacy_context_fields)
            if scope == "auth_session_bootstrap":
                self._auth_session_bootstrap_requests += 1
                self._auth_session_bootstrap_status_counts[str(status_code)] += 1
                self._auth_session_bootstrap_auth_mode_counts[auth_mode or "unresolved"] += 1
                if auth_mode in {"legacy_context", "legacy_pin_session"}:
                    self._auth_session_bootstrap_legacy_requests += 1
                    self._auth_session_bootstrap_legacy_context_field_counts.update(
                        legacy_context_fields
                    )
                return
            if scope == "terminal_pairing":
                self._terminal_pairing_requests += 1
                self._terminal_pairing_status_counts[str(status_code)] += 1
                self._terminal_pairing_auth_mode_counts[auth_mode or "unresolved"] += 1
                self._terminal_pairing_legacy_context_field_counts.update(legacy_context_fields)
                return
            self._runtime_legacy_context_field_counts.update(legacy_context_fields)
            if auth_mode in {"legacy_context", "legacy_pin_session"}:
                if status_code < 400:
                    self._runtime_accepted_legacy_requests += 1
            if legacy_context_fields and status_code >= 400:
                self._runtime_rejected_legacy_requests += 1

    def record_terminal_pairing_event(self, result: str) -> None:
        with self._lock:
            self._terminal_pairing_event_counts[result] += 1

    def record_ws_connection(
        self,
        *,
        auth_mode: str | None,
        legacy_context_fields: list[str],
        has_last_event_id: bool,
    ) -> None:
        with self._lock:
            self._ws_connections += 1
            self._ws_auth_mode_counts[auth_mode or "unresolved"] += 1
            self._legacy_context_field_counts.update(legacy_context_fields)
            if has_last_event_id:
                self._ws_resume_counts["connect_with_last_event_id"] += 1

    def record_ws_rejection(
        self,
        *,
        reason: str,
        legacy_context_fields: list[str],
    ) -> None:
        with self._lock:
            self._ws_rejections += 1
            self._ws_rejection_reason_counts[reason] += 1
            self._ws_rejected_legacy_context_field_counts.update(legacy_context_fields)
            self._legacy_context_field_counts.update(legacy_context_fields)

    def record_ws_resume(self, result: str) -> None:
        with self._lock:
            self._ws_resume_counts[result] += 1

    def record_ws_event_sent(self, *, snapshot_required: bool) -> None:
        with self._lock:
            self._ws_events_sent += 1
            if snapshot_required:
                self._ws_snapshot_required_events += 1

    def record_ws_ack(self, status: str) -> None:
        with self._lock:
            self._ws_ack_counts[status] += 1

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            return {
                "http": {
                    "requests_total": self._http_requests,
                    "status_counts": dict(self._http_status_counts),
                    "auth_mode_counts": dict(self._http_auth_mode_counts),
                },
                "legacy_context": {
                    "field_counts": dict(self._runtime_legacy_context_field_counts),
                    "all_field_counts": dict(self._legacy_context_field_counts),
                    "runtime_accepted_requests_total": self._runtime_accepted_legacy_requests,
                    "runtime_rejected_requests_total": self._runtime_rejected_legacy_requests,
                },
                "auth_session_bootstrap": {
                    "requests_total": self._auth_session_bootstrap_requests,
                    "status_counts": dict(self._auth_session_bootstrap_status_counts),
                    "auth_mode_counts": dict(self._auth_session_bootstrap_auth_mode_counts),
                    "legacy_requests_total": self._auth_session_bootstrap_legacy_requests,
                    "legacy_context_field_counts": dict(
                        self._auth_session_bootstrap_legacy_context_field_counts
                    ),
                },
                "terminal_pairing": {
                    "requests_total": self._terminal_pairing_requests,
                    "status_counts": dict(self._terminal_pairing_status_counts),
                    "auth_mode_counts": dict(self._terminal_pairing_auth_mode_counts),
                    "legacy_context_field_counts": dict(
                        self._terminal_pairing_legacy_context_field_counts
                    ),
                    "event_counts": dict(self._terminal_pairing_event_counts),
                },
                "websocket": {
                    "connections_total": self._ws_connections,
                    "auth_mode_counts": dict(self._ws_auth_mode_counts),
                    "rejected_total": self._ws_rejections,
                    "rejected_reason_counts": dict(self._ws_rejection_reason_counts),
                    "rejected_legacy_context_field_counts": dict(
                        self._ws_rejected_legacy_context_field_counts
                    ),
                    "resume_counts": dict(self._ws_resume_counts),
                    "events_sent_total": self._ws_events_sent,
                    "snapshot_required_events_total": self._ws_snapshot_required_events,
                    "ack_counts": dict(self._ws_ack_counts),
                },
            }


_metrics = ObservabilityMetrics()


def get_observability_metrics() -> ObservabilityMetrics:
    return _metrics
