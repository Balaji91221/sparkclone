from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..db import MCPServer, db_session
from ..mcp import manager
from .deps import auth

router = APIRouter(prefix="/api/mcp", dependencies=[Depends(auth)])


class MCPServerIn(BaseModel):
    name: str
    transport: str  # "stdio" | "http" (streamable) | "sse" (legacy)
    command: str = ""
    args: list[str] = []
    env: dict[str, str] = {}
    url: str = ""
    requires_approval: bool = True


def _row_out(row: MCPServer, tools: list[dict] | None = None) -> dict:
    return {
        "id": row.id, "name": row.name, "transport": row.transport,
        "command": row.command, "args": row.args or [], "url": row.url,
        "enabled": row.enabled == "true",
        "requires_approval": row.requires_approval == "true",
        "has_env": bool(row.env_enc),
        "tools": tools,
    }


@router.get("")
def list_servers():
    with db_session() as db:
        rows = db.query(MCPServer).all()
        return [_row_out(r) for r in rows]


@router.post("")
def add_server(body: MCPServerIn):
    if body.transport not in ("stdio", "http", "sse"):
        raise HTTPException(400, "transport must be stdio, http (streamable) or sse")
    if body.transport == "stdio" and not body.command.strip():
        raise HTTPException(400, "stdio transport needs a command")
    if body.transport in ("http", "sse") and not body.url.strip():
        raise HTTPException(400, f"{body.transport} transport needs a url")
    row = MCPServer(
        name=body.name.strip(), transport=body.transport,
        command=body.command.strip(), args=body.args,
        env_enc=manager.encrypt_env(body.env), url=body.url.strip(),
        requires_approval="true" if body.requires_approval else "false",
    )
    # Validate the connection before saving: a server that can't list tools
    # would only ever produce confusing runs.
    try:
        tools = manager.discover(manager.to_config(row), force=True)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(422, f"Could not connect to MCP server: {type(e).__name__}: {e}")
    with db_session() as db:
        db.add(row)
        db.commit()
        return _row_out(row, tools)


@router.post("/{server_id}/discover")
def discover_server(server_id: str):
    with db_session() as db:
        row = db.get(MCPServer, server_id)
        if not row:
            raise HTTPException(404)
        cfg = manager.to_config(row)
    try:
        return {"tools": manager.discover(cfg, force=True)}
    except Exception as e:  # noqa: BLE001
        raise HTTPException(422, f"Discovery failed: {type(e).__name__}: {e}")


@router.post("/{server_id}/toggle")
def toggle_server(server_id: str):
    with db_session() as db:
        row = db.get(MCPServer, server_id)
        if not row:
            raise HTTPException(404)
        row.enabled = "false" if row.enabled == "true" else "true"
        db.commit()
        return _row_out(row)


@router.post("/{server_id}/approval")
def toggle_approval(server_id: str):
    with db_session() as db:
        row = db.get(MCPServer, server_id)
        if not row:
            raise HTTPException(404)
        row.requires_approval = "false" if row.requires_approval == "true" else "true"
        db.commit()
        return _row_out(row)


@router.delete("/{server_id}")
def delete_server(server_id: str):
    with db_session() as db:
        row = db.get(MCPServer, server_id)
        if not row:
            raise HTTPException(404)
        db.delete(row)
        db.commit()
    manager.forget(server_id)
    return {"ok": True}
