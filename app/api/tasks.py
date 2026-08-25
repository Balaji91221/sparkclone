from __future__ import annotations

import datetime as dt
import secrets

from apscheduler.triggers.cron import CronTrigger
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator, model_validator

from .. import scheduler
from ..db import Task, db_session
from .deps import auth

router = APIRouter(prefix="/api/tasks", dependencies=[Depends(auth)])

TRIGGER_TYPES = ("cron", "interval", "date", "webhook", "manual")


class TaskIn(BaseModel):
    """Validated input used for both creating and updating automations."""

    name: str = Field(min_length=1, max_length=120)
    prompt: str = Field(min_length=1, max_length=20_000)
    skill_ids: list[str] = Field(default_factory=list)
    allowed_tools: list[str] = Field(default_factory=list)
    # Legacy input alias: clients that only know cron. Normalized into
    # trigger_type/trigger_value below; never stored as-is.
    cron: str = Field(default="", max_length=100)
    # "" keeps the legacy behavior: cron set -> cron schedule, else manual.
    trigger_type: str = Field(default="", max_length=20)
    trigger_value: str = Field(default="", max_length=100)
    max_retries: int = Field(default=0, ge=0, le=3)
    enabled: bool = True

    @field_validator("name", "prompt", "cron", "trigger_type", "trigger_value",
                     mode="before")
    @classmethod
    def strip_text(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value

    @model_validator(mode="after")
    def normalize_schedule(self) -> "TaskIn":
        # trigger_type left empty = legacy client (only knows cron). Keep it
        # empty here; _apply decides per task whether to derive cron/manual or
        # preserve an existing interval/date/webhook schedule the legacy UI
        # cannot express (so editing a name never destroys a schedule).
        if not self.trigger_type:
            if not self.cron:
                return self
            self.trigger_type, self.trigger_value = "cron", self.cron
        if self.trigger_type not in TRIGGER_TYPES:
            raise ValueError(
                f"trigger_type must be one of {', '.join(TRIGGER_TYPES)}.")
        if self.trigger_type == "cron":
            try:
                CronTrigger.from_crontab(self.trigger_value)
            except ValueError as exc:
                raise ValueError("Use a valid five-part cron expression, "
                                 "e.g. '0 9 * * MON-FRI'.") from exc
        elif self.trigger_type == "interval":
            try:
                seconds = int(self.trigger_value)
            except ValueError as exc:
                raise ValueError("trigger_value must be a number of seconds "
                                 "for interval schedules.") from exc
            if seconds < scheduler.MIN_INTERVAL_S:
                raise ValueError(f"Minimum interval is {scheduler.MIN_INTERVAL_S} "
                                 "seconds.")
        elif self.trigger_type == "date":
            try:
                # JS clients send a trailing "Z"; Python 3.10 fromisoformat
                # only accepts "+00:00".
                run_at = dt.datetime.fromisoformat(
                    self.trigger_value.replace("Z", "+00:00"))
            except ValueError as exc:
                raise ValueError("trigger_value must be an ISO datetime, e.g. "
                                 "'2026-08-19T09:00:00+00:00'.") from exc
            if run_at.tzinfo is None:
                run_at = run_at.replace(tzinfo=dt.timezone.utc)
            # A disabled one-off has already fired (they self-disable); its
            # past datetime is history, not a scheduling request — editing
            # such a task must not 422.
            if self.enabled and run_at <= dt.datetime.now(dt.timezone.utc):
                raise ValueError("The scheduled datetime is in the past.")
        else:  # webhook | manual
            self.trigger_value = ""
        return self


def _apply(t: Task, body: TaskIn) -> None:
    t.name, t.prompt = body.name, body.prompt
    t.skill_ids, t.allowed_tools = body.skill_ids, body.allowed_tools
    t.max_retries = body.max_retries
    t.enabled = "true" if body.enabled else "false"
    if body.trigger_type:
        t.trigger_type, t.trigger_value = body.trigger_type, body.trigger_value
    elif scheduler.effective_trigger_type(t) in ("interval", "date", "webhook"):
        pass  # legacy client editing other fields — keep the schedule as-is
    else:
        t.trigger_type, t.trigger_value = "manual", ""
    if t.trigger_type == "webhook" and not t.webhook_secret:
        t.webhook_secret = secrets.token_urlsafe(24)


def _task_out(t: Task) -> dict:
    kind = scheduler.effective_trigger_type(t)
    return {"id": t.id, "name": t.name, "prompt": t.prompt,
            "trigger_type": kind, "trigger_value": t.trigger_value,
            "max_retries": t.max_retries or 0,
            "skill_ids": t.skill_ids, "allowed_tools": t.allowed_tools,
            "enabled": t.enabled == "true",
            "next_run_at": scheduler.next_run_at(t.id),
            "webhook_url": (f"/api/hooks/{t.id}/{t.webhook_secret}"
                            if kind == "webhook" and t.webhook_secret else None)}


@router.post("")
def create_task(body: TaskIn):
    with db_session() as db:
        t = Task()
        _apply(t, body)
        db.add(t)
        db.commit()
        task_id = t.id
    scheduler.sync_schedules()
    return {"id": task_id}


@router.get("")
def list_tasks():
    with db_session() as db:
        return [_task_out(t) for t in db.query(Task).all()]


@router.put("/{task_id}")
def update_task(task_id: str, body: TaskIn):
    with db_session() as db:
        t = db.get(Task, task_id)
        if not t:
            raise HTTPException(404)
        _apply(t, body)
        db.commit()
    scheduler.sync_schedules()
    return {"ok": True}


@router.delete("/{task_id}")
def delete_task(task_id: str):
    with db_session() as db:
        t = db.get(Task, task_id)
        if not t:
            raise HTTPException(404)
        db.delete(t)
        db.commit()
    scheduler.sync_schedules()
    return {"ok": True}


@router.post("/{task_id}/run")
def run_task(task_id: str):
    with db_session() as db:
        if not db.get(Task, task_id):
            raise HTTPException(404)
    return {"run_id": scheduler.enqueue_run(task_id)}


@router.post("/{task_id}/webhook-secret")
def rotate_webhook_secret(task_id: str):
    """Regenerate the task's webhook secret (invalidates the old URL)."""
    with db_session() as db:
        t = db.get(Task, task_id)
        if not t:
            raise HTTPException(404)
        t.webhook_secret = secrets.token_urlsafe(24)
        db.commit()
        return {"webhook_url": f"/api/hooks/{t.id}/{t.webhook_secret}"}
