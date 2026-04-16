from __future__ import annotations

import base64
import hashlib
import hmac
import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4


@dataclass(frozen=True)
class AccessTokenClaims:
    home_id: str
    terminal_id: str
    operator_id: str | None = None
    raw_token: str | None = None
    role: str | None = None
    scope: tuple[str, ...] = ()
    jti: str | None = None
    expires_at: datetime | None = None


class AccessTokenError(Exception):
    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _b64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(f"{value}{padding}".encode("ascii"))


def _json_b64url(data: dict[str, Any]) -> str:
    return _b64url_encode(
        json.dumps(data, sort_keys=True, separators=(",", ":")).encode("utf-8")
    )


def _as_string(value: Any, field_name: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise AccessTokenError(f"{field_name} is required")
    return value


def _as_scope(value: Any) -> tuple[str, ...]:
    if isinstance(value, str):
        return (value,)
    if isinstance(value, list) and all(isinstance(item, str) for item in value):
        return tuple(value)
    raise AccessTokenError("scope is required")


class AccessTokenResolver:
    def issue(
        self,
        *,
        home_id: str,
        terminal_id: str,
        operator_id: str | None = None,
        role: str = "HOME_OWNER",
        scope: tuple[str, ...] = ("api", "ws"),
        subject: str | None = None,
        now: datetime | None = None,
    ) -> str:
        raise NotImplementedError

    def resolve(
        self,
        token: str,
        *,
        required_scope: str | None = None,
    ) -> AccessTokenClaims | None:
        return None


class NoopAccessTokenResolver(AccessTokenResolver):
    pass


class JwtAccessTokenResolver(AccessTokenResolver):
    def __init__(
        self,
        *,
        secret: str,
        issuer: str,
        audience: str,
        ttl_seconds: int,
        leeway_seconds: int = 0,
    ) -> None:
        normalized_secret = secret.strip()
        if not normalized_secret:
            raise ValueError("access token secret must not be empty")
        self._secret = normalized_secret.encode("utf-8")
        self._issuer = issuer
        self._audience = audience
        self._ttl_seconds = ttl_seconds
        self._leeway_seconds = leeway_seconds

    def issue(
        self,
        *,
        home_id: str,
        terminal_id: str,
        operator_id: str | None = None,
        role: str = "HOME_OWNER",
        scope: tuple[str, ...] = ("api", "ws"),
        subject: str | None = None,
        now: datetime | None = None,
    ) -> str:
        issued_at = now or _utc_now()
        expires_at = issued_at + timedelta(seconds=self._ttl_seconds)
        payload: dict[str, Any] = {
            "iss": self._issuer,
            "aud": self._audience,
            "sub": subject or operator_id or home_id,
            "home_id": home_id,
            "terminal_id": terminal_id,
            "role": role,
            "scope": list(scope),
            "token_use": "access",
            "jti": str(uuid4()),
            "iat": int(issued_at.timestamp()),
            "exp": int(expires_at.timestamp()),
        }
        if operator_id is not None:
            payload["operator_id"] = operator_id
        header = _json_b64url({"alg": "HS256", "typ": "JWT"})
        body = _json_b64url(payload)
        signature = self._sign(f"{header}.{body}")
        return f"{header}.{body}.{signature}"

    def resolve(
        self,
        token: str,
        *,
        required_scope: str | None = None,
    ) -> AccessTokenClaims | None:
        if token.count(".") != 2:
            return None
        header_segment, payload_segment, signature_segment = token.split(".", 2)
        signing_input = f"{header_segment}.{payload_segment}"
        expected_signature = self._sign(signing_input)
        if not hmac.compare_digest(signature_segment, expected_signature):
            raise AccessTokenError("invalid token signature")
        try:
            header = json.loads(_b64url_decode(header_segment).decode("utf-8"))
            payload = json.loads(_b64url_decode(payload_segment).decode("utf-8"))
        except Exception as exc:
            raise AccessTokenError("invalid token encoding") from exc
        if header.get("alg") != "HS256":
            raise AccessTokenError("unsupported token algorithm")
        if payload.get("iss") != self._issuer:
            raise AccessTokenError("invalid token issuer")
        if payload.get("aud") != self._audience:
            raise AccessTokenError("invalid token audience")
        if payload.get("token_use") != "access":
            raise AccessTokenError("invalid token use")
        expires_at = self._decode_expires_at(payload.get("exp"))
        if expires_at <= _utc_now() - timedelta(seconds=self._leeway_seconds):
            raise AccessTokenError("access token expired")
        scope = _as_scope(payload.get("scope"))
        if required_scope is not None and required_scope not in scope:
            raise AccessTokenError("required token scope is missing")
        home_id = _as_string(payload.get("home_id"), "home_id")
        terminal_id = _as_string(payload.get("terminal_id"), "terminal_id")
        operator_id = payload.get("operator_id")
        if operator_id is None:
            operator_id = payload.get("member_id")
        if operator_id is not None and not isinstance(operator_id, str):
            raise AccessTokenError("operator_id must be a string")
        role = payload.get("role")
        if role is not None and not isinstance(role, str):
            raise AccessTokenError("role must be a string")
        jti = payload.get("jti")
        if jti is not None and not isinstance(jti, str):
            raise AccessTokenError("jti must be a string")
        return AccessTokenClaims(
            home_id=home_id,
            terminal_id=terminal_id,
            operator_id=operator_id,
            raw_token=token,
            role=role,
            scope=scope,
            jti=jti,
            expires_at=expires_at,
        )

    def _sign(self, signing_input: str) -> str:
        return _b64url_encode(
            hmac.new(
                self._secret,
                signing_input.encode("ascii"),
                hashlib.sha256,
            ).digest()
        )

    def _decode_expires_at(self, value: Any) -> datetime:
        if not isinstance(value, int | float):
            raise AccessTokenError("exp is required")
        return datetime.fromtimestamp(value, timezone.utc)
