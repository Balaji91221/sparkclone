"""Task/skill management tools — exposed to the CHAT agent only.

These let the user create and manage automations conversationally. They are
kept out of the global TOOLS registry so scheduled task runs cannot spawn or
mutate tasks on their own.
"""
from __future__ import annotations

import datetime as dt
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


def _parse_run_at(run_at: str) -> dt.datetime | str:
    """ISO datetime in the future, or an error message string."""
    try:
        # "Z" suffix normalization for Python 3.10's fromisoformat.
        when = dt.datetime.fromisoformat(run_at.strip().replace("Z", "+00:00"))
    except ValueError:
        return (f"Invalid datetime: {run_at!r}. Use ISO format, e.g. "
                "'2026-08-19T09:00:00+05:30'.")
    if when.tzinfo is None:
        when = when.replace(tzinfo=dt.timezone.utc)
    if when <= dt.datetime.now(dt.timezone.utc):
        return f"{run_at!r} is in the past. Nothing created."
    return when


def create_task(name: str, prompt: str, cron: str = "",
                interval_minutes: int = 0, run_at: str = "",
                skill_ids: list[str] | None = None,
                allowed_tools: list[str] | None = None) -> str:
    from .. import scheduler
    given = sum(bool(x) for x in (cron.strip(), interval_minutes, run_at.strip()))
    if given > 1:
        return "Give at most one of cron, interval_minutes, or run_at."
    trigger_type, trigger_value = "manual", ""
    if cron.strip():
        if not _cron_valid(cron):
            return f"Invalid cron expression: {cron!r}. Nothing created."
        trigger_type, trigger_value = "cron", cron.strip()
    elif interval_minutes:
        if interval_minutes * 60 < scheduler.MIN_INTERVAL_S:
            return (f"Minimum interval is {scheduler.MIN_INTERVAL_S // 60} "
                    "minute(s). Nothing created.")
        trigger_type, trigger_value = "interval", str(int(interval_minutes) * 60)
    elif run_at.strip():
        when = _parse_run_at(run_at)
        if isinstance(when, str):
            return when
        trigger_type, trigger_value = "date", when.isoformat()
    with db_session() as db:
        t = Task(name=name.strip() or "Untitled task",
                 prompt=prompt.rstrip() + GUARDRAILS,
                 skill_ids=skill_ids or [], allowed_tools=allowed_tools or [],
                 trigger_type=trigger_type, trigger_value=trigger_value,
                 enabled="true")
        db.add(t)
        db.commit()
        task_id = t.id
    scheduler.sync_schedules()
    schedule = {
        "cron": trigger_value,
        "interval": f"every {interval_minutes} minute(s)",
        "date": f"once at {trigger_value}",
        "manual": "manual (run on demand)",
    }[trigger_type]
    return (f"Task created. id={task_id} name={name!r} schedule={schedule}. "
            "Standard honesty guardrails were appended to its prompt.")


def schedule_task_once(name: str, prompt: str, run_at: str) -> str:
    """One-off reminder/run at a specific datetime; disables itself after."""
    return create_task(name=name, prompt=prompt, run_at=run_at)


def set_reminder(message: str, run_at: str) -> str:
    """One-off notification at a datetime. Unlike schedule_task_once, the
    resulting task can ONLY call notify — it cannot touch email, files, or
    the web — so it is safe for verbatim reminder delivery."""
    text = message.strip()
    if not text:
        return "Give the reminder a message. Nothing created."
    prompt = ("Call the notify tool exactly once with exactly this message, "
              f"then stop: {text}")
    return create_task(name=f"Reminder: {text[:60]}", prompt=prompt,
                       run_at=run_at, allowed_tools=["notify"])


