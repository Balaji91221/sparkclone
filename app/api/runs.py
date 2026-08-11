from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from ..db import Run, Task, db_session
from .deps import auth

router = APIRouter(prefix="/api/runs", dependencies=[Depends(auth)])


@router.get("")
def list_runs(limit: int = 50):
    limit = max(1, min(limit, 200))
    with db_session() as db:
        runs = db.query(Run).order_by(Run.created_at.desc()).limit(limit).all()
        return [{"id": r.id, "task_id": r.task_id, "status": r.status.value,
                 "trigger": r.trigger, "created_at": str(r.created_at),
                 "finished_at": str(r.finished_at) if r.finished_at else None,
                 "output": r.output[:500], "error": r.error[:500]} for r in runs]


@router.get("/{run_id}")
def get_run(run_id: str):
    with db_session() as db:
        r = db.get(Run, run_id)
        if not r:
            raise HTTPException(404)
        task = db.get(Task, r.task_id)
        return {"id": r.id, "task_id": r.task_id, "status": r.status.value,
                "task_name": task.name if task else "",
                "trigger": r.trigger, "created_at": str(r.created_at),
                "finished_at": str(r.finished_at) if r.finished_at else None,
                "output": r.output, "error": r.error, "transcript": r.transcript}
