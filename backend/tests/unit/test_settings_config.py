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

    with pytest.raises(ValidationError) as exc_info:
        Settings(_env_file=None, app_env="docker")

    message = str(exc_info.value)
    assert "CONNECTION_ENCRYPTION_SECRET" in message
    assert "ACCESS_TOKEN_SECRET" in message
    assert "BOOTSTRAP_TOKEN_SECRET" in message


@pytest.mark.parametrize(
    ("field_name", "env_name", "unsafe_value"),
    [
        (
            "connection_encryption_secret",
            "CONNECTION_ENCRYPTION_SECRET",
            "change-this-to-a-strong-random-secret-at-least-32-chars",
        ),
        (
            "access_token_secret",
            "ACCESS_TOKEN_SECRET",
            "short-secret",
        ),
        (
            "bootstrap_token_secret",
            "BOOTSTRAP_TOKEN_SECRET",
            "change-this-bootstrap-token-secret",
        ),
    ],
)
def test_non_local_settings_reject_placeholder_or_short_secret_values(
    field_name,
    env_name,
    unsafe_value,
):
    values = {
        "connection_encryption_secret": "c" * 32,
        "access_token_secret": "a" * 32,
        "bootstrap_token_secret": "b" * 32,
    }
    values[field_name] = unsafe_value

    with pytest.raises(ValidationError) as exc_info:
        Settings(_env_file=None, app_env="production", **values)

    assert env_name in str(exc_info.value)


def test_non_local_settings_require_strong_explicit_secrets():
    settings = Settings(
        _env_file=None,
        app_env="docker",
        connection_encryption_secret="c" * 32,
        access_token_secret="a" * 32,
        bootstrap_token_secret="b" * 32,
    )

    assert settings.app_env == "docker"


def test_dev_activation_bypass_is_allowed_for_local_docker_with_strong_secrets():
    settings = Settings(
        _env_file=None,
        app_env="docker",
        connection_encryption_secret="c" * 32,
        access_token_secret="a" * 32,
        bootstrap_token_secret="b" * 32,
        dev_bypass_terminal_activation=True,
    )

    assert settings.dev_bypass_terminal_activation is True


def test_dev_activation_bypass_is_rejected_for_production():
    with pytest.raises(ValidationError) as exc_info:
        Settings(
            _env_file=None,
            app_env="production",
            connection_encryption_secret="c" * 32,
            access_token_secret="a" * 32,
            bootstrap_token_secret="b" * 32,
            dev_bypass_terminal_activation=True,
        )

    assert "DEV_BYPASS_TERMINAL_ACTIVATION" in str(exc_info.value)
