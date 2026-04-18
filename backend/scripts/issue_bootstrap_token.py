from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.app.container import get_bootstrap_token_service
from src.modules.auth.services.command.BootstrapTokenService import (
    BootstrapTokenCreateInput,
)

ACTIVATION_CODE_PREFIX = "smart-home-activate:"


def build_activation_link(token: str, frontend_url: str | None) -> str | None:
    if not frontend_url:
        return None
    normalized = frontend_url.strip()
    if not normalized:
        return None
    parts = urlsplit(normalized)
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    query["bootstrap_token"] = token
    return urlunsplit(
        (parts.scheme, parts.netloc, parts.path or "/", urlencode(query), parts.fragment)
    )


def build_activation_code(token: str) -> str:
    return f"{ACTIVATION_CODE_PREFIX}{token}"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Issue or rotate a bootstrap token for a terminal.",
    )
    parser.add_argument("--home-id", required=True, help="Home ID that owns the terminal.")
    parser.add_argument(
        "--terminal-id",
        required=True,
        help="Target terminal ID that should receive the bootstrap token.",
    )
    parser.add_argument(
        "--created-by-terminal-id",
        help="Terminal ID recorded as the actor. Defaults to the target terminal.",
    )
    parser.add_argument(
        "--created-by-member-id",
        help="Optional member ID recorded as the actor.",
    )
    parser.add_argument(
        "--frontend-url",
        help="Optional frontend base URL or activation page URL used to print an activation link.",
    )
    return parser.parse_args()


async def main() -> int:
    args = parse_args()
    service = get_bootstrap_token_service()
    result = await service.create_or_reset(
        BootstrapTokenCreateInput(
            home_id=args.home_id,
            target_terminal_id=args.terminal_id,
            created_by_member_id=args.created_by_member_id,
            created_by_terminal_id=args.created_by_terminal_id or args.terminal_id,
        )
    )
    print(f"terminal_id={result.terminal_id}")
    print(f"rotated={str(result.rotated).lower()}")
    print(f"expires_at={result.expires_at}")
    print(f"scope={','.join(result.scope)}")
    print(f"bootstrap_token={result.bootstrap_token}")
    print(f"activation_code={build_activation_code(result.bootstrap_token)}")
    activation_link = build_activation_link(
        token=result.bootstrap_token,
        frontend_url=args.frontend_url,
    )
    if activation_link:
        print(f"activation_link={activation_link}")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
