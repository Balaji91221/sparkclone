"""User notifications for scheduler and approval events.

Delivered through the notify tool's channel chain (connected Gmail -> SMTP ->
stdout) by calling registry.notify() directly — never through the agent/tool
path. A notification failure must never change run state or kill a worker
thread, so every public hook swallows and logs its own errors.
"""
from __future__ import annotations

import datetime as dt
import logging

from .config import settings
from .db import Approval, Run, RunStatus, Setting, Task, db_session, utcnow
from .tools import registry

log = logging.getLogger("spark.notifications")

SETTINGS_KEY = "notifications"

DEFAULTS: dict[str, object] = {
    "notify_on_final_failure": True,
    "notify_on_pending_approval": True,
    # Off by default: the user is present in chat, and chat approvals are
    # auto-denied on restart anyway.
    "notify_on_chat_approval": False,
    "failure_cooldown_minutes": 60,
}

# task_id -> when its last final-failure notification went out. In-memory is
# fine: single process, same as the scheduler's module-level state. Without
# this, a failing interval task would email every cycle.
_last_failure_notice: dict[str, dt.datetime] = {}


def get_settings() -> dict:
    with db_session() as db:
        row = db.get(Setting, SETTINGS_KEY)
    merged = dict(DEFAULTS)
    if row and isinstance(row.value, dict):
        merged.update({k: row.value[k] for k in DEFAULTS if k in row.value})
    return merged


def update_settings(values: dict) -> dict:
    with db_session() as db:
        row = db.get(Setting, SETTINGS_KEY)
        if row is None:
            row = Setting(key=SETTINGS_KEY, value={})
            db.add(row)
        merged = dict(row.value or {})
        merged.update({k: values[k] for k in DEFAULTS if k in values})
        row.value = merged
        db.commit()
    return get_settings()


def notify_run_failed(run_id: str) -> None:
    """Called after a run ends with no retry scheduled (the final attempt)."""
    try:
        prefs = get_settings()
        if not prefs["notify_on_final_failure"]:
            return
        with db_session() as db:
            run = db.get(Run, run_id)
            task = db.get(Task, run.task_id) if run else None
        if not run or not task or run.status != RunStatus.failed:
            return
        now = utcnow()
        last = _last_failure_notice.get(task.id)
        cooldown = dt.timedelta(minutes=int(prefs["failure_cooldown_minutes"]))
        if last is not None and now - last < cooldown:
            return
        _last_failure_notice[task.id] = now
        attempts = (run.attempt or 0) + 1
        tries = f" after {attempts} attempts" if attempts > 1 else ""
        registry.notify(
            f"Task \"{task.name}\" failed{tries}.\n\n"
            f"Error: {(run.error or 'unknown')[:500]}\n\n"
            f"Run details: {settings.dashboard_url}/runs/{run.id}",
            subject=f"Astra: task \"{task.name}\" failed")
    except Exception:  # noqa: BLE001 — never let a notification break the run flow
        log.warning("run-failure notification for %s failed", run_id, exc_info=True)


def notify_approval_pending(approval_id: str, from_chat: bool = False) -> None:
    """Called right after an Approval row is created, before the poll wait."""
    try:
        prefs = get_settings()
        key = "notify_on_chat_approval" if from_chat else "notify_on_pending_approval"
        if not prefs[key]:
            return
        with db_session() as db:
            approval = db.get(Approval, approval_id)
        if not approval:
            return
        registry.notify(
            f"The agent wants to run \"{approval.tool_name}\" and is paused "
            f"waiting for your decision.\n\n"
            f"Review it: {settings.dashboard_url}/approvals",
            subject=f"Astra: approval needed for {approval.tool_name}")
    except Exception:  # noqa: BLE001 — never let a notification break the run flow
        log.warning("approval notification for %s failed", approval_id, exc_info=True)