def update_task(task_id: str, name: str = "", prompt: str = "",
                cron: str | None = None, interval_minutes: int | None = None,
                run_at: str | None = None, enabled: bool | None = None) -> str:
    from .. import scheduler
    given = sum(x is not None for x in (cron, interval_minutes, run_at))
    if given > 1:
        return "Give at most one of cron, interval_minutes, or run_at."
    schedule: tuple[str, str] | None = None  # (trigger_type, trigger_value)
    if cron is not None:
        if not _cron_valid(cron):
            return f"Invalid cron expression: {cron!r}. Nothing changed."
        schedule = ("cron", cron.strip()) if cron.strip() else ("manual", "")
    elif interval_minutes is not None:
        if interval_minutes * 60 < scheduler.MIN_INTERVAL_S:
            return (f"Minimum interval is {scheduler.MIN_INTERVAL_S // 60} "
                    "minute(s). Nothing changed.")
        schedule = ("interval", str(int(interval_minutes) * 60))
    elif run_at is not None:
        when = _parse_run_at(run_at)
        if isinstance(when, str):
            return when
        schedule = ("date", when.isoformat())
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
        if schedule is not None:
            t.trigger_type, t.trigger_value = schedule
            changes.append(f"schedule -> {schedule[0]} {schedule[1]}".rstrip())
        if enabled is not None:
            t.enabled = "true" if enabled else "false"
            changes.append(f"enabled -> {enabled}")
        db.commit()
    scheduler.sync_schedules()
    return f"Task {task_id} updated: {', '.join(changes) or 'no changes given'}."


def list_tasks() -> str:
    with db_session() as db:
        rows = db.query(Task).all()
        from .. import scheduler
        return json.dumps([{
            "id": t.id, "name": t.name,
            "schedule": {
                "cron": t.trigger_value,
                "interval": f"every {int(t.trigger_value or 0) // 60} min",
                "date": f"once at {t.trigger_value}",
                "webhook": "webhook-triggered",
                "manual": "manual",
            }[scheduler.effective_trigger_type(t)],
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
         description="Create a new automation task. Draft a complete, self-contained prompt (goal, steps, tools, delivery); honesty guardrails are appended automatically. Give AT MOST ONE schedule: cron (recurring calendar pattern), interval_minutes (every N minutes, min 1), or run_at (one-off ISO datetime). All empty = manual run-on-demand.",
         input_schema={"type": "object", "properties": {
             "name": {"type": "string"},
             "prompt": {"type": "string"},
             "cron": {"type": "string", "description": "e.g. '0 21 * * MON-FRI'; empty for none"},
             "interval_minutes": {"type": "integer", "description": "run every N minutes (min 1)"},
             "run_at": {"type": "string", "description": "one-off ISO datetime, e.g. '2026-08-19T09:00:00+05:30'"},
             "skill_ids": {"type": "array", "items": {"type": "string"}},
         }, "required": ["name", "prompt"]},
         fn=create_task),
    Tool(name="schedule_task_once",
         description="Schedule a one-off run/reminder at a specific datetime ('remind me tomorrow at 9am'). The task fires exactly once, then disables itself. run_at is an ISO datetime with timezone offset.",
         input_schema={"type": "object", "properties": {
             "name": {"type": "string"},
             "prompt": {"type": "string"},
             "run_at": {"type": "string", "description": "ISO datetime, e.g. '2026-08-19T09:00:00+05:30'"},
         }, "required": ["name", "prompt", "run_at"]},
         fn=schedule_task_once),
    Tool(name="set_reminder",
         description="Set a one-off reminder ('remind me at 9pm to stretch'). Delivers the given message verbatim via the user's notification channel at run_at, then the task disables itself. Prefer this over schedule_task_once for plain reminders — the created task can only notify, nothing else.",
         input_schema={"type": "object", "properties": {
             "message": {"type": "string", "description": "The reminder text, delivered as-is"},
             "run_at": {"type": "string", "description": "ISO datetime, e.g. '2026-08-25T21:00:00+05:30'"},
         }, "required": ["message", "run_at"]},
         fn=set_reminder),
    Tool(name="update_task",
         description="Update an existing task. Only pass the fields to change; a new prompt fully replaces the old one (confirm with the user first). To change the schedule pass exactly one of: cron (empty string = manual), interval_minutes, or run_at.",
         input_schema={"type": "object", "properties": {
             "task_id": {"type": "string"},
             "name": {"type": "string"},
             "prompt": {"type": "string"},
             "cron": {"type": "string", "description": "recurring calendar schedule; '' = manual"},
             "interval_minutes": {"type": "integer", "description": "run every N minutes (min 1)"},
             "run_at": {"type": "string", "description": "one-off ISO datetime"},
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
