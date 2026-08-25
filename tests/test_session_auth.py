"""Dashboard session cookie: signing, expiry, and the dual auth gate."""
from __future__ import annotations

import pytest

from app.auth.crypto import make_session, read_session
from app.auth.session import COOKIE_NAME
from app.config import settings
from tests.conftest import AUTH


def test_session_round_trip():
    assert read_session(make_session("me@example.com")) == "me@example.com"


def test_tampered_session_rejected():
    value = make_session("me@example.com")
    payload, sig = value.rsplit(".", 1)
    assert read_session(f"{payload}.{'0' * len(sig)}") is None
    assert read_session("garbage") is None
    assert read_session("") is None


def test_expired_session_rejected():
    assert read_session(make_session("me@example.com", max_age=-1)) is None


def test_bearer_still_accepted(client):
    assert client.get("/api/tasks", headers=AUTH).status_code == 200


def test_cookie_accepted(client):
    client.cookies.set(COOKIE_NAME, make_session("me@example.com"))
    assert client.get("/api/tasks").status_code == 200


def test_nothing_rejected(client):
    assert client.get("/api/tasks").status_code == 401


def test_bad_cookie_rejected(client):
    client.cookies.set(COOKIE_NAME, "not.a.session")
    assert client.get("/api/tasks").status_code == 401


def test_session_endpoint_and_logout(client):
    assert client.get("/auth/google/session").json()["signed_in"] is False
    client.cookies.set(COOKIE_NAME, make_session("me@example.com"))
    body = client.get("/auth/google/session").json()
    assert body == {"signed_in": True, "email": "me@example.com",
                    "google_enabled": bool(settings.allowed_emails and settings.google_client_id)}
    res = client.post("/auth/google/logout")
    assert res.status_code == 204
    assert 'spark_session=""' in res.headers["set-cookie"] or "Max-Age=0" in res.headers["set-cookie"]


def test_login_disabled_without_allowlist(client, monkeypatch):
    monkeypatch.setattr(settings, "google_client_id", "cid")
    monkeypatch.setattr(settings, "allowed_emails", ())
    assert client.get("/auth/google/login", follow_redirects=False).status_code == 404


def test_login_public_when_enabled(client, monkeypatch):
    monkeypatch.setattr(settings, "google_client_id", "cid")
    monkeypatch.setattr(settings, "allowed_emails", ("me@example.com",))
    res = client.get("/auth/google/login", follow_redirects=False)
    assert res.status_code == 307
    assert res.headers["location"].startswith("https://accounts.google.com/")
