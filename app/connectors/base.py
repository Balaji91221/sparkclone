"""Building blocks shared by every connector.

A ConnectorSpec is pure description plus plain functions: how to verify a
config against the real service, which agent tools it offers, and (optionally)
how to deliver a notify() message. Tools receive the decrypted config as their
first argument; registry.enabled_tools() binds it before the agent sees them.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable

import httpx

from ..tools.registry import UNTRUSTED_WRAP

HTTP_TIMEOUT_S = 20.0


class ConnectorError(Exception):
    """A verify/call failure with a user-facing message (never a secret)."""


@dataclass(frozen=True)
class Field:
    key: str
    label: str
    secret: bool = False
    required: bool = True
    hint: str = ""
    placeholder: str = ""


@dataclass(frozen=True)
class ConnectorTool:
    name: str
    description: str
    input_schema: dict
    fn: Callable[..., str]  # fn(config, **args) -> str
    requires_approval: bool = False


@dataclass(frozen=True)
class ConnectorSpec:
    """Description of one service. Behaviour lives in the connector module and
    is resolved at call time (`module.verify`, `module.send`), never captured
    as a bound reference — so a patched module function is honoured."""
    kind: str
    name: str
    description: str
    icon: str
    fields: tuple[Field, ...]
    module: Any                  # the connector module itself
    tools: tuple[ConnectorTool, ...] = ()
    docs_url: str = ""
    notes: tuple[str, ...] = field(default_factory=tuple)

    def verify(self, config: dict[str, str]) -> str:
        """Check the config against the real service; return an identity label.
        Raises ConnectorError. May fill in discovered values (a chat id)."""
        return self.module.verify(config)

    def send(self, config: dict[str, str], message: str, subject: str) -> str:
        """Deliver a notify() message through this service."""
        return self.module.send(config, message, subject)

    @property
    def supports_notify(self) -> bool:
        return hasattr(self.module, "send")


def wrap(data: Any) -> str:
    """Envelope external content so the agent treats it as data."""
    import json
    body = data if isinstance(data, str) else json.dumps(data, ensure_ascii=False, indent=1)
    return UNTRUSTED_WRAP.format(body=body)


def scrub(text: str, *secrets: str) -> str:
    """Remove secret values from error text before it leaves the connector."""
    for s in secrets:
        if s:
            text = text.replace(s, "***")
    return text


def http_error(e: Exception, *secrets: str) -> ConnectorError:
    return ConnectorError(scrub(f"{type(e).__name__}: {e}", *secrets)[:300])


def request_json(method: str, url: str, *, secrets: tuple[str, ...] = (),
                 **kwargs: Any) -> Any:
    """One HTTP call returning parsed JSON; every failure becomes a scrubbed
    ConnectorError so tokens embedded in URLs or headers never surface."""
    try:
        r = httpx.request(method, url, timeout=HTTP_TIMEOUT_S, **kwargs)
    except Exception as e:  # noqa: BLE001
        raise http_error(e, *secrets) from None
    if r.status_code >= 400:
        raise ConnectorError(scrub(f"HTTP {r.status_code}: {r.text[:200]}", *secrets))
    try:
        return r.json()
    except ValueError:
        return {"raw": scrub(r.text[:500], *secrets)}


def chunks(text: str, size: int) -> list[str]:
    """Split a message at line boundaries where possible, never exceeding size."""
    out: list[str] = []
    rest = text
    while len(rest) > size:
        cut = rest.rfind("\n", 0, size)
        if cut < size // 2:
            cut = size
        out.append(rest[:cut])
        rest = rest[cut:].lstrip("\n")
    if rest or not out:
        out.append(rest)
    return out


def clamp(value: Any, lo: int, hi: int, default: int) -> int:
    try:
        return max(lo, min(int(value), hi))
    except (TypeError, ValueError):
        return default
