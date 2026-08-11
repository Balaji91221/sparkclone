#!/usr/bin/env python3
"""Tiny stdio MCP server used to test SparkClone's MCP integration.

Run manually:  python3 scripts/demo_mcp_server.py
Register in SparkClone as transport=stdio with this venv's python + this path.
"""
from mcp.server import MCPServer

server = MCPServer(name="spark-demo")


@server.tool(description="Echo a message back, prefixed so the round-trip is visible.")
def echo(message: str) -> str:
    return f"demo-echo: {message}"


@server.tool(description="Add two numbers and return the sum.")
def add(a: float, b: float) -> str:
    return f"{a} + {b} = {a + b}"


if __name__ == "__main__":
    server.run("stdio")
