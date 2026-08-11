from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from ..db import Approval, db_session, utcnow
from .deps import auth

router = APIRouter(prefix="/api/approvals", dependencies=[Depends(auth)])


@router.get("")
def list_approvals():
    with db_session() as db:
        pending = db.query(Approval).filter(Approval.status == "pending").all()
        return [{"id": a.id, "run_id": a.run_id, "tool_name": a.tool_name,
                 "tool_input": a.tool_input, "created_at": str(a.created_at)}
                for a in pending]


@router.post("/{approval_id}/{decision}")
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
