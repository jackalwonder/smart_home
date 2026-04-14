from __future__ import annotations

from typing import Protocol


class ConnectionSecretCipher(Protocol):
    def encrypt(self, plaintext: str | None) -> str | None: ...

    def decrypt(self, ciphertext: str | None) -> str | None: ...
