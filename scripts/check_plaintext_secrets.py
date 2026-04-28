from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path


SECRET_ASSIGNMENT_RE = re.compile(
    r"^\s*(?:export\s+)?([A-Z0-9_]*(?:PASSWORD|TOKEN|SECRET|PHONE_NUMBER)[A-Z0-9_]*)"
    r"\s*[:=]\s*['\"]?([^'\"#\s]+)"
)

PLACEHOLDER_PREFIXES = (
    "$",
    "change-this",
    "ci-",
    "test-",
    "example",
    "dummy",
    "local",
    "placeholder",
    "replace_with",
    "change_me",
    "<",
)
PLACEHOLDER_VALUES = {"", "false", "true", "none", "null", "smart_home"}


def tracked_files() -> list[Path]:
    output = subprocess.check_output(["git", "ls-files", "-z"])
    return [
        Path(item.decode("utf-8"))
        for item in output.split(b"\0")
        if item
    ]


def is_placeholder(value: str) -> bool:
    normalized = value.strip().strip("'\"`").lower()
    return normalized in PLACEHOLDER_VALUES or normalized.startswith(PLACEHOLDER_PREFIXES)


def is_suspicious_secret(key: str, value: str) -> bool:
    if is_placeholder(value):
        return False
    normalized_value = value.strip().strip("'\"`")
    if key == "PHONE_NUMBER":
        return bool(re.fullmatch(r"\+?\d{8,15}", normalized_value))
    if key.endswith("PASSWORD") or key == "PASSWORD":
        return bool(normalized_value)
    if "TOKEN" in key and normalized_value.startswith("eyJ"):
        return True
    if ("TOKEN" in key or "SECRET" in key) and len(normalized_value) >= 40:
        return True
    return False


def scan_file(path: Path) -> list[str]:
    if path.name == ".env":
        return [f"{path}: tracked .env files are not allowed"]
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return []
    violations: list[str] = []
    for line_number, line in enumerate(text.splitlines(), start=1):
        match = SECRET_ASSIGNMENT_RE.match(line)
        if not match:
            continue
        key, value = match.groups()
        if is_suspicious_secret(key, value):
            violations.append(f"{path}:{line_number}: possible plaintext secret in {key}")
    return violations


def main() -> int:
    violations: list[str] = []
    for path in tracked_files():
        violations.extend(scan_file(path))
    if violations:
        print("Plaintext secret scan failed:", file=sys.stderr)
        for violation in violations:
            print(f"- {violation}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
