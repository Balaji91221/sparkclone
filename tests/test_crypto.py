"""Fernet at-rest encryption and HMAC-signed OAuth state."""
from __future__ import annotations

import hashlib
import hmac
import time

from app.auth import crypto
from app.config import settings


def test_encrypt_decrypt_roundtrip():
    assert crypto.decrypt(crypto.encrypt("refresh-token-123")) == "refresh-token-123"


def test_decrypt_rejects_garbage():
    assert crypto.decrypt("not-a-fernet-token") is None


def test_decrypt_rejects_tampered_ciphertext():
    token = crypto.encrypt("secret")
    tampered = token[:-4] + ("AAAA" if not token.endswith("AAAA") else "BBBB")
    assert crypto.decrypt(tampered) is None


def test_state_roundtrip():
    assert crypto.check_state(crypto.make_state())


def test_state_rejects_tampered_signature():
    state = crypto.make_state()
    payload, sig = state.rsplit(".", 1)
    bad_sig = ("0" * len(sig)) if sig[0] != "0" else ("1" + sig[1:])
    assert not crypto.check_state(f"{payload}.{bad_sig}")


def test_state_rejects_malformed_values():
    assert not crypto.check_state("")
    assert not crypto.check_state("no-dots-here")
    assert not crypto.check_state("a.b.c")


def _signed_state(issued_at: int) -> str:
    payload = f"{issued_at}.deadbeefdeadbeef"
    sig = hmac.new(settings.spark_secret_key.encode(), payload.encode(),
                   hashlib.sha256)
    return f"{payload}.{sig.hexdigest()}"


def test_state_expires_after_ttl():
    fresh = _signed_state(int(time.time()))
    expired = _signed_state(int(time.time()) - crypto.STATE_TTL_SECONDS - 1)
    assert crypto.check_state(fresh)
    assert not crypto.check_state(expired)
