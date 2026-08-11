from __future__ import annotations

from fastapi import APIRouter, Depends

from ..db import MCPServer, db_session
from ..mcp import manager
from ..tools.registry import TOOLS
from .deps import auth

router = APIRouter(prefix="/api/tools", dependencies=[Depends(auth)])


@router.get("")
def list_tools():
    """Everything the agent can call right now: built-ins + enabled MCP tools."""
    out = [{
        "name": t.name,
        "description": t.description,
        "requires_approval": t.requires_approval,
        "source": "builtin",
    } for t in TOOLS.values()]

    with db_session() as db:
        rows = db.query(MCPServer).filter(MCPServer.enabled == "true").all()
        configs = [manager.to_config(r) for r in rows]
    for cfg in configs:
        try:
            tools = manager.discover(cfg)
        except Exception as e:  # noqa: BLE001
            out.append({"name": f"mcp_{cfg.name}", "description":
                        f"(server unreachable: {type(e).__name__})",
                        "requires_approval": cfg.requires_approval,
                        "source": cfg.name})
            continue
        out += [{
            "name": manager.public_name(cfg.name, t["name"]),
            "description": t["description"],
            "requires_approval": cfg.requires_approval,
            "source": cfg.name,
        } for t in tools]
    return out
