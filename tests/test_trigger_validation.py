from __future__ import annotations

import datetime as dt

import pytest
from pydantic import ValidationError

from app.api.tasks import TaskIn

BASE = {"name": "t", "prompt": "do the thing"}


def future_iso(minutes: int = 10) -> str:
    return (dt.datetime.now(dt.timezone.utc)
            + dt.timedelta(minutes=minutes)).isoformat()


def test_legacy_cron_field_still_works():
    t = TaskIn(**BASE, cron="0 9 * * MON")
    assert t.trigger_type == "cron"
    assert t.trigger_value == "0 9 * * MON"


def test_no_schedule_stays_unspecified():
    # "" = legacy client; _apply derives manual for new tasks but preserves
    # interval/date/webhook schedules on update.
    t = TaskIn(**BASE)
    assert t.trigger_type == ""
    assert t.trigger_value == ""


def test_bad_cron_rejected():
    with pytest.raises(ValidationError):
        TaskIn(**BASE, trigger_type="cron", trigger_value="not a cron")


def test_interval_below_minimum_rejected():
    with pytest.raises(ValidationError):
        TaskIn(**BASE, trigger_type="interval", trigger_value="30")


def test_interval_valid():
    t = TaskIn(**BASE, trigger_type="interval", trigger_value="900")
    assert t.cron == ""


def test_date_in_past_rejected():
    with pytest.raises(ValidationError):
        TaskIn(**BASE, trigger_type="date",
               trigger_value="2020-01-01T00:00:00+00:00")


def test_past_date_allowed_when_disabled():
    # A fired one-off self-disables; editing (e.g. renaming) it re-submits its
    # past datetime and must not be rejected.
    t = TaskIn(**BASE, trigger_type="date",
               trigger_value="2020-01-01T00:00:00+00:00", enabled=False)
    assert t.trigger_type == "date"


def test_date_not_iso_rejected():
    with pytest.raises(ValidationError):
        TaskIn(**BASE, trigger_type="date", trigger_value="tomorrow 9am")


def test_date_valid():
    t = TaskIn(**BASE, trigger_type="date", trigger_value=future_iso())
    assert t.trigger_type == "date"


def test_unknown_trigger_type_rejected():
    with pytest.raises(ValidationError):
        TaskIn(**BASE, trigger_type="fortnightly")


def test_max_retries_bounds():
    with pytest.raises(ValidationError):
        TaskIn(**BASE, max_retries=4)
    assert TaskIn(**BASE, max_retries=3).max_retries == 3
