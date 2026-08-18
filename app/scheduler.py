"""Scheduler + worker pool.

- APScheduler enqueues Run rows for enabled tasks: cron, interval ("every N
  seconds"), or one-off date schedules. Webhook tasks are fired by the hooks
  API; manual tasks only by "Run now".
- A ThreadPool executes runs via the agent loop. Blocking approval waits
  hold one worker thread; size the pool accordingly (WORKERS env).
- Misfires (the server was down at fire time) fire once on startup if within
  MISFIRE_GRACE_S; coalesce collapses several missed fires into one run.
- A failed run re-enqueues with exponential backoff up to Task.max_retries;
  each retry is its own Run row with trigger="retry".
"""
from __future__ import annotations

import datetime as dt
import logging
import os
from concurrent.futures import ThreadPoolExecutor

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.date import DateTrigger
from apscheduler.triggers.interval import IntervalTrigger

from .agent.agent import execute_run
from .db import Run, RunStatus, Task, db_session, utcnow

log = logging.getLogger("spark.scheduler")

MIN_INTERVAL_S = 60
MISFIRE_GRACE_S = 3600
RETRY_BASE_DELAY_S = 30

_executor = ThreadPoolExecutor(max_workers=int(os.getenv("WORKERS", "4")))
_scheduler = BackgroundScheduler(timezone=os.getenv("TZ", "UTC"))


def submit(fn, *args) -> None:
    """Run a callable on the shared worker pool (used by chat turns)."""
    _executor.submit(fn, *args)


def effective_trigger_type(task: Task) -> str:
    """Legacy rows (trigger_type='') derive their kind from the cron column."""
    if task.trigger_type:
        return task.trigger_type
    return "cron" if task.cron else "manual"


def build_trigger(task: Task):
    """APScheduler trigger for a task, or None if it isn't time-scheduled.
    Raises ValueError on an invalid stored schedule."""
    kind = effective_trigger_type(task)
    if kind == "cron":
        return CronTrigger.from_crontab(task.trigger_value or task.cron)
    if kind == "interval":
        seconds = max(int(task.trigger_value), MIN_INTERVAL_S)
        return IntervalTrigger(seconds=seconds)
    if kind == "date":
        # "Z" suffix: sent by JS clients; Python 3.10 needs "+00:00".
        run_at = dt.datetime.fromisoformat(task.trigger_value.replace("Z", "+00:00"))
        if run_at.tzinfo is None:
            run_at = run_at.replace(tzinfo=dt.timezone.utc)
        return DateTrigger(run_date=run_at)
    return None  # webhook | manual


def enqueue_run(task_id: str, trigger: str = "manual", attempt: int = 0) -> str:
    with db_session() as db:
        run = Run(task_id=task_id, trigger=trigger, attempt=attempt)
        db.add(run)
        db.commit()
        run_id = run.id
    _executor.submit(_execute, run_id, task_id)
    return run_id


def _execute(run_id: str, task_id: str) -> None:
    execute_run(run_id)
    _maybe_retry(run_id, task_id)


def _maybe_retry(run_id: str, task_id: str) -> None:
    with db_session() as db:
        run = db.get(Run, run_id)
        task = db.get(Task, task_id)
        if not run or not task or run.status != RunStatus.failed:
            return
        # One-off (date) tasks disable themselves on fire, but their failed
        # run may still retry; other disabled tasks never do.
        if task.enabled != "true" and effective_trigger_type(task) != "date":
            return
        attempt = run.attempt or 0
        if attempt >= (task.max_retries or 0):
            return
    delay = RETRY_BASE_DELAY_S * (2 ** attempt)
    log.info("run %s failed (attempt %d); retrying in %ds", run_id, attempt, delay)
    _scheduler.add_job(
        enqueue_run, DateTrigger(run_date=utcnow() + dt.timedelta(seconds=delay)),
        args=[task_id, "retry", attempt + 1],
        id=f"retry-{run_id}", replace_existing=True,
        misfire_grace_time=MISFIRE_GRACE_S, coalesce=True)


def _fire(task_id: str) -> None:
    with db_session() as db:
        task = db.get(Task, task_id)
        if not task or task.enabled != "true":
            return
        one_off = effective_trigger_type(task) == "date"
        if one_off:
            task.enabled = "false"  # a date schedule fires exactly once
            db.commit()
    enqueue_run(task_id, trigger="schedule")
    if one_off:
        sync_schedules()


def next_run_at(task_id: str) -> str | None:
    """ISO timestamp of the task's next scheduled fire, if any."""
    job = _scheduler.get_job(task_id)
    when = getattr(job, "next_run_time", None) if job else None
    return when.isoformat() if when else None


def sync_schedules() -> None:
    """Reconcile APScheduler jobs with the tasks table. Call on startup and
    after any task create/update/delete."""
    with db_session() as db:
        tasks = db.query(Task).all()
    wanted: dict[str, object] = {}
    for t in tasks:
        if t.enabled != "true":
            continue
        try:
            trigger = build_trigger(t)
        except (ValueError, TypeError):
            log.warning("task %s has an invalid schedule (%s=%r); skipping",
                        t.id, effective_trigger_type(t), t.trigger_value or t.cron)
            continue
        if trigger is not None:
            wanted[t.id] = trigger
    existing = {}
    for job in _scheduler.get_jobs():
        if job.id not in wanted and not job.id.startswith("retry-"):
            job.remove()
        else:
            existing[job.id] = job
    for task_id, trigger in wanted.items():
        job = existing.get(task_id)
        if job is not None and str(job.trigger) == str(trigger):
            # Unchanged schedule: re-adding would reset an interval's phase
            # (postponing its next fire by a full period on every task edit).
            continue
        _scheduler.add_job(_fire, trigger, id=task_id, args=[task_id],
                           replace_existing=True,
                           misfire_grace_time=MISFIRE_GRACE_S, coalesce=True)


def start() -> None:
    sync_schedules()
    if not _scheduler.running:
        _scheduler.start()
