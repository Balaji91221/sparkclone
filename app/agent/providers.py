"""LLM provider layer.

Normalizes NVIDIA NIM (OpenAI chat-completions format) and Anthropic
(Messages format) behind one interface the agent loop can use:

    result = complete(system, messages, tools)
    # result = {"text": str, "tool_calls": [{"id","name","input"}], "raw_assistant_msg": ...}

`messages` are kept in the provider's native format by the runtime via the
helpers below (make_user_msg / make_tool_results_msg), so each provider stays
correct without a lossy translation layer.

Every outbound call goes through one shared sliding-window RateLimiter
(LLM_MAX_RPS) — including retries, which re-acquire the limiter.
"""
from __future__ import annotations

import json
import time
from typing import Any

import httpx

from ..config import settings
from .rate_limiter import RateLimiter

_limiter = RateLimiter(max_requests=max(1, int(settings.llm_max_rps)), per_seconds=1.0)


def _post(url: str, headers: dict, payload: dict) -> dict:
    backoff = 2.0
    resp = None
    for _ in range(5):
        with _limiter:  # queue-and-wait; retries count against the cap too
            resp = httpx.post(url, timeout=180, headers=headers, json=payload)
        if resp.status_code == 429 or resp.status_code >= 500:
            time.sleep(float(resp.headers.get("retry-after", backoff)))
            backoff = min(backoff * 2, 60)
            continue
        resp.raise_for_status()
        return resp.json()
    resp.raise_for_status()
    return resp.json()


# --------------------------------------------------------------------- NVIDIA

def _openai_tool_specs(tools: list[dict]) -> list[dict]:
    """Convert Anthropic-style tool specs (name/description/input_schema)
    to OpenAI function-tool specs."""
    return [{
        "type": "function",
        "function": {
            "name": t["name"],
            "description": t["description"],
            "parameters": t["input_schema"],
        },
    } for t in tools]


def _nvidia_complete(system: str, messages: list[dict], tools: list[dict]) -> dict:
    payload = {
        "model": settings.nvidia_model,
        "messages": [{"role": "system", "content": system}, *messages],
        "temperature": settings.nvidia_temperature,
        "top_p": settings.nvidia_top_p,
        "max_tokens": settings.max_tokens,
        "chat_template_kwargs": {"enable_thinking": settings.nvidia_enable_thinking},
        "reasoning_budget": settings.nvidia_reasoning_budget,
    }
    if tools:
        payload["tools"] = _openai_tool_specs(tools)
        payload["tool_choice"] = "auto"
    data = _post(
        f"{settings.nvidia_base_url}/chat/completions",
        {"Authorization": f"Bearer {settings.nvidia_api_key}",
         "Content-Type": "application/json"},
        payload,
    )
    msg = data["choices"][0]["message"]
    tool_calls = []
    for tc in msg.get("tool_calls") or []:
        try:
            args = json.loads(tc["function"].get("arguments") or "{}")
        except json.JSONDecodeError:
            args = {}
        tool_calls.append({"id": tc["id"], "name": tc["function"]["name"], "input": args})
    return {
        "text": msg.get("content") or "",
        "reasoning": msg.get("reasoning_content") or "",
        "tool_calls": tool_calls,
        "raw_assistant_msg": {
            "role": "assistant",
            "content": msg.get("content"),
            **({"tool_calls": msg["tool_calls"]} if msg.get("tool_calls") else {}),
        },
    }


def _nvidia_tool_results_msg(results: list[dict]) -> list[dict]:
    # OpenAI format: one "tool" role message per call
    return [{"role": "tool", "tool_call_id": r["id"], "content": r["content"]}
            for r in results]


# ------------------------------------------------------------------ Anthropic

def _anthropic_complete(system: str, messages: list[dict], tools: list[dict]) -> dict:
    payload = {
        "model": settings.model,
        "max_tokens": settings.max_tokens,
        "system": system,
        "messages": messages,
        "tools": tools,
    }
    data = _post(
        "https://api.anthropic.com/v1/messages",
        {"x-api-key": settings.anthropic_api_key,
         "anthropic-version": "2023-06-01",
         "content-type": "application/json"},
        payload,
    )
    content = data.get("content", [])
    text = "\n".join(b["text"] for b in content if b.get("type") == "text")
    tool_calls = [{"id": b["id"], "name": b["name"], "input": b["input"]}
                  for b in content if b.get("type") == "tool_use"]
    return {"text": text, "reasoning": "", "tool_calls": tool_calls,
            "raw_assistant_msg": {"role": "assistant", "content": content}}


def _anthropic_tool_results_msg(results: list[dict]) -> list[dict]:
    return [{"role": "user", "content": [
        {"type": "tool_result", "tool_use_id": r["id"], "content": r["content"]}
        for r in results]}]


# ------------------------------------------------------------------ interface

def complete(system: str, messages: list[dict], tools: list[dict]) -> dict:
    if settings.llm_provider == "anthropic":
        return _anthropic_complete(system, messages, tools)
    return _nvidia_complete(system, messages, tools)


def make_tool_results_msgs(results: list[dict]) -> list[dict]:
    """results: [{"id": tool_call_id, "content": str}] -> provider-native
    message(s) to append to history."""
    if settings.llm_provider == "anthropic":
        return _anthropic_tool_results_msg(results)
    return _nvidia_tool_results_msg(results)
