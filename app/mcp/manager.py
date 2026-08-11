"""MCP client manager: connect to user-registered MCP servers and call tools.

v1 keeps the concurrency model boring on purpose: every discover/call opens a
fresh connection inside its own asyncio.run() — each ThreadPool worker owns a
private event loop for the duration of the call, so there is no cross-thread
cancel-scope juggling. Cost: stdio servers cold-start per call. Discovery
results are cached for a short TTL to keep run startup cheap.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import re
import threading
import time
from dataclasses import dataclass

from ..auth.crypto import decrypt, encrypt
from ..db import MCPServer, db_session

CALL_TIMEOUT_S = 60.0
DISCOVER_TTL_S = 300.0

_cache_lock = threading.Lock()
_tools_cache: dict[str, tuple[float, list[dict]]] = {}


@dataclass
class ServerConfig:
    id: str
    name: str
    transport: str  # "stdio" | "http"
    command: str
    args: list[str]
    env: dict[str, str]
    url: str
    requires_approval: bool


@dataclass
class MCPToolRef:
    public_name: str
    tool_name: str
    description: str
    input_schema: dict
    server: ServerConfig


def _sanitize(part: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]", "_", part)


def public_name(server_name: str, tool_name: str) -> str:
    """OpenAI-compatible endpoints enforce ^[a-zA-Z0-9_-]{1,64}$."""
    base = f"mcp_{_sanitize(server_name)}_{_sanitize(tool_name)}"
    if len(base) <= 64:
        return base
    digest = hashlib.sha1(base.encode()).hexdigest()[:8]
    return f"{base[:55]}_{digest}"


def encrypt_env(env: dict[str, str]) -> str:
    return encrypt(json.dumps(env)) if env else ""


def to_config(row: MCPServer) -> ServerConfig:
    env: dict[str, str] = {}
    if row.env_enc:
        raw = decrypt(row.env_enc)
        if raw:
            env = json.loads(raw)
    return ServerConfig(
        id=row.id, name=row.name, transport=row.transport,
        command=row.command or "", args=list(row.args or []), env=env,
        url=row.url or "", requires_approval=row.requires_approval == "true",
    )


async def _with_session(server: ServerConfig, fn):
    from mcp import ClientSession, StdioServerParameters
    if server.transport == "stdio":
        from mcp.client.stdio import stdio_client
        params = StdioServerParameters(
            command=server.command, args=server.args, env=server.env or None)
        async with stdio_client(params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                return await fn(session)
    from mcp.client.streamable_http import streamable_http_client
    async with streamable_http_client(server.url) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            return await fn(session)


def _run(server: ServerConfig, fn):
    async def bounded():
        return await asyncio.wait_for(_with_session(server, fn), CALL_TIMEOUT_S)
    return asyncio.run(bounded())


def discover(server: ServerConfig, force: bool = False) -> list[dict]:
    """List a server's tools: [{name, description, input_schema}]. Raises on
    connection failure — callers decide whether that is fatal."""
    with _cache_lock:
        hit = _tools_cache.get(server.id)
        if hit and not force and time.monotonic() - hit[0] < DISCOVER_TTL_S:
            return hit[1]

    async def _list(session):
        res = await session.list_tools()
        return [{
            "name": t.name,
            "description": t.description or "",
            "input_schema": t.input_schema or {"type": "object", "properties": {}},
        } for t in res.tools]

    tools = _run(server, _list)
    with _cache_lock:
        _tools_cache[server.id] = (time.monotonic(), tools)
    return tools


def forget(server_id: str) -> None:
    with _cache_lock:
        _tools_cache.pop(server_id, None)


def call(server: ServerConfig, tool_name: str, arguments: dict) -> str:
    async def _call(session):
        res = await session.call_tool(tool_name, arguments,
                                      read_timeout_seconds=CALL_TIMEOUT_S)
        parts: list[str] = []
        for c in getattr(res, "content", []) or []:
            text = getattr(c, "text", None)
            parts.append(text if isinstance(text, str) else json.dumps(
                getattr(c, "__dict__", str(c)), default=str))
        joined = "\n".join(parts) or "(empty result)"
        if getattr(res, "isError", False):
            return f"MCP tool error: {joined}"
        return joined

    try:
        return _run(server, _call)
    except Exception as e:  # noqa: BLE001
        return f"MCP call failed ({server.name}/{tool_name}): {type(e).__name__}: {e}"


def enabled_tools() -> list[MCPToolRef]:
    """All tools from enabled servers. A server that fails discovery is
    skipped (with its error swallowed) so one dead server can't block runs."""
    with db_session() as db:
        rows = db.query(MCPServer).filter(MCPServer.enabled == "true").all()
        configs = [to_config(r) for r in rows]
    refs: list[MCPToolRef] = []
    for cfg in configs:
        try:
            tools = discover(cfg)
        except Exception:  # noqa: BLE001
            continue
        for t in tools:
            refs.append(MCPToolRef(
                public_name=public_name(cfg.name, t["name"]),
                tool_name=t["name"],
                description=t["description"],
                input_schema=t["input_schema"],
                server=cfg,
            ))
    return refs
