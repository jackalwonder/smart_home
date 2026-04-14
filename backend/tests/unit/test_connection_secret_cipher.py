from __future__ import annotations

from src.infrastructure.security.impl.FernetConnectionSecretCipher import (
    FernetConnectionSecretCipher,
)


def test_cipher_encrypts_and_decrypts_round_trip():
    cipher = FernetConnectionSecretCipher("unit-test-secret")

    encrypted = cipher.encrypt("http://homeassistant.local:8123")

    assert encrypted is not None
    assert encrypted.startswith("enc:v1:")
    assert encrypted != "http://homeassistant.local:8123"
    assert cipher.decrypt(encrypted) == "http://homeassistant.local:8123"


def test_cipher_keeps_legacy_plaintext_readable():
    cipher = FernetConnectionSecretCipher("unit-test-secret")

    assert cipher.decrypt("legacy-plaintext-token") == "legacy-plaintext-token"
