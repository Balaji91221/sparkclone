"""Discord connector: a bot token from the Discord developer portal."""
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

API = "https://discord.com/api/v10"
MAX_MESSAGE = 2000


def _api(config: dict[str, str], method: str, path: str, **kwargs: Any) -> Any:
    token = config.get("bot_token", "")
    return request_json(method, f"{API}{path}", secrets=(token,),
                        headers={"Authorization": f"Bot {token}",
                                 "User-Agent": "Astra (https://github.com, 1.0)"},
                        **kwargs)


def verify(config: dict[str, str]) -> str:
    me = _api(config, "GET", "/users/@me")
    return me.get("username", "bot") if isinstance(me, dict) else "bot"


def _channel(config: dict[str, str], channel_id: str) -> str:
    cid = (channel_id or config.get("default_channel_id", "")).strip()
    if not cid.isdigit():
        raise ConnectorError("Give a numeric channel ID (Developer Mode → Copy Channel ID) "
                             "or set a default channel on the connector.")
    return cid


def read_channel(config: dict[str, str], channel_id: str = "", limit: int = 20) -> str:
    cid = _channel(config, channel_id)
    res = _api(config, "GET", f"/channels/{cid}/messages",
               params={"limit": clamp(limit, 1, 100, 20)})
    msgs = [{"author": (m.get("author") or {}).get("username", ""),
             "timestamp": m.get("timestamp", ""),
             "content": (m.get("content") or "")[:2000]}
            for m in (res if isinstance(res, list) else [])]
    return wrap(msgs)


def post_message(config: dict[str, str], content: str, channel_id: str = "") -> str:
    cid = _channel(config, channel_id)
    for part in chunks(content, MAX_MESSAGE):
        _api(config, "POST", f"/channels/{cid}/messages", json={"content": part})
    return f"Posted to Discord channel {cid}."


def send(config: dict[str, str], message: str, subject: str) -> str:
    return post_message(config, f"**{subject}**\n{message}" if subject else message)


SPEC = ConnectorSpec(
    kind="discord",
    name="Discord",
    description="Read a channel and post updates through a bot on your server.",
    icon="discord",
    docs_url="https://discord.com/developers/applications",
    module=sys.modules[__name__],
    fields=(
        Field("bot_token", "Bot token", secret=True,
              hint="Developer portal → your app → Bot → Reset Token. Invite the bot to "
                   "your server with Send Messages + Read Message History permissions."),
        Field("default_channel_id", "Default channel ID", required=False,
              placeholder="123456789012345678",
              hint="Enable Developer Mode in Discord, right-click a channel → Copy ID."),
    ),
    tools=(
        ConnectorTool(
            name="discord_read_channel",
            description="Read recent messages from a Discord channel by numeric ID (defaults to the connector's default channel).",
            input_schema={"type": "object", "properties": {
                "channel_id": {"type": "string", "default": ""},
                "limit": {"type": "integer", "description": "Max messages (1-100)", "default": 20},
            }},
            fn=read_channel),
        ConnectorTool(
            name="discord_post_message",
            description="Post a message to a Discord channel. Requires human approval before executing.",
            input_schema={"type": "object", "properties": {
                "content": {"type": "string"},
                "channel_id": {"type": "string", "description": "Numeric channel ID; empty = default", "default": ""},
            }, "required": ["content"]},
            fn=post_message, requires_approval=True),
    ),
    notes=("Message text comes back empty unless the Message Content intent is "
           "enabled on the bot.",),
)
