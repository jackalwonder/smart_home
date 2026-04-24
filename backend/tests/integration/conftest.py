from __future__ import annotations

import sys
from pathlib import Path
import os

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
os.environ["CONNECTION_ENCRYPTION_SECRET"] = "test-connection-secret-value-000001"
os.environ["ACCESS_TOKEN_SECRET"] = "test-access-token-secret-value-000001"
os.environ["BOOTSTRAP_TOKEN_SECRET"] = "test-bootstrap-token-secret-value-0001"
import src.main as main_module
from src.shared.observability import get_observability_metrics


class _NoopDatabase:
    async def check(self) -> None:
        return None

    async def dispose(self) -> None:
        return None


@pytest.fixture
def app(monkeypatch):
    get_observability_metrics().reset()
    monkeypatch.setattr(main_module, "get_database", lambda: _NoopDatabase())
    app = main_module.create_app()
    app.dependency_overrides = {}
    yield app
    app.dependency_overrides = {}
    get_observability_metrics().reset()


@pytest.fixture
def client(app):
    with TestClient(app) as test_client:
        yield test_client
