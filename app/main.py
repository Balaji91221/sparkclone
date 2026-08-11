from __future__ import annotations

from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel

from . import scheduler
from .auth.google_oauth import router as google_router
from .config import settings
from .db import (Approval, Run, RunStatus, Skill, Task, db_session, init_db,
                 utcnow)

app = FastAPI(title="SparkClone", version="1.0.0")
app.include_router(google_router)
WEB_DIR = Path(__file__).resolve().parent.parent / "web"


@app.on_event("startup")
def _startup() -> None:
    init_db()
    scheduler.start()


def auth(request: Request) -> None:
    token = request.headers.get("authorization", "").removeprefix("Bearer ").strip()
    if token != settings.api_token:
        raise HTTPException(401, "Invalid or missing API token")


# ------------------------------------------------------------------ schemas

class SkillIn(BaseModel):
    name: str
    description: str = ""
    instructions: str


class TaskIn(BaseModel):
    name: str
    prompt: str
    skill_ids: list[str] = []
    allowed_tools: list[str] = []
    cron: str = ""
    enabled: bool = True


# ------------------------------------------------------------------- skills

@app.post("/api/skills", dependencies=[Depends(auth)])
def create_skill(body: SkillIn):
    with db_session() as db:
        s = Skill(**body.model_dump())
        db.add(s)
        db.commit()
        return {"id": s.id}


@app.get("/api/skills", dependencies=[Depends(auth)])
def list_skills():
    with db_session() as db:
        return [{"id": s.id, "name": s.name, "description": s.description,
                 "instructions": s.instructions} for s in db.query(Skill).all()]


@app.delete("/api/skills/{skill_id}", dependencies=[Depends(auth)])
def delete_skill(skill_id: str):
    with db_session() as db:
        s = db.get(Skill, skill_id)
        if not s:
            raise HTTPException(404)
        db.delete(s)
        db.commit()
    return {"ok": True}


# -------------------------------------------------------------------- tasks

@app.post("/api/tasks", dependencies=[Depends(auth)])
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


@app.get("/api/tasks", dependencies=[Depends(auth)])
def list_tasks():
    with db_session() as db:
        return [{"id": t.id, "name": t.name, "prompt": t.prompt, "cron": t.cron,
                 "skill_ids": t.skill_ids, "allowed_tools": t.allowed_tools,
                 "enabled": t.enabled == "true"} for t in db.query(Task).all()]


@app.put("/api/tasks/{task_id}", dependencies=[Depends(auth)])
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


@app.delete("/api/tasks/{task_id}", dependencies=[Depends(auth)])
def delete_task(task_id: str):
    with db_session() as db:
        t = db.get(Task, task_id)
        if not t:
            raise HTTPException(404)
        db.delete(t)
        db.commit()
    scheduler.sync_schedules()
    return {"ok": True}


@app.post("/api/tasks/{task_id}/run", dependencies=[Depends(auth)])
def run_task(task_id: str):
    with db_session() as db:
        if not db.get(Task, task_id):
            raise HTTPException(404)
    return {"run_id": scheduler.enqueue_run(task_id)}


# --------------------------------------------------------------------- runs

@app.get("/api/runs", dependencies=[Depends(auth)])
def list_runs(limit: int = 50):
    with db_session() as db:
        runs = (db.query(Run).order_by(Run.created_at.desc()).limit(limit).all())
        return [{"id": r.id, "task_id": r.task_id, "status": r.status.value,
                 "trigger": r.trigger, "created_at": str(r.created_at),
                 "finished_at": str(r.finished_at) if r.finished_at else None,
                 "output": r.output[:500], "error": r.error[:500]} for r in runs]


@app.get("/api/runs/{run_id}", dependencies=[Depends(auth)])
def get_run(run_id: str):
    with db_session() as db:
        r = db.get(Run, run_id)
        if not r:
            raise HTTPException(404)
        return {"id": r.id, "task_id": r.task_id, "status": r.status.value,
                "output": r.output, "error": r.error, "transcript": r.transcript}


# ---------------------------------------------------------------- approvals

@app.get("/api/approvals", dependencies=[Depends(auth)])
def list_approvals():
    with db_session() as db:
        pending = db.query(Approval).filter(Approval.status == "pending").all()
        return [{"id": a.id, "run_id": a.run_id, "tool_name": a.tool_name,
                 "tool_input": a.tool_input, "created_at": str(a.created_at)}
                for a in pending]


@app.post("/api/approvals/{approval_id}/{decision}", dependencies=[Depends(auth)])
def resolve_approval(approval_id: str, decision: str):
    if decision not in ("approve", "deny"):
        raise HTTPException(400, "decision must be approve or deny")
    with db_session() as db:
        a = db.get(Approval, approval_id)
        if not a:
            raise HTTPException(404)
        a.status = "approved" if decision == "approve" else "denied"
        a.resolved_at = utcnow()
        db.commit()
    return {"ok": True}


# ---------------------------------------------------------------- dashboard

@app.get("/")
def dashboard():
    return FileResponse(WEB_DIR / "index.html")


@app.get("/health")
def health():
    return {"ok": True}
