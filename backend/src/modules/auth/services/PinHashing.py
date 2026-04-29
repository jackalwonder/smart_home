from __future__ import annotations

import hashlib
import hmac
import secrets

from cryptography.exceptions import InvalidKey
from cryptography.hazmat.primitives.kdf.argon2 import Argon2id

PIN_HASH_ALGORITHM = "argon2id"
PIN_HASH_ITERATIONS = 2
PIN_HASH_MEMORY_COST_KIB = 19_456
PIN_HASH_LANES = 1
PIN_HASH_LENGTH = 32
PIN_SALT_BYTES = 16


def _legacy_sha256_hash(pin: str, salt: str | None) -> str:
    return hashlib.sha256(f"{pin}:{salt or ''}".encode("utf-8")).hexdigest()


def hash_pin(pin: str) -> str:
    salt = secrets.token_bytes(PIN_SALT_BYTES)
    return _argon2id(salt).derive_phc_encoded(pin.encode("utf-8"))


def _argon2id(salt: bytes) -> Argon2id:
    return Argon2id(
        salt,
        length=PIN_HASH_LENGTH,
        iterations=PIN_HASH_ITERATIONS,
        lanes=PIN_HASH_LANES,
        memory_cost=PIN_HASH_MEMORY_COST_KIB,
    )


def verify_pin(pin: str, stored_hash: str | None, legacy_salt: str | None) -> bool:
    if not stored_hash:
        return False
    if stored_hash.startswith(f"${PIN_HASH_ALGORITHM}$"):
        return _verify_argon2id_pin(pin, stored_hash)
    return hmac.compare_digest(_legacy_sha256_hash(pin, legacy_salt), stored_hash)


def needs_pin_hash_upgrade(stored_hash: str | None) -> bool:
    return not stored_hash or not stored_hash.startswith(f"${PIN_HASH_ALGORITHM}$")


def legacy_sha256_pin_hash(pin: str, salt: str | None) -> str:
    return _legacy_sha256_hash(pin, salt)


def _verify_argon2id_pin(pin: str, stored_hash: str) -> bool:
    try:
        Argon2id.verify_phc_encoded(pin.encode("utf-8"), stored_hash)
    except (InvalidKey, ValueError, TypeError):
        return False
    return True
