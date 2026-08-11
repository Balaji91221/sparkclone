from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import update

from .. import scheduler
from ..agent.chat import run_chat_turn
from ..db import Chat, ChatMessage, db_session, utcnow
from .deps import auth

router = APIRouter(prefix="/api/chats", dependencies=[Depends(auth)])


class MessageIn(BaseModel):
    content: str


@router.post("")
def create_chat():
    with db_session() as db:
        chat = Chat()
        db.add(chat)
        db.commit()
        return {"id": chat.id}


@router.get("")
def list_chats():
    with db_session() as db:
        chats = db.query(Chat).order_by(Chat.updated_at.desc()).limit(50).all()
        return [{"id": c.id, "title": c.title, "status": c.status,
                 "updated_at": str(c.updated_at)} for c in chats]


@router.get("/{chat_id}")
def get_chat(chat_id: str):
    with db_session() as db:
        chat = db.get(Chat, chat_id)
        if not chat:
            raise HTTPException(404)
        rows = (db.query(ChatMessage).filter(ChatMessage.chat_id == chat_id)
                .order_by(ChatMessage.created_at).all())
        return {"id": chat.id, "title": chat.title, "status": chat.status,
                "messages": [r.message for r in rows]}


@router.post("/{chat_id}/messages")
def send_message(chat_id: str, body: MessageIn):
    content = body.content.strip()
    if not content:
        raise HTTPException(400, "empty message")
    with db_session() as db:
        chat = db.get(Chat, chat_id)
        if not chat:
            raise HTTPException(404)
        # Atomic claim: only one in-flight turn per chat.
        claimed = db.execute(
            update(Chat).where(Chat.id == chat_id, Chat.status == "idle")
            .values(status="thinking", updated_at=utcnow())).rowcount
        if not claimed:
            db.rollback()
            raise HTTPException(409, "The agent is still working on this chat.")
        if chat.title == "New chat":
            chat.title = content[:60]
        db.add(ChatMessage(chat_id=chat_id,
                           message={"role": "user", "content": content}))
        db.commit()
    scheduler.submit(run_chat_turn, chat_id)
    return {"ok": True}


@router.delete("/{chat_id}")
def delete_chat(chat_id: str):
    with db_session() as db:
        chat = db.get(Chat, chat_id)
        if not chat:
            raise HTTPException(404)
        db.query(ChatMessage).filter(ChatMessage.chat_id == chat_id).delete()
        db.delete(chat)
        db.commit()
    return {"ok": True}
