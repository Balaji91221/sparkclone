"""Schedule-preservation and chat-tool update behavior."""
from __future__ import annotations

import datetime as dt

from app.db import Task, db_session
from app.tools import management
from tests.conftest import AUTH

LEGACY_BODY = {"name": "renamed", "prompt": "p", "cron": "",
               "skill_ids": [], "allowed_tools": [], "enabled": True}


def future_iso(minutes: int = 10) -> str:
    return (dt.datetime.now(dt.timezone.utc)
            + dt.timedelta(minutes=minutes)).isoformat()


def get_task(client, task_id: str) -> dict:
    return next(t for t in client.get("/api/tasks", headers=AUTH).json()
                if t["id"] == task_id)


def test_legacy_update_preserves_webhook_schedule(client):
    tid = client.post("/api/tasks", headers=AUTH, json={
        "name": "hooked", "prompt": "p", "trigger_type": "webhook"}).json()["id"]
    old_url = get_task(client, tid)["webhook_url"]
    assert client.put(f"/api/tasks/{tid}", headers=AUTH,
                      json=LEGACY_BODY).status_code == 200
    t = get_task(client, tid)
    assert t["name"] == "renamed"
    assert t["trigger_type"] == "webhook"
    assert t["webhook_url"] == old_url


def test_legacy_update_clears_cron_to_manual(client):
    tid = client.post("/api/tasks", headers=AUTH, json={
        "name": "c", "prompt": "p", "cron": "0 9 * * *"}).json()["id"]
    client.put(f"/api/tasks/{tid}", headers=AUTH, json=LEGACY_BODY)
    assert get_task(client, tid)["trigger_type"] == "manual"


def test_chat_update_switches_interval_to_cron():
    out = management.create_task(name="i", prompt="p", interval_minutes=15)
    task_id = out.split("id=")[1].split()[0]
    management.update_task(task_id, cron="0 21 * * *")
    with db_session() as db:
        t = db.get(Task, task_id)
        assert t.trigger_type == "cron"
        assert t.trigger_value == "0 21 * * *"


def test_chat_update_rejects_two_schedules():
    out = management.create_task(name="x", prompt="p")
    task_id = out.split("id=")[1].split()[0]
    msg = management.update_task(task_id, cron="0 9 * * *", interval_minutes=5)
    assert "at most one" in msg


def test_chat_schedule_task_once():
    out = management.schedule_task_once("remind", "say hi", future_iso())
    assert "once at" in out
    task_id = out.split("id=")[1].split()[0]
    with db_session() as db:
        assert db.get(Task, task_id).trigger_type == "date"


def test_chat_create_rejects_past_run_at():
    msg = management.create_task(name="r", prompt="p",
                                 run_at="2020-01-01T00:00:00+00:00")
    assert "past" in msg
