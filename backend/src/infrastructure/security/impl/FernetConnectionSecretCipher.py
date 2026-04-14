from __future__ import annotations

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken


class FernetConnectionSecretCipher:
    _PREFIX = "enc:v1:"

    def __init__(self, secret: str) -> None:
        if not secret.strip():
            raise ValueError("connection_encryption_secret must not be empty")
        derived_key = base64.urlsafe_b64encode(hashlib.sha256(secret.encode("utf-8")).digest())
        self._fernet = Fernet(derived_key)

    def encrypt(self, plaintext: str | None) -> str | None:
        if plaintext is None:
            return None
        token = self._fernet.encrypt(plaintext.encode("utf-8")).decode("utf-8")
        return f"{self._PREFIX}{token}"

    def decrypt(self, ciphertext: str | None) -> str | None:
        if ciphertext is None:
            return None
        if not ciphertext.startswith(self._PREFIX):
            return ciphertext
        token = ciphertext.removeprefix(self._PREFIX).encode("utf-8")
        try:
            return self._fernet.decrypt(token).decode("utf-8")
        except InvalidToken as exc:
            raise ValueError("failed to decrypt system connection secret") from exc
