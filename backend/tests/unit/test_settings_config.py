from __future__ import annotations

import pytest
from pydantic import ValidationError

from src.shared.config.Settings import Settings


def test_local_settings_allow_development_defaults(monkeypatch):
    monkeypatch.delenv("CONNECTION_ENCRYPTION_SECRET", raising=False)
    monkeypatch.delenv("ACCESS_TOKEN_SECRET", raising=False)
    monkeypatch.delenv("BOOTSTRAP_TOKEN_SECRET", raising=False)

    settings = Settings(_env_file=None, app_env="local")

    assert settings.access_token_secret == "smart-home-local-access-token-secret"


def test_non_local_settings_reject_default_secret_values(monkeypatch):
    monkeypatch.delenv("CONNECTION_ENCRYPTION_SECRET", raising=False)
    monkeypatch.delenv("ACCESS_TOKEN_SECRET", raising=False)
    monkeypatch.delenv("BOOTSTRAP_TOKEN_SECRET", raising=False)

    with pytest.raises(ValidationError):
        Settings(_env_file=None, app_env="docker")


def test_non_local_settings_require_strong_explicit_secrets():
    settings = Settings(
        _env_file=None,
        app_env="docker",
        connection_encryption_secret="c" * 32,
        access_token_secret="a" * 32,
        bootstrap_token_secret="b" * 32,
    )

    assert settings.app_env == "docker"
