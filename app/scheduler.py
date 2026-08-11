"""Scheduler + worker pool.

- APScheduler (cron) enqueues Run rows for enabled tasks with a cron string.
- A ThreadPool executes runs via the agent runtime. Blocking approval waits
  hold one worker thread; size the pool accordingly (WORKERS env).
"""
from __future__ import annotations

import os
from concurrent.futures import ThreadPoolExecutor

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from .agent.runtime import execute_run
from .db import Run, Task, db_session

_executor = ThreadPoolExecutor(max_workers=int(os.getenv("WORKERS", "4")))
_scheduler = BackgroundScheduler(timezone=os.getenv("TZ", "UTC"))


def enqueue_run(task_id: str, trigger: str = "manual") -> str:
    with db_session() as db:
        run = Run(task_id=task_id, trigger=trigger)
        db.add(run)
        db.commit()
        run_id = run.id
    _executor.submit(execute_run, run_id)
    return run_id


def _fire(task_id: str) -> None:
    with db_session() as db:
        task = db.get(Task, task_id)
        if not task or task.enabled != "true":
            return
    enqueue_run(task_id, trigger="schedule")


def sync_schedules() -> None:
    """Reconcile APScheduler jobs with the tasks table. Call on startup and
    after any task create/update/delete."""
    with db_session() as db:
        tasks = db.query(Task).all()
    wanted = {t.id: t.cron for t in tasks if t.cron and t.enabled == "true"}
    for job in _scheduler.get_jobs():
        if job.id not in wanted:
            job.remove()
    for task_id, cron in wanted.items():
        try:
            trigger = CronTrigger.from_crontab(cron)
        except ValueError:
            continue
        _scheduler.add_job(_fire, trigger, id=task_id, args=[task_id],
                           replace_existing=True)


def start() -> None:
    sync_schedules()
    if not _scheduler.running:
        _scheduler.start()
