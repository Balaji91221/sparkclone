from __future__ import annotations

from unittest.mock import patch

from app.db import Task, db_session
from tests.conftest import AUTH


def make_webhook_task(client) -> dict:
    res = client.post("/api/tasks", headers=AUTH, json={
        "name": "hooked", "prompt": "run on event", "trigger_type": "webhook"})
    assert res.status_code == 200
    tasks = client.get("/api/tasks", headers=AUTH).json()
    return next(t for t in tasks if t["id"] == res.json()["id"])


def test_webhook_task_gets_secret_url(client):
    task = make_webhook_task(client)
    assert task["trigger_type"] == "webhook"
    assert task["webhook_url"].startswith(f"/api/hooks/{task['id']}/")


def test_wrong_secret_is_404(client):
    task = make_webhook_task(client)
    res = client.post(f"/api/hooks/{task['id']}/wrong-secret")
    assert res.status_code == 404


def test_unknown_task_is_404(client):
    assert client.post("/api/hooks/nope/whatever").status_code == 404


def test_correct_secret_enqueues_run(client):
    task = make_webhook_task(client)
    with patch("app.scheduler._executor") as ex:  # don't run the real agent
        res = client.post(task["webhook_url"])
    assert res.status_code == 200
    assert res.json()["run_id"]
    assert ex.submit.called


def test_rate_limited_within_window(client):
    task = make_webhook_task(client)
    with patch("app.scheduler._executor"):
        assert client.post(task["webhook_url"]).status_code == 200
        assert client.post(task["webhook_url"]).status_code == 429


def test_disabled_task_is_409(client):
    task = make_webhook_task(client)
    with db_session() as db:
        db.get(Task, task["id"]).enabled = "false"
        db.commit()
    assert client.post(task["webhook_url"]).status_code == 409


def test_rotate_secret_invalidates_old_url(client):
    task = make_webhook_task(client)
    new_url = client.post(f"/api/tasks/{task['id']}/webhook-secret",
                          headers=AUTH).json()["webhook_url"]
    assert new_url != task["webhook_url"]
    assert client.post(task["webhook_url"]).status_code == 404
