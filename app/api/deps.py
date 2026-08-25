from __future__ import annotations

from fastapi import HTTPException, Request

from ..auth.session import session_email
from ..config import settings


def auth(request: Request) -> None:
    """Accept either the API bearer token or a valid dashboard session cookie."""
    token = request.headers.get("authorization", "").removeprefix("Bearer ").strip()
    if token and token == settings.api_token:
        return
    if session_email(request):
        return
    raise HTTPException(401, "Invalid or missing API token")
