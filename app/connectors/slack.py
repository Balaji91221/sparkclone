"""Slack connector: a bot token (xoxb-...) from a Slack app in your workspace."""
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

API = "https://slack.com/api"
MAX_MESSAGE = 4000


def _api(config: dict[str, str], method: str, **params: Any) -> dict:
    token = config.get("bot_token", "")
    data = request_json(
        "POST", f"{API}/{method}", secrets=(token,),
        headers={"Authorization": f"Bearer {token}"}, data=params or None)
    if not isinstance(data, dict) or not data.get("ok"):
        err = data.get("error", "unknown_error") if isinstance(data, dict) else "bad response"
        raise ConnectorError(f"Slack {method} failed: {err}")
    return data


def verify(config: dict[str, str]) -> str:
    who = _api(config, "auth.test")
    return f"{who.get('user', 'bot')} in {who.get('team', 'workspace')}"


def _channels(config: dict[str, str]) -> list[dict]:
    out: list[dict] = []
    cursor = ""
    for _ in range(5):
        res = _api(config, "conversations.list", limit=200,
                   types="public_channel,private_channel",
                   exclude_archived="true", **({"cursor": cursor} if cursor else {}))
        out += [{"id": c.get("id", ""), "name": c.get("name", ""),
                 "is_member": bool(c.get("is_member")),
                 "topic": (c.get("topic") or {}).get("value", "")[:120]}
                for c in res.get("channels", [])]
        cursor = (res.get("response_metadata") or {}).get("next_cursor", "")
        if not cursor:
            break
    return out


def _resolve_channel(config: dict[str, str], channel: str) -> str:
    channel = (channel or config.get("default_channel", "")).strip().lstrip("#")
    if not channel:
        raise ConnectorError("No channel given and no default channel configured.")
    if channel[0] in "CGD" and channel[1:].isalnum() and channel.isupper():
        return channel
    for c in _channels(config):
        if c["name"] == channel:
            return c["id"]
    raise ConnectorError(f"Channel '{channel}' not found (is the bot invited to it?).")


def list_channels(config: dict[str, str]) -> str:
    return wrap(_channels(config))


def read_channel(config: dict[str, str], channel: str = "", limit: int = 20) -> str:
    cid = _resolve_channel(config, channel)
    res = _api(config, "conversations.history", channel=cid,
               limit=clamp(limit, 1, 100, 20))
    msgs = [{"user": m.get("user", m.get("username", "")), "ts": m.get("ts", ""),
             "text": (m.get("text") or "")[:2000]}
            for m in res.get("messages", [])]
    return wrap(msgs)


def post_message(config: dict[str, str], text: str, channel: str = "") -> str:
    cid = _resolve_channel(config, channel)
    for part in chunks(text, MAX_MESSAGE):
        _api(config, "chat.postMessage", channel=cid, text=part)
    return f"Posted to Slack channel {channel or config.get('default_channel', cid)}."


def send(config: dict[str, str], message: str, subject: str) -> str:
    body = f"*{subject}*\n{message}" if subject else message
    return post_message(config, body)


SPEC = ConnectorSpec(
    kind="slack",
    name="Slack",
    description="Read channels and post messages with a bot in your workspace.",
    icon="slack",
    docs_url="https://api.slack.com/apps",
    module=sys.modules[__name__],
    fields=(
        Field("bot_token", "Bot token", secret=True, placeholder="xoxb-...",
              hint="From your Slack app → OAuth & Permissions. Needs scopes "
                   "chat:write, channels:read, channels:history (plus groups:* "
                   "for private channels)."),
        Field("default_channel", "Default channel", required=False, placeholder="general",
              hint="Where notifications go. Invite the bot with /invite @bot first."),
    ),
    tools=(
        ConnectorTool(
            name="slack_list_channels",
            description="List Slack channels the bot can see (id, name, whether it is a member).",
            input_schema={"type": "object", "properties": {}},
            fn=list_channels),
        ConnectorTool(
            name="slack_read_channel",
            description="Read recent messages from a Slack channel (name or ID). Defaults to the connector's default channel.",
            input_schema={"type": "object", "properties": {
                "channel": {"type": "string", "description": "Channel name or ID", "default": ""},
                "limit": {"type": "integer", "description": "Max messages (1-100)", "default": 20},
            }},
            fn=read_channel),
        ConnectorTool(
            name="slack_post_message",
            description="Post a message to a Slack channel. Requires human approval before executing.",
            input_schema={"type": "object", "properties": {
                "text": {"type": "string"},
                "channel": {"type": "string", "description": "Channel name or ID; empty = default", "default": ""},
            }, "required": ["text"]},
            fn=post_message, requires_approval=True),
    ),
    notes=("Reads and posts fail with not_in_channel until the bot is invited.",),
)
