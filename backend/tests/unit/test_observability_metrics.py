from __future__ import annotations

from src.shared.observability import ObservabilityMetrics


def test_auth_session_bootstrap_rejected_old_context_is_not_accepted_legacy():
    metrics = ObservabilityMetrics()

    metrics.record_http_request(
        status_code=401,
        auth_mode=None,
        legacy_context_fields=["query.home_id", "header.x-terminal-id"],
        scope="auth_session_bootstrap",
    )

    snapshot = metrics.snapshot()
    assert snapshot["auth_session_bootstrap"]["requests_total"] == 1
    assert snapshot["auth_session_bootstrap"]["status_counts"]["401"] == 1
    assert snapshot["auth_session_bootstrap"]["auth_mode_counts"]["unresolved"] == 1
    assert snapshot["auth_session_bootstrap"]["legacy_requests_total"] == 0
    assert snapshot["auth_session_bootstrap"]["legacy_context_field_counts"] == {}
    assert snapshot["legacy_context"]["field_counts"] == {}
    assert snapshot["legacy_context"]["runtime_accepted_requests_total"] == 0
    assert snapshot["legacy_context"]["all_field_counts"] == {
        "query.home_id": 1,
        "header.x-terminal-id": 1,
    }


def test_runtime_old_context_rejection_counts_unresolved_401_attempts():
    metrics = ObservabilityMetrics()

    metrics.record_http_request(
        status_code=401,
        auth_mode=None,
        legacy_context_fields=["query.home_id", "query.terminal_id"],
        scope="runtime",
    )

    snapshot = metrics.snapshot()
    assert snapshot["legacy_context"]["field_counts"] == {
        "query.home_id": 1,
        "query.terminal_id": 1,
    }
    assert snapshot["legacy_context"]["runtime_accepted_requests_total"] == 0
    assert snapshot["legacy_context"]["runtime_rejected_requests_total"] == 1
    assert snapshot["auth_session_bootstrap"]["requests_total"] == 0
