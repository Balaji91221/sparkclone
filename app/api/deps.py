from __future__ import annotations

from fastapi import HTTPException, Request

from ..config import settings


def auth(request: Request) -> None:
    token = request.headers.get("authorization", "").removeprefix("Bearer ").strip()
    if token != settings.api_token:
        raise HTTPException(401, "Invalid or missing API token")
