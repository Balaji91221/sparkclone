"""Compatibility shim — the agent loop moved to app/agent/agent.py."""
from .agent import execute_run

__all__ = ["execute_run"]
