from __future__ import annotations

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
import src.main as main_module


class _NoopDatabase:
    async def check(self) -> None:
        return None

    async def dispose(self) -> None:
        return None


@pytest.fixture
def app(monkeypatch):
    monkeypatch.setattr(main_module, "get_database", lambda: _NoopDatabase())
    app = main_module.create_app()
    app.dependency_overrides = {}
    yield app
    app.dependency_overrides = {}


@pytest.fixture
def client(app):
    with TestClient(app) as test_client:
        yield test_client
