from __future__ import annotations

from unittest.mock import patch

from app.agent.chat import ChatAgent, generate_chat_title
from app.db import Chat, ChatMessage, db_session


def fake_complete(text: str):
    return {"text": text, "reasoning": "", "tool_calls": [], "raw_assistant_msg": {}}


def make_chat(title: str, messages: list[dict]) -> str:
    with db_session() as db:
        chat = Chat(title=title)
        db.add(chat)
        db.commit()
        for m in messages:
            db.add(ChatMessage(chat_id=chat.id, message=m))
        db.commit()
        return chat.id


def get_title(chat_id: str) -> str:
    with db_session() as db:
        return db.get(Chat, chat_id).title


def test_generate_title_cleans_output():
    with patch("app.agent.chat.providers.complete",
               return_value=fake_complete('"Inbox Digest Setup."\nextra')):
        assert generate_chat_title("hi", "hello") == "Inbox Digest Setup"


def test_generate_title_empty_output():
    with patch("app.agent.chat.providers.complete", return_value=fake_complete("")):
        assert generate_chat_title("hi", "hello") == ""


def test_placeholder_title_gets_replaced():
    cid = make_chat("hi", [
        {"role": "user", "content": "hi"},
        {"role": "assistant", "content": "Hello! How can I help?"},
    ])
    with patch("app.agent.chat.providers.complete",
               return_value=fake_complete("Friendly greeting")):
        ChatAgent(cid)._maybe_title()
    assert get_title(cid) == "Friendly greeting"


def test_anthropic_block_content_supported():
    cid = make_chat("hi", [
        {"role": "user", "content": "hi"},
        {"role": "assistant", "content": [{"type": "text", "text": "Hello there"}]},
    ])
    with patch("app.agent.chat.providers.complete",
               return_value=fake_complete("Quick hello")):
        ChatAgent(cid)._maybe_title()
    assert get_title(cid) == "Quick hello"


def test_custom_title_never_overwritten():
    cid = make_chat("My planning chat", [
        {"role": "user", "content": "hi"},
        {"role": "assistant", "content": "Hello!"},
    ])
    with patch("app.agent.chat.providers.complete",
               return_value=fake_complete("Should not appear")) as complete:
        ChatAgent(cid)._maybe_title()
    assert not complete.called
    assert get_title(cid) == "My planning chat"


def test_no_reply_yet_no_title_call():
    cid = make_chat("hi", [{"role": "user", "content": "hi"}])
    with patch("app.agent.chat.providers.complete",
               return_value=fake_complete("x")) as complete:
        ChatAgent(cid)._maybe_title()
    assert not complete.called


def test_provider_failure_is_swallowed():
    cid = make_chat("hi", [
        {"role": "user", "content": "hi"},
        {"role": "assistant", "content": "Hello!"},
    ])
    with patch("app.agent.chat.providers.complete", side_effect=RuntimeError("boom")):
        ChatAgent(cid)._maybe_title()  # must not raise
    assert get_title(cid) == "hi"
