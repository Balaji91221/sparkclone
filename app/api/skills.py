from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..db import Skill, db_session
from .deps import auth

router = APIRouter(prefix="/api/skills", dependencies=[Depends(auth)])


class SkillIn(BaseModel):
    name: str
    description: str = ""
    instructions: str


@router.post("")
def create_skill(body: SkillIn):
    with db_session() as db:
        s = Skill(**body.model_dump())
        db.add(s)
        db.commit()
        return {"id": s.id}


@router.get("")
def list_skills():
    with db_session() as db:
        return [{"id": s.id, "name": s.name, "description": s.description,
                 "instructions": s.instructions} for s in db.query(Skill).all()]


@router.delete("/{skill_id}")
def delete_skill(skill_id: str):
    with db_session() as db:
        s = db.get(Skill, skill_id)
        if not s:
            raise HTTPException(404)
        db.delete(s)
        db.commit()
    return {"ok": True}
