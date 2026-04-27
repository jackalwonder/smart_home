from __future__ import annotations

import pytest

from src.app.health_routes import is_observability_client_allowed

_DEFAULT_CIDRS = "127.0.0.1/32,::1/128,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16"


def test_allows_localhost_ipv4():
    assert is_observability_client_allowed("127.0.0.1", _DEFAULT_CIDRS) is True


def test_allows_localhost_ipv6():
    assert is_observability_client_allowed("::1", _DEFAULT_CIDRS) is True


def test_allows_private_10_network():
    assert is_observability_client_allowed("10.0.0.1", _DEFAULT_CIDRS) is True


def test_allows_private_172_network():
    assert is_observability_client_allowed("172.16.0.1", _DEFAULT_CIDRS) is True


def test_allows_private_192_network():
    assert is_observability_client_allowed("192.168.1.1", _DEFAULT_CIDRS) is True


def test_rejects_public_ip():
    assert is_observability_client_allowed("8.8.8.8", _DEFAULT_CIDRS) is False


def test_rejects_non_ip_testclient():
    assert is_observability_client_allowed("testclient", _DEFAULT_CIDRS) is False


def test_rejects_none_host():
    assert is_observability_client_allowed(None, _DEFAULT_CIDRS) is False


@pytest.mark.parametrize(
    "host,expected",
    [
        ("10.128.0.1", True),
        ("10.255.255.255", True),
        ("172.31.255.255", True),
        ("192.168.0.1", True),
        ("1.1.1.1", False),
        ("203.0.113.1", False),
    ],
)
def test_cidr_boundary_cases(host, expected):
    assert is_observability_client_allowed(host, _DEFAULT_CIDRS) is expected
