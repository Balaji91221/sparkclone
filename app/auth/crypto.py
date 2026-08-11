"""Secret handling for the Google integration.

- Fernet encryption for refresh tokens at rest (key derived from
  SPARK_SECRET_KEY, so rotating that key invalidates stored credentials).
- HMAC-signed state values for the OAuth flow (CSRF protection without
  server-side session storage).
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import os
import time

from cryptography.fernet import Fernet, InvalidToken

from ..config import settings

STATE_TTL_SECONDS = 600


def _fernet() -> Fernet:
    key = hashlib.sha256(settings.spark_secret_key.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key))


def encrypt(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode()


def decrypt(value: str) -> str | None:
    try:
        return _fernet().decrypt(value.encode()).decode()
    except InvalidToken:
        return None


def make_state() -> str:
    payload = f"{int(time.time())}.{os.urandom(8).hex()}"
    sig = hmac.new(settings.spark_secret_key.encode(), payload.encode(), hashlib.sha256)
    return f"{payload}.{sig.hexdigest()}"


def check_state(state: str) -> bool:
    parts = state.rsplit(".", 1)
    if len(parts) != 2:
        return False
    payload, sig = parts
    expected = hmac.new(settings.spark_secret_key.encode(), payload.encode(), hashlib.sha256)
    if not hmac.compare_digest(sig, expected.hexdigest()):
        return False
    try:
        issued = int(payload.split(".")[0])
    except ValueError:
        return False
    return (time.time() - issued) < STATE_TTL_SECONDS
