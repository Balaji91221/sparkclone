"""Astra API — app factory, startup, and middleware.

Route handlers live in app/api/* routers; the agent loop in app/agent/agent.py.
The dashboard is the Next.js app in frontend/ (it proxies /api and /auth here).
"""
from __future__ import annotations

import logging
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request

from . import scheduler
from .api import approvals, chats, hooks, mcp, runs, skills, tasks, tools
from .api import settings as settings_api
from .auth.google_oauth import router as google_router
from .config import insecure_default_secrets, settings
from .db import Approval, Chat, Run, RunStatus, db_session, init_db, utcnow

log = logging.getLogger("spark")
logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s %(levelname)s %(name)s %(message)s")


def _reap_orphaned_runs() -> None:
    """Runs left queued/running by a previous process died with it."""
    with db_session() as db:
        stale = db.query(Run).filter(
            Run.status.in_([RunStatus.queued, RunStatus.running,
                            RunStatus.waiting_approval])).all()
        for r in stale:
            r.status = RunStatus.failed
            r.error = "Server restarted while this run was in progress. Run the task again."
            r.finished_at = utcnow()
        # Chats whose worker died mid-turn: unstick them and clear their
        # pending approvals so the queue doesn't hold ghosts.
        for chat in db.query(Chat).filter(Chat.status != "idle").all():
            chat.status = "idle"
        for a in (db.query(Approval)
                  .filter(Approval.status == "pending", Approval.chat_id != "")
                  .all()):
            a.status = "denied"
            a.resolved_at = utcnow()
        db.commit()


def _check_secrets() -> None:
    insecure = insecure_default_secrets()
    if not insecure:
        return
    if settings.env == "production":
        raise RuntimeError(
            f"Refusing to start with default secrets in production: {', '.join(insecure)}. "
            "Set them in .env (openssl rand -hex 24).")
    log.warning("Using default values for %s — fine for local dev, but set real "
                "secrets in .env before exposing this server.", ", ".join(insecure))


@asynccontextmanager
async def lifespan(_app: FastAPI):
    _check_secrets()
    init_db()
    _reap_orphaned_runs()
    scheduler.start()
    yield


app = FastAPI(title="Astra", version="2.0.0", lifespan=lifespan)
for router in (tasks.router, skills.router, runs.router, approvals.router,
               tools.router, mcp.router, chats.router, hooks.router,
               settings_api.router, google_router):
    app.include_router(router)


@app.middleware("http")
async def request_logging(request: Request, call_next):
    rid = uuid.uuid4().hex[:8]
    started = time.monotonic()
    response = await call_next(request)
    # One line per request; polling endpoints stay at DEBUG to keep logs sane.
    duration_ms = int((time.monotonic() - started) * 1000)
    level = logging.DEBUG if request.method == "GET" else logging.INFO
    log.log(level, "rid=%s %s %s -> %s %dms", rid, request.method,
            request.url.path, response.status_code, duration_ms)
    response.headers["x-request-id"] = rid
    return response


@app.get("/")
def root():
    return {"app": "Astra", "api": "ok",
            "dashboard": "run `npm run dev` in frontend/ (http://localhost:3000)"}


@app.get("/health")
def health():
    """Small readiness endpoint used by the dashboard and deployment checks."""
    return {"ok": True, "service": "astra", "version": app.version}
