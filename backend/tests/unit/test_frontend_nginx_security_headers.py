from __future__ import annotations

from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
NGINX_CONF = REPO_ROOT / "frontend" / "nginx.conf"


def test_frontend_nginx_enforces_csp_without_report_only() -> None:
    config = NGINX_CONF.read_text(encoding="utf-8")

    assert "Content-Security-Policy-Report-Only" not in config
    assert 'add_header Content-Security-Policy "' in config
    assert "default-src 'self'" in config
    assert "frame-ancestors 'none'" in config
    assert "object-src 'none'" in config
    assert "connect-src 'self' ws: wss:" in config
    assert "img-src 'self' data: blob:" in config
    assert "style-src 'self' 'unsafe-inline'" in config


def test_frontend_nginx_keeps_hsts_at_tls_termination_layer() -> None:
    config = NGINX_CONF.read_text(encoding="utf-8")

    active_lines = [
        line.strip()
        for line in config.splitlines()
        if line.strip() and not line.strip().startswith("#")
    ]

    assert not any("Strict-Transport-Security" in line for line in active_lines)
    assert "Strict-Transport-Security belongs at the real HTTPS/TLS termination layer." in config
