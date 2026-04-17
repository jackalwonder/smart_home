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
class BootstrapTokenClaims:
    home_id: str
    terminal_id: str
    terminal_mode: str
    scope: tuple[str, ...]
    jti: str
    expires_at: datetime


class BootstrapTokenError(Exception):
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
        raise BootstrapTokenError(f"{field_name} is required")
    return value


def _as_scope(value: Any) -> tuple[str, ...]:
    if isinstance(value, str):
        return (value,)
    if isinstance(value, list) and all(isinstance(item, str) for item in value):
        return tuple(value)
    raise BootstrapTokenError("scope is required")


class BootstrapTokenResolver:
    def issue(
        self,
        *,
        home_id: str,
        terminal_id: str,
        terminal_mode: str,
        scope: tuple[str, ...] = ("bootstrap:session",),
        subject: str | None = None,
        now: datetime | None = None,
    ) -> str:
        raise NotImplementedError

    def resolve(
        self,
        token: str,
        *,
        required_scope: str | None = None,
    ) -> BootstrapTokenClaims | None:
        return None

    def hash_token(self, token: str) -> str:
        return hashlib.sha256(token.encode("utf-8")).hexdigest()


class JwtBootstrapTokenResolver(BootstrapTokenResolver):
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
            raise ValueError("bootstrap token secret must not be empty")
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
        terminal_mode: str,
        scope: tuple[str, ...] = ("bootstrap:session",),
        subject: str | None = None,
        now: datetime | None = None,
    ) -> str:
        issued_at = now or _utc_now()
        expires_at = issued_at + timedelta(seconds=self._ttl_seconds)
        payload: dict[str, Any] = {
            "iss": self._issuer,
            "aud": self._audience,
            "sub": subject or terminal_id,
            "home_id": home_id,
            "terminal_id": terminal_id,
            "terminal_mode": terminal_mode,
            "scope": list(scope),
            "token_use": "bootstrap",
            "jti": str(uuid4()),
            "iat": int(issued_at.timestamp()),
            "exp": int(expires_at.timestamp()),
        }
        header = _json_b64url({"alg": "HS256", "typ": "JWT"})
        body = _json_b64url(payload)
        signature = self._sign(f"{header}.{body}")
        return f"{header}.{body}.{signature}"

    def resolve(
        self,
        token: str,
        *,
        required_scope: str | None = None,
    ) -> BootstrapTokenClaims | None:
        if token.count(".") != 2:
            return None
        header_segment, payload_segment, signature_segment = token.split(".", 2)
        signing_input = f"{header_segment}.{payload_segment}"
        expected_signature = self._sign(signing_input)
        if not hmac.compare_digest(signature_segment, expected_signature):
            raise BootstrapTokenError("invalid token signature")
        try:
            header = json.loads(_b64url_decode(header_segment).decode("utf-8"))
            payload = json.loads(_b64url_decode(payload_segment).decode("utf-8"))
        except Exception as exc:
            raise BootstrapTokenError("invalid token encoding") from exc
        if header.get("alg") != "HS256":
            raise BootstrapTokenError("unsupported token algorithm")
        if payload.get("iss") != self._issuer:
            raise BootstrapTokenError("invalid token issuer")
        if payload.get("aud") != self._audience:
            raise BootstrapTokenError("invalid token audience")
        if payload.get("token_use") != "bootstrap":
            raise BootstrapTokenError("invalid token use")
        expires_at = self._decode_expires_at(payload.get("exp"))
        if expires_at <= _utc_now() - timedelta(seconds=self._leeway_seconds):
            raise BootstrapTokenError("bootstrap token expired")
        scope = _as_scope(payload.get("scope"))
        if required_scope is not None and required_scope not in scope:
            raise BootstrapTokenError("required token scope is missing")
        jti = _as_string(payload.get("jti"), "jti")
        return BootstrapTokenClaims(
            home_id=_as_string(payload.get("home_id"), "home_id"),
            terminal_id=_as_string(payload.get("terminal_id"), "terminal_id"),
            terminal_mode=_as_string(payload.get("terminal_mode"), "terminal_mode"),
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
            raise BootstrapTokenError("exp is required")
        return datetime.fromtimestamp(value, timezone.utc)
