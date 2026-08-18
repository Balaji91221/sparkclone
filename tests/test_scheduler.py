from __future__ import annotations

import datetime as dt
from unittest.mock import patch

from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.date import DateTrigger
from apscheduler.triggers.interval import IntervalTrigger

from app import scheduler
from app.db import Run, RunStatus, Task, db_session


def make_task(**kw) -> str:
    with db_session() as db:
        t = Task(name="t", prompt="p", **kw)
        db.add(t)
        db.commit()
        return t.id


def future_iso(minutes: int = 10) -> str:
    return (dt.datetime.now(dt.timezone.utc)
            + dt.timedelta(minutes=minutes)).isoformat()


def test_build_trigger_per_kind():
    with db_session() as db:
        legacy = Task(name="l", prompt="p", cron="0 9 * * *")
        cron = Task(name="c", prompt="p", trigger_type="cron",
                    trigger_value="0 9 * * *")
        interval = Task(name="i", prompt="p", trigger_type="interval",
                        trigger_value="300")
        date = Task(name="d", prompt="p", trigger_type="date",
                    trigger_value=future_iso())
        webhook = Task(name="w", prompt="p", trigger_type="webhook")
        manual = Task(name="m", prompt="p")
    assert isinstance(scheduler.build_trigger(legacy), CronTrigger)
    assert isinstance(scheduler.build_trigger(cron), CronTrigger)
    assert isinstance(scheduler.build_trigger(interval), IntervalTrigger)
    assert isinstance(scheduler.build_trigger(date), DateTrigger)
    assert scheduler.build_trigger(webhook) is None
    assert scheduler.build_trigger(manual) is None


def test_interval_floor_applied():
    with db_session() as db:
        t = Task(name="i", prompt="p", trigger_type="interval", trigger_value="1")
    trig = scheduler.build_trigger(t)
    assert trig.interval.total_seconds() == scheduler.MIN_INTERVAL_S


def test_sync_schedules_reconciles():
    tid = make_task(trigger_type="interval", trigger_value="600",
                    enabled="true")
    scheduler.sync_schedules()
    assert scheduler._scheduler.get_job(tid) is not None
    with db_session() as db:
        db.get(Task, tid).enabled = "false"
        db.commit()
    scheduler.sync_schedules()
    assert scheduler._scheduler.get_job(tid) is None


def test_sync_does_not_reset_unchanged_schedule():
    # Re-syncing must keep the existing job untouched, or every task edit
    # would reset an interval task's phase and postpone its next fire.
    # Paused start: pending jobs don't honor replace_existing, so use the
    # real jobstore (no job ever executes — the scheduler stays paused).
    if not scheduler._scheduler.running:
        scheduler._scheduler.start(paused=True)
    tid = make_task(trigger_type="interval", trigger_value="600",
                    enabled="true")
    scheduler.sync_schedules()
    before = scheduler._scheduler.get_job(tid).trigger
    scheduler.sync_schedules()
    assert scheduler._scheduler.get_job(tid).trigger is before
    with db_session() as db:
        db.get(Task, tid).trigger_value = "900"
        db.commit()
    scheduler.sync_schedules()
    assert scheduler._scheduler.get_job(tid).trigger is not before


def test_sync_skips_invalid_schedule():
    tid = make_task(trigger_type="date", trigger_value="garbage",
                    enabled="true")
    scheduler.sync_schedules()  # must not raise
    assert scheduler._scheduler.get_job(tid) is None


def test_one_off_fire_disables_task():
    tid = make_task(trigger_type="date", trigger_value=future_iso(),
                    enabled="true")
    with patch("app.scheduler.enqueue_run") as eq:
        scheduler._fire(tid)
    eq.assert_called_once_with(tid, trigger="schedule")
    with db_session() as db:
        assert db.get(Task, tid).enabled == "false"


def test_failed_run_schedules_retry():
    tid = make_task(max_retries=2, enabled="true")
    with db_session() as db:
        run = Run(task_id=tid, status=RunStatus.failed, attempt=0)
        db.add(run)
        db.commit()
        run_id = run.id
    with patch.object(scheduler._scheduler, "add_job") as add_job:
        scheduler._maybe_retry(run_id, tid)
    assert add_job.called
    assert add_job.call_args.kwargs["id"] == f"retry-{run_id}"
    assert add_job.call_args.kwargs["args"] == [tid, "retry", 1]


def test_retry_stops_at_max():
    tid = make_task(max_retries=1, enabled="true")
    with db_session() as db:
        run = Run(task_id=tid, status=RunStatus.failed, attempt=1)
        db.add(run)
        db.commit()
        run_id = run.id
    with patch.object(scheduler._scheduler, "add_job") as add_job:
        scheduler._maybe_retry(run_id, tid)
    assert not add_job.called


def test_one_off_task_retries_even_after_self_disable():
    # A date task disables itself when it fires; its failed run still retries.
    tid = make_task(trigger_type="date", trigger_value=future_iso(),
                    max_retries=1, enabled="false")
    with db_session() as db:
        run = Run(task_id=tid, status=RunStatus.failed, attempt=0)
        db.add(run)
        db.commit()
        run_id = run.id
    with patch.object(scheduler._scheduler, "add_job") as add_job:
        scheduler._maybe_retry(run_id, tid)
    assert add_job.called


def test_no_retry_on_success():
    tid = make_task(max_retries=2, enabled="true")
    with db_session() as db:
        run = Run(task_id=tid, status=RunStatus.succeeded, attempt=0)
        db.add(run)
        db.commit()
        run_id = run.id
    with patch.object(scheduler._scheduler, "add_job") as add_job:
        scheduler._maybe_retry(run_id, tid)
    assert not add_job.called
