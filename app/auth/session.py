"""Dashboard session cookie helpers (set / clear / read)."""
from __future__ import annotations

from fastapi import Request, Response

from ..config import settings
from .crypto import make_session, read_session

COOKIE_NAME = "spark_session"


def set_session_cookie(response: Response, email: str) -> None:
    response.set_cookie(
        COOKIE_NAME, make_session(email),
        max_age=settings.session_max_age, httponly=True, samesite="lax",
        secure=settings.env == "production", path="/")


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(COOKIE_NAME, path="/")


def session_email(request: Request) -> str | None:
    """Email of the signed-in user, or None when there is no valid session."""
    value = request.cookies.get(COOKIE_NAME, "")
    return read_session(value) if value else None


def is_allowed(email: str) -> bool:
    return bool(email) and email.lower() in settings.allowed_emails
