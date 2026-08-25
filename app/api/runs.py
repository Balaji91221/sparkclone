from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from ..db import Run, Task, db_session
from .deps import auth

router = APIRouter(prefix="/api/runs", dependencies=[Depends(auth)])


@router.get("")
def list_runs(limit: int = 50, task_id: str = ""):
    limit = max(1, min(limit, 200))
    with db_session() as db:
        q = (db.query(Run, Task.name)
             .outerjoin(Task, Task.id == Run.task_id)
             .order_by(Run.created_at.desc()))
        if task_id:
            q = q.filter(Run.task_id == task_id)
        rows = q.limit(limit).all()
        return [{"id": r.id, "task_id": r.task_id, "task_name": name or "",
                 "status": r.status.value, "trigger": r.trigger,
                 "attempt": r.attempt or 0,
                 "created_at": str(r.created_at),
                 "started_at": str(r.started_at) if r.started_at else None,
                 "finished_at": str(r.finished_at) if r.finished_at else None,
                 "output": r.output[:500], "error": r.error[:500]}
                for r, name in rows]


@router.get("/{run_id}")
def get_run(run_id: str):
    with db_session() as db:
        r = db.get(Run, run_id)
        if not r:
            raise HTTPException(404)
        task = db.get(Task, r.task_id)
        # Retry chains have no parent-run FK; siblings of the same task
        # ordered by recency stand in for one (attempt marks retries).
        siblings = (db.query(Run)
                    .filter(Run.task_id == r.task_id, Run.id != r.id)
                    .order_by(Run.created_at.desc())
                    .limit(10).all())
        return {"id": r.id, "task_id": r.task_id, "status": r.status.value,
                "task_name": task.name if task else "",
                "trigger": r.trigger, "attempt": r.attempt or 0,
                "created_at": str(r.created_at),
                "started_at": str(r.started_at) if r.started_at else None,
                "finished_at": str(r.finished_at) if r.finished_at else None,
                "output": r.output, "error": r.error, "transcript": r.transcript,
                "related": [{"id": s.id, "status": s.status.value,
                             "attempt": s.attempt or 0, "trigger": s.trigger,
                             "created_at": str(s.created_at)}
                            for s in siblings]}
