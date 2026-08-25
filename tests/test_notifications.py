"""Failure/approval notifications: hooks, storm suppression, and settings."""
from __future__ import annotations

from unittest.mock import patch

import pytest

from app import notifications, scheduler
from app.db import Approval, Run, RunStatus, Task, db_session
from tests.conftest import AUTH


@pytest.fixture(autouse=True)
def reset_notification_state():
    notifications._last_failure_notice.clear()
    notifications.update_settings(dict(notifications.DEFAULTS))
    yield


def make_failed_run(max_retries: int = 0, attempt: int = 0,
                    status: RunStatus = RunStatus.failed) -> tuple[str, str]:
    with db_session() as db:
        task = Task(name="notif", prompt="p", max_retries=max_retries,
                    enabled="true")
        db.add(task)
        db.commit()
        run = Run(task_id=task.id, status=status, attempt=attempt,
                  error="boom")
        db.add(run)
        db.commit()
        return run.id, task.id


def test_final_failure_notifies_once():
    run_id, _ = make_failed_run()
    with patch("app.notifications.registry.notify") as notify:
        notifications.notify_run_failed(run_id)
    assert notify.call_count == 1
    message = notify.call_args.args[0]
    assert "notif" in message and run_id in message
    assert "failed" in notify.call_args.kwargs["subject"]


def test_succeeded_run_never_notifies():
    run_id, _ = make_failed_run(status=RunStatus.succeeded)
    with patch("app.notifications.registry.notify") as notify:
        notifications.notify_run_failed(run_id)
    assert not notify.called


def test_cooldown_suppresses_repeat_failures():
    run_id, task_id = make_failed_run()
    with db_session() as db:
        second = Run(task_id=task_id, status=RunStatus.failed, error="boom2")
        db.add(second)
        db.commit()
        second_id = second.id
    with patch("app.notifications.registry.notify") as notify:
        notifications.notify_run_failed(run_id)
        notifications.notify_run_failed(second_id)
    assert notify.call_count == 1


def test_failure_toggle_off_silences():
    notifications.update_settings({"notify_on_final_failure": False})
    run_id, _ = make_failed_run()
    with patch("app.notifications.registry.notify") as notify:
        notifications.notify_run_failed(run_id)
    assert not notify.called


def test_notification_errors_never_propagate():
    run_id, _ = make_failed_run()
    with patch("app.notifications.registry.notify",
               side_effect=RuntimeError("smtp down")):
        notifications.notify_run_failed(run_id)  # must not raise


def test_execute_notifies_only_when_no_retry_scheduled():
    # attempt < max_retries: a retry is scheduled, so no notification yet.
    run_id, task_id = make_failed_run(max_retries=2, attempt=0)
    with patch("app.scheduler.execute_run"), \
         patch.object(scheduler._scheduler, "add_job"), \
         patch("app.scheduler.notifications.notify_run_failed") as notify:
        scheduler._execute(run_id, task_id)
    assert not notify.called
    # Final attempt: no retry left -> notify.
    run_id, task_id = make_failed_run(max_retries=2, attempt=2)
    with patch("app.scheduler.execute_run"), \
         patch("app.scheduler.notifications.notify_run_failed") as notify:
        scheduler._execute(run_id, task_id)
    notify.assert_called_once_with(run_id)


def make_approval(chat_id: str = "") -> str:
    with db_session() as db:
        task = Task(name="t", prompt="p")
        db.add(task)
        db.commit()
        run = Run(task_id=task.id)
        db.add(run)
        db.commit()
        approval = Approval(run_id=run.id if not chat_id else "",
                            chat_id=chat_id, tool_name="send_gmail",
                            tool_input={"to": "x"})
        db.add(approval)
        db.commit()
        return approval.id


def test_pending_approval_notifies():
    approval_id = make_approval()
    with patch("app.notifications.registry.notify") as notify:
        notifications.notify_approval_pending(approval_id)
    assert notify.call_count == 1
    assert "send_gmail" in notify.call_args.kwargs["subject"]


def test_chat_approval_defaults_off():
    approval_id = make_approval(chat_id="chat1")
    with patch("app.notifications.registry.notify") as notify:
        notifications.notify_approval_pending(approval_id, from_chat=True)
    assert not notify.called


def test_settings_api_roundtrip(client):
    got = client.get("/api/settings/notifications", headers=AUTH).json()
    assert got["notify_on_final_failure"] is True
    assert got["delivery"] in ("email", "stdout")
    updated = client.put("/api/settings/notifications", headers=AUTH, json={
        "notify_on_final_failure": False,
        "notify_on_pending_approval": True,
        "notify_on_chat_approval": True,
        "failure_cooldown_minutes": 15,
    }).json()
    assert updated["notify_on_final_failure"] is False
    assert updated["failure_cooldown_minutes"] == 15
    again = client.get("/api/settings/notifications", headers=AUTH).json()
    assert again["notify_on_chat_approval"] is True
