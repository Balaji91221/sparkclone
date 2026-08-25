"""Calendar tools and the set_reminder chat tool."""
from __future__ import annotations

import datetime as dt
from unittest.mock import patch

from app.db import Task, db_session
from app.google import client as gclient
from app.tools import management
from app.tools.registry import TOOLS


def future_iso(minutes: int = 10) -> str:
    return (dt.datetime.now(dt.timezone.utc)
            + dt.timedelta(minutes=minutes)).isoformat()


def test_calendar_tools_registered_and_gated():
    assert "list_calendar_events" in TOOLS
    assert not TOOLS["list_calendar_events"].requires_approval
    assert TOOLS["create_calendar_event"].requires_approval


def test_calendar_disconnected_returns_guidance():
    with patch("app.auth.google_oauth.get_access_token", return_value=None):
        out = gclient.calendar_list_events(future_iso(), future_iso(60))
    assert out == gclient.RECONNECT_MSG


def test_event_time_shapes():
    assert gclient._event_time("2026-08-25") == {"date": "2026-08-25"}
    assert gclient._event_time("2026-08-25T15:00:00+05:30") == {
        "dateTime": "2026-08-25T15:00:00+05:30"}
    assert gclient._event_time("2026-08-25T15:00:00Z") == {
        "dateTime": "2026-08-25T15:00:00Z"}
    assert "Invalid datetime" in gclient._event_time("next tuesday")


def test_create_event_rejects_bad_datetime_before_any_call():
    with patch("app.google.client.get_access_token", return_value="tok"):
        out = gclient.calendar_create_event("Lunch", "not-a-date", "also-bad")
    assert "Invalid datetime" in out


def test_set_reminder_creates_notify_only_task():
    out = management.set_reminder("stretch your legs", future_iso())
    assert "Task created" in out
    task_id = out.split("id=")[1].split()[0]
    with db_session() as db:
        t = db.get(Task, task_id)
        assert t.trigger_type == "date"
        assert t.allowed_tools == ["notify"]
        assert "stretch your legs" in t.prompt


def test_set_reminder_rejects_empty_and_past():
    assert "Nothing created" in management.set_reminder("   ", future_iso())
    assert "past" in management.set_reminder(
        "hi", "2020-01-01T00:00:00+00:00")


def test_set_reminder_is_a_management_tool():
    assert "set_reminder" in management.MANAGEMENT_TOOLS
    assert "set_reminder" not in TOOLS  # chat-only: runs must not self-schedule
