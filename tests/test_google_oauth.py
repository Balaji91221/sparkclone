"""OAuth callback with Google mocked: allowlisted vs denied accounts."""
from __future__ import annotations

import httpx
import pytest

from app.auth import google_oauth
from app.auth.crypto import make_state, read_session
from app.auth.session import COOKIE_NAME
from app.config import settings
from app.db import GoogleCredential, db_session


class _FakeClient:
    """Stands in for httpx.Client inside the callback."""

    def __init__(self, email: str):
        self.email = email

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def post(self, url, data=None):
        return httpx.Response(200, json={
            "access_token": "at", "refresh_token": "rt", "expires_in": 3600,
            "scope": "openid email"})

    def get(self, url, headers=None):
        return httpx.Response(200, json={"email": self.email})


@pytest.fixture(autouse=True)
def _google(monkeypatch):
    monkeypatch.setattr(settings, "google_client_id", "cid")
    monkeypatch.setattr(settings, "allowed_emails", ("me@example.com",))
    with db_session() as db:
        db.query(GoogleCredential).delete()
        db.commit()


def _callback(client, monkeypatch, email):
    monkeypatch.setattr(google_oauth.httpx, "Client", lambda timeout: _FakeClient(email))
    return client.get(f"/auth/google/callback?code=x&state={make_state()}",
                      follow_redirects=False)


def test_allowed_email_signs_in_and_connects(client, monkeypatch):
    res = _callback(client, monkeypatch, "Me@Example.com")
    assert res.status_code == 307
    assert res.headers["location"] == "/?google=connected"
    assert read_session(res.cookies[COOKIE_NAME]) == "Me@Example.com"
    with db_session() as db:
        assert db.query(GoogleCredential).one().email == "Me@Example.com"


def test_denied_email_stores_nothing(client, monkeypatch):
    res = _callback(client, monkeypatch, "intruder@example.com")
    assert res.status_code == 307
    assert res.headers["location"].startswith("/?auth=denied")
    assert COOKIE_NAME not in res.cookies
    with db_session() as db:
        assert db.query(GoogleCredential).count() == 0


def test_bad_state_rejected(client, monkeypatch):
    monkeypatch.setattr(google_oauth.httpx, "Client", lambda timeout: _FakeClient("me@example.com"))
    res = client.get("/auth/google/callback?code=x&state=bogus", follow_redirects=False)
    assert "bad_state" in res.headers["location"]
    assert COOKIE_NAME not in res.cookies
