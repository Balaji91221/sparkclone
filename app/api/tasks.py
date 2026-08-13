from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from apscheduler.triggers.cron import CronTrigger
from pydantic import BaseModel, Field, field_validator

from .. import scheduler
from ..db import Task, db_session
from .deps import auth

router = APIRouter(prefix="/api/tasks", dependencies=[Depends(auth)])


class TaskIn(BaseModel):
    """Validated input used for both creating and updating automations."""

    name: str = Field(min_length=1, max_length=120)
    prompt: str = Field(min_length=1, max_length=20_000)
    skill_ids: list[str] = Field(default_factory=list)
    allowed_tools: list[str] = Field(default_factory=list)
    cron: str = Field(default="", max_length=100)
    enabled: bool = True

    @field_validator("name", "prompt", "cron", mode="before")
    @classmethod
    def strip_text(cls, value: object) -> str:
        return value.strip() if isinstance(value, str) else value

    @field_validator("cron")
    @classmethod
    def validate_cron(cls, value: str) -> str:
        if not value:
            return value
        try:
            CronTrigger.from_crontab(value)
        except ValueError as exc:
            raise ValueError("Use a valid five-part cron expression, e.g. '0 9 * * MON-FRI'.") from exc
        return value


@router.post("")
def create_task(body: TaskIn):
    with db_session() as db:
        t = Task(name=body.name, prompt=body.prompt, skill_ids=body.skill_ids,
                 allowed_tools=body.allowed_tools, cron=body.cron,
                 enabled="true" if body.enabled else "false")
        db.add(t)
        db.commit()
        task_id = t.id
    scheduler.sync_schedules()
    return {"id": task_id}


@router.get("")
def list_tasks():
    with db_session() as db:
        return [{"id": t.id, "name": t.name, "prompt": t.prompt, "cron": t.cron,
                 "skill_ids": t.skill_ids, "allowed_tools": t.allowed_tools,
                 "enabled": t.enabled == "true"} for t in db.query(Task).all()]


@router.put("/{task_id}")
def update_task(task_id: str, body: TaskIn):
    with db_session() as db:
        t = db.get(Task, task_id)
        if not t:
            raise HTTPException(404)
        t.name, t.prompt, t.cron = body.name, body.prompt, body.cron
        t.skill_ids, t.allowed_tools = body.skill_ids, body.allowed_tools
        t.enabled = "true" if body.enabled else "false"
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
