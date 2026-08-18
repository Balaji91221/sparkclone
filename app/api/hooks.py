"""Inbound webhook endpoint: external services start a task run.

POST /api/hooks/{task_id}/{secret} — authenticated by the per-task secret
alone (third parties never hold the dashboard API token). A wrong task id or
secret both return 404 so callers can't probe which tasks exist.
"""
from __future__ import annotations

import secrets as pysecrets
import threading
import time

from fastapi import APIRouter, HTTPException

from .. import scheduler
from ..db import Task, db_session

router = APIRouter(prefix="/api/hooks")

RATE_WINDOW_S = 60.0

_rate_lock = threading.Lock()
_last_fire: dict[str, float] = {}


@router.post("/{task_id}/{secret}")
def fire_webhook(task_id: str, secret: str):
    with db_session() as db:
        t = db.get(Task, task_id)
        if (not t or not t.webhook_secret
                or not pysecrets.compare_digest(secret, t.webhook_secret)):
            raise HTTPException(404)
        if t.enabled != "true":
            raise HTTPException(409, "Task is disabled.")
    with _rate_lock:
        now = time.monotonic()
        last = _last_fire.get(task_id, 0.0)
        if now - last < RATE_WINDOW_S:
            raise HTTPException(429, "This webhook fired less than a minute ago.")
        _last_fire[task_id] = now
    return {"run_id": scheduler.enqueue_run(task_id, trigger="webhook")}
