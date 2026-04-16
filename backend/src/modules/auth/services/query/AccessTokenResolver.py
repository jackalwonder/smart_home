from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class AccessTokenClaims:
    home_id: str
    terminal_id: str
    operator_id: str | None = None
    raw_token: str | None = None


class AccessTokenResolver:
    def resolve(self, token: str) -> AccessTokenClaims | None:
        return None


class NoopAccessTokenResolver(AccessTokenResolver):
    pass
