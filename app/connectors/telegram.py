"""Telegram connector: a bot token from @BotFather. The token is part of the
API URL, so every error path is scrubbed before it leaves this module."""
from __future__ import annotations

import sys
from typing import Any

from .base import (
    ConnectorError,
    ConnectorSpec,
    ConnectorTool,
    Field,
    chunks,
    clamp,
    request_json,
    wrap,
)

API = "https://api.telegram.org"
MAX_MESSAGE = 4096


def _api(config: dict[str, str], method: str, **params: Any) -> Any:
    token = config.get("bot_token", "")
    data = request_json("POST", f"{API}/bot{token}/{method}", secrets=(token,),
                        json=params or None)
    if not isinstance(data, dict) or not data.get("ok"):
        desc = data.get("description", "unknown error") if isinstance(data, dict) else "bad response"
        raise ConnectorError(f"Telegram {method} failed: {desc}")
    return data.get("result")


def _updates(config: dict[str, str], limit: int) -> list[dict]:
    res = _api(config, "getUpdates", limit=limit)
    out = []
    for u in res or []:
        msg = u.get("message") or u.get("channel_post") or {}
        if not msg:
            continue
        chat = msg.get("chat") or {}
        sender = msg.get("from") or {}
        out.append({
            "chat_id": chat.get("id", ""),
            "chat": chat.get("title") or chat.get("username") or chat.get("first_name", ""),
            "from": sender.get("username") or sender.get("first_name", ""),
            "date": msg.get("date", ""),
            "text": (msg.get("text") or msg.get("caption") or "")[:2000],
        })
    return out


def verify(config: dict[str, str]) -> str:
    me = _api(config, "getMe")
    if not config.get("chat_id", "").strip():
        # Discover the chat from the most recent message sent to the bot.
        try:
            recent = _updates(config, 20)
        except ConnectorError:
            recent = []
        if recent:
            config["chat_id"] = str(recent[-1]["chat_id"])
    return f"@{me.get('username', 'bot')}" if isinstance(me, dict) else "bot"


def read_updates(config: dict[str, str], limit: int = 20) -> str:
    return wrap(_updates(config, clamp(limit, 1, 100, 20)))


def send_message(config: dict[str, str], text: str, chat_id: str = "") -> str:
    target = (chat_id or config.get("chat_id", "")).strip()
    if not target:
        raise ConnectorError("No chat_id given and none configured. Message the bot "
                             "first, then click Test on the connector to detect it.")
    for part in chunks(text, MAX_MESSAGE):
        _api(config, "sendMessage", chat_id=target, text=part)
    return f"Sent Telegram message to chat {target}."


def send(config: dict[str, str], message: str, subject: str) -> str:
    return send_message(config, f"{subject}\n\n{message}" if subject else message)


SPEC = ConnectorSpec(
    kind="telegram",
    name="Telegram",
    description="Get digests and alerts in Telegram, and read what people send your bot.",
    icon="telegram",
    docs_url="https://core.telegram.org/bots#botfather",
    module=sys.modules[__name__],
    fields=(
        Field("bot_token", "Bot token", secret=True, placeholder="123456:ABC-DEF...",
              hint="Create a bot with @BotFather and paste the token it gives you."),
        Field("chat_id", "Chat ID", required=False, placeholder="auto-detect",
              hint="Send your bot any message first, then leave this blank — the "
                   "chat is detected on connect. Or paste a chat/group ID."),
    ),
    tools=(
        ConnectorTool(
            name="telegram_read_updates",
            description="Read recent messages sent to the Telegram bot (chat id, sender, text).",
            input_schema={"type": "object", "properties": {
                "limit": {"type": "integer", "description": "Max messages (1-100)", "default": 20},
            }},
            fn=read_updates),
        ConnectorTool(
            name="telegram_send_message",
            description="Send a Telegram message from the bot. Requires human approval before executing. chat_id defaults to the connector's configured chat.",
            input_schema={"type": "object", "properties": {
                "text": {"type": "string"},
                "chat_id": {"type": "string", "description": "Target chat; empty = default", "default": ""},
            }, "required": ["text"]},
            fn=send_message, requires_approval=True),
    ),
    notes=("Reading updates fails with 409 while a webhook is set on the bot "
           "(call deleteWebhook once).",),
)
