"""Task/skill management tools — exposed to the CHAT agent only.

These let the user create and manage automations conversationally. They are
kept out of the global TOOLS registry so scheduled task runs cannot spawn or
mutate tasks on their own.
"""
from __future__ import annotations

import json

from ..db import Run, Skill, Task, db_session
from .registry import Tool

# Every agent-drafted task prompt gets these appended server-side, so the
# hard lessons (no fabrication, honest failures) survive regardless of how
# the chat model words the prompt.
GUARDRAILS = """

--- STANDARD GUARDRAILS (auto-appended) ---
- Every number, fact and quote in your output must come from a tool result
  in THIS run. If data is unavailable, say so honestly — never invent
  content or reuse example/sample figures.
- No retry loops, no sleeping. If a step fails twice, report the failure.
- Use purpose-built tools over run_python scraping.
- Deliver output exactly as instructed above; if delivery fails, say so."""


def _cron_valid(cron: str) -> bool:
    if not cron.strip():
        return True
    from apscheduler.triggers.cron import CronTrigger
    try:
        CronTrigger.from_crontab(cron.strip())
        return True
    except ValueError:
        return False


def create_task(name: str, prompt: str, cron: str = "",
                skill_ids: list[str] | None = None) -> str:
    if not _cron_valid(cron):
        return f"Invalid cron expression: {cron!r}. Nothing created."
    from .. import scheduler
    with db_session() as db:
        t = Task(name=name.strip() or "Untitled task",
                 prompt=prompt.rstrip() + GUARDRAILS,
                 skill_ids=skill_ids or [], allowed_tools=[],
                 cron=cron.strip(), enabled="true")
        db.add(t)
        db.commit()
        task_id = t.id
    scheduler.sync_schedules()
    schedule = cron.strip() or "manual (run on demand)"
    return (f"Task created. id={task_id} name={name!r} schedule={schedule}. "
            "Standard honesty guardrails were appended to its prompt.")


def update_task(task_id: str, name: str = "", prompt: str = "",
                cron: str | None = None, enabled: bool | None = None) -> str:
    if cron is not None and not _cron_valid(cron):
        return f"Invalid cron expression: {cron!r}. Nothing changed."
    from .. import scheduler
    with db_session() as db:
        t = db.get(Task, task_id)
        if not t:
            return f"No task with id {task_id}."
        changes = []
        if name.strip():
            t.name = name.strip()
            changes.append("name")
        if prompt.strip():
            t.prompt = prompt.rstrip() + GUARDRAILS
            changes.append("prompt (guardrails re-appended)")
        if cron is not None:
            t.cron = cron.strip()
            changes.append(f"cron -> {cron.strip() or 'manual'}")
        if enabled is not None:
            t.enabled = "true" if enabled else "false"
            changes.append(f"enabled -> {enabled}")
        db.commit()
    scheduler.sync_schedules()
    return f"Task {task_id} updated: {', '.join(changes) or 'no changes given'}."


def list_tasks() -> str:
    with db_session() as db:
        rows = db.query(Task).all()
        return json.dumps([{
            "id": t.id, "name": t.name, "cron": t.cron or "manual",
            "enabled": t.enabled == "true",
            "prompt_preview": t.prompt[:160],
        } for t in rows], ensure_ascii=False, indent=1)


def delete_task(task_id: str) -> str:
    from .. import scheduler
    with db_session() as db:
        t = db.get(Task, task_id)
        if not t:
            return f"No task with id {task_id}."
        name = t.name
        db.delete(t)
        db.commit()
    scheduler.sync_schedules()
    return f"Task {name!r} ({task_id}) deleted, including its run history."


def run_task_now(task_id: str) -> str:
    from .. import scheduler
    with db_session() as db:
        if not db.get(Task, task_id):
            return f"No task with id {task_id}."
    run_id = scheduler.enqueue_run(task_id)
    return f"Run started (run_id={run_id}). The user can watch it under Runs."


def list_recent_runs(limit: int = 10) -> str:
    limit = max(1, min(int(limit), 30))
    with db_session() as db:
        runs = db.query(Run).order_by(Run.created_at.desc()).limit(limit).all()
        return json.dumps([{
            "run_id": r.id, "task_id": r.task_id, "status": r.status.value,
            "started": str(r.created_at)[:19],
            "error": (r.error or "")[:120],
        } for r in runs], ensure_ascii=False, indent=1)


def create_skill(name: str, instructions: str, description: str = "") -> str:
    with db_session() as db:
        s = Skill(name=name.strip(), description=description,
                  instructions=instructions)
        db.add(s)
        db.commit()
        return f"Skill created. id={s.id} name={name!r}."


def list_skills() -> str:
    with db_session() as db:
        rows = db.query(Skill).all()
        return json.dumps([{
            "id": s.id, "name": s.name,
            "instructions_preview": s.instructions[:120],
        } for s in rows], ensure_ascii=False, indent=1)


_OBJ = {"type": "object", "properties": {}}

MANAGEMENT_TOOLS: dict[str, Tool] = {t.name: t for t in [
    Tool(name="create_task",
         description="Create a new automation task. Draft a complete, self-contained prompt (goal, steps, tools, delivery); honesty guardrails are appended automatically. cron empty = manual.",
         input_schema={"type": "object", "properties": {
             "name": {"type": "string"},
             "prompt": {"type": "string"},
             "cron": {"type": "string", "description": "e.g. '0 21 * * MON-FRI'; empty for manual"},
             "skill_ids": {"type": "array", "items": {"type": "string"}},
         }, "required": ["name", "prompt"]},
         fn=create_task),
    Tool(name="update_task",
         description="Update an existing task. Only pass the fields to change; a new prompt fully replaces the old one (confirm with the user first).",
         input_schema={"type": "object", "properties": {
             "task_id": {"type": "string"},
             "name": {"type": "string"},
             "prompt": {"type": "string"},
             "cron": {"type": "string"},
             "enabled": {"type": "boolean"},
         }, "required": ["task_id"]},
         fn=update_task),
    Tool(name="list_tasks",
         description="List all tasks with id, schedule, enabled state and a prompt preview.",
         input_schema=_OBJ, fn=list_tasks),
    Tool(name="delete_task",
         description="Permanently delete a task and its run history. Get explicit confirmation from the user in the conversation before calling this.",
         input_schema={"type": "object", "properties": {
             "task_id": {"type": "string"}}, "required": ["task_id"]},
         fn=delete_task),
    Tool(name="run_task_now",
         description="Start a run of an existing task immediately.",
         input_schema={"type": "object", "properties": {
             "task_id": {"type": "string"}}, "required": ["task_id"]},
         fn=run_task_now),
    Tool(name="list_recent_runs",
         description="List the most recent runs with status and errors.",
         input_schema={"type": "object", "properties": {
             "limit": {"type": "integer", "default": 10}}},
         fn=list_recent_runs),
    Tool(name="create_skill",
         description="Create a reusable instruction block that can be attached to tasks.",
         input_schema={"type": "object", "properties": {
             "name": {"type": "string"},
             "instructions": {"type": "string"},
             "description": {"type": "string"},
         }, "required": ["name", "instructions"]},
         fn=create_skill),
    Tool(name="list_skills",
         description="List all skills with id and an instructions preview.",
         input_schema=_OBJ, fn=list_skills),
]}
