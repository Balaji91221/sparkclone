#!/usr/bin/env python3
"""Tiny MCP server used to test Arclight's MCP integration.

Usage:
  python3 scripts/demo_mcp_server.py                       # stdio (default)
  python3 scripts/demo_mcp_server.py streamable-http 8765  # http://127.0.0.1:8765/mcp
  python3 scripts/demo_mcp_server.py sse 8766              # http://127.0.0.1:8766/sse
"""
import sys

from mcp.server import MCPServer

server = MCPServer(name="spark-demo")


@server.tool(description="Echo a message back, prefixed so the round-trip is visible.")
def echo(message: str) -> str:
    return f"demo-echo: {message}"


@server.tool(description="Add two numbers and return the sum.")
def add(a: float, b: float) -> str:
    return f"{a} + {b} = {a + b}"


if __name__ == "__main__":
    transport = sys.argv[1] if len(sys.argv) > 1 else "stdio"
    if transport == "stdio":
        server.run("stdio")
    else:
        port = int(sys.argv[2]) if len(sys.argv) > 2 else 8765
        server.run(transport, port=port)
