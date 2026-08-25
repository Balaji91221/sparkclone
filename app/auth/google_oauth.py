"""Google OAuth: dashboard sign-in + connect the user's Google account.

One consent round-trip does both: it issues the dashboard session cookie and
stores the Gmail/Drive/Calendar credential for the agent.

Flow (all through the dashboard origin, proxied to this backend):
  GET  /auth/google/login      -> 302 to Google's consent screen (public)
  GET  /auth/google/callback   -> allowlist check, store tokens, set session
                                  cookie, 302 to /  (denied -> /?auth=denied)
  GET  /auth/google/session    -> {signed_in, email, google_enabled} (public)
  POST /auth/google/logout     -> clear session cookie (public)
  GET  /auth/google/status     -> {connected, email, scopes}   (auth)
  POST /auth/google/disconnect -> revoke + delete stored tokens (auth)

The refresh token is stored encrypted (see crypto.py). get_access_token() is
the entry point for tools that need to call Google APIs.
"""
from __future__ import annotations

import datetime as dt
import urllib.parse

import httpx
from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import RedirectResponse

from ..api.deps import auth
from ..config import settings
from ..db import GoogleCredential, db_session, utcnow
from .crypto import check_state, decrypt, encrypt, make_state
from .session import clear_session_cookie, is_allowed, session_email, set_session_cookie

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


_require_token = auth  # kept for readability at the call sites below


@router.get("/login")
def login() -> RedirectResponse:
    """Public: starts Google sign-in, which both logs the user in and
    connects Gmail/Drive/Calendar for the agent."""
    if not settings.google_client_id:
        raise HTTPException(500, "GOOGLE_CLIENT_ID is not configured")
    if not settings.allowed_emails:
        raise HTTPException(404, "Google sign-in is disabled: SPARK_ALLOWED_EMAILS is empty")
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

    if not is_allowed(email):
        # Do not store anything for an account that may not use this instance.
        return RedirectResponse(f"/?auth=denied&email={urllib.parse.quote(email)}")

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
    response = RedirectResponse("/?google=connected")
    set_session_cookie(response, email)
    return response


@router.get("/session", tags=["auth"])
def session(request: Request) -> dict:
    """Who the current browser session belongs to (no auth required)."""
    email = session_email(request)
    return {"signed_in": email is not None, "email": email or "",
            "google_enabled": bool(settings.allowed_emails and settings.google_client_id)}


@router.post("/logout", tags=["auth"])
def logout() -> Response:
    """Clears the dashboard session. The agent's Google credential is kept;
    use /disconnect to revoke it."""
    response = Response(status_code=204)
    clear_session_cookie(response)
    return response


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
