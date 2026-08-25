"""Google OAuth: connect the single user's Google account (Gmail + Drive).

Flow (all through the dashboard origin, proxied to this backend):
  GET  /auth/google/login      -> 302 to Google's consent screen
  GET  /auth/google/callback   -> code exchange, store tokens, 302 to /settings
  GET  /auth/google/status     -> {connected, email, scopes}   (bearer auth)
  POST /auth/google/disconnect -> revoke + delete stored tokens (bearer auth)

The refresh token is stored encrypted (see crypto.py). get_access_token() is
the entry point for tools that need to call Google APIs.
"""
from __future__ import annotations

import datetime as dt
import urllib.parse

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse

from ..config import settings
from ..db import GoogleCredential, db_session, utcnow
from .crypto import check_state, decrypt, encrypt, make_state

router = APIRouter(prefix="/auth/google")

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
REVOKE_URL = "https://oauth2.googleapis.com/revoke"
USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"

SCOPES = [
    "openid",
    "email",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/drive.readonly",
    # Added after the first release: accounts connected before this scope
    # existed get 403s from the Calendar API until the user reconnects
    # (prompt=consent always re-issues a refresh token with current scopes).
    "https://www.googleapis.com/auth/calendar.events",
]


def _require_token(request: Request) -> None:
    token = request.headers.get("authorization", "").removeprefix("Bearer ").strip()
    if token != settings.api_token:
        raise HTTPException(401, "Invalid or missing API token")


@router.get("/login")
def login() -> RedirectResponse:
    if not settings.google_client_id:
        raise HTTPException(500, "GOOGLE_CLIENT_ID is not configured")
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.oauth_redirect_url,
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",
        # Force the consent screen so Google always returns a refresh token.
        "prompt": "consent",
        "state": make_state(),
    }
    return RedirectResponse(f"{AUTH_URL}?{urllib.parse.urlencode(params)}")


@router.get("/callback")
def callback(request: Request) -> RedirectResponse:
    error = request.query_params.get("error")
    if error:
        return RedirectResponse(f"/settings?google=error&reason={urllib.parse.quote(error)}")
    code = request.query_params.get("code", "")
    state = request.query_params.get("state", "")
    if not code or not check_state(state):
        return RedirectResponse("/settings?google=error&reason=bad_state")

    with httpx.Client(timeout=20) as client:
        token_res = client.post(TOKEN_URL, data={
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": settings.oauth_redirect_url,
        })
        if token_res.status_code != 200:
            return RedirectResponse("/settings?google=error&reason=token_exchange")
        tokens = token_res.json()
        userinfo_res = client.get(USERINFO_URL, headers={
            "Authorization": f"Bearer {tokens.get('access_token', '')}",
        })
        email = userinfo_res.json().get("email", "") if userinfo_res.status_code == 200 else ""

    refresh_token = tokens.get("refresh_token", "")
    if not refresh_token:
        return RedirectResponse("/settings?google=error&reason=no_refresh_token")

    expiry = utcnow() + dt.timedelta(seconds=int(tokens.get("expires_in", 3600)))
    with db_session() as db:
        db.query(GoogleCredential).delete()  # single-user: one credential row
        db.add(GoogleCredential(
            email=email,
            refresh_token_enc=encrypt(refresh_token),
            access_token=tokens.get("access_token", ""),
            token_expiry=expiry,
            scopes=tokens.get("scope", "").split(),
        ))
        db.commit()
    return RedirectResponse("/settings?google=connected")


@router.get("/status")
def status(request: Request) -> dict:
    _require_token(request)
    with db_session() as db:
        cred = db.query(GoogleCredential).first()
        if not cred:
            return {"connected": False, "email": "", "scopes": []}
        return {"connected": True, "email": cred.email, "scopes": cred.scopes or []}


@router.post("/disconnect")
def disconnect(request: Request) -> dict:
    _require_token(request)
    with db_session() as db:
        cred = db.query(GoogleCredential).first()
        if cred:
            refresh_token = decrypt(cred.refresh_token_enc)
            if refresh_token:
                try:
                    httpx.post(REVOKE_URL, data={"token": refresh_token}, timeout=10)
                except httpx.HTTPError:
                    pass  # best-effort: deleting our copy is what matters
            db.delete(cred)
            db.commit()
    return {"ok": True}


def get_access_token() -> str | None:
    """Return a valid access token for Google API calls, refreshing if needed.

    Returns None when no account is connected or the refresh fails (the
    caller should surface a "reconnect Google" message).
    """
    with db_session() as db:
        cred = db.query(GoogleCredential).first()
        if not cred:
            return None
        expiry = cred.token_expiry
        if expiry is not None and expiry.tzinfo is None:  # SQLite drops tzinfo
            expiry = expiry.replace(tzinfo=dt.timezone.utc)
        if cred.access_token and expiry and expiry > utcnow() + dt.timedelta(minutes=2):
            return cred.access_token
        refresh_token = decrypt(cred.refresh_token_enc)
        if not refresh_token:
            return None
        res = httpx.post(TOKEN_URL, data={
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        }, timeout=20)
        if res.status_code != 200:
            return None
        tokens = res.json()
        cred.access_token = tokens.get("access_token", "")
        cred.token_expiry = utcnow() + dt.timedelta(seconds=int(tokens.get("expires_in", 3600)))
        db.commit()
        return cred.access_token
