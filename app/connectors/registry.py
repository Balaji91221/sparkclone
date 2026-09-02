"""Connector registry: the SPECS map, encrypted config storage, and the two
things the rest of the app needs — ready-to-call tools for enabled connectors
and notify() fan-out to the connectors flagged as notification channels.
"""
from __future__ import annotations

import functools
import json
import logging

from ..auth.crypto import decrypt, encrypt
from ..db import Connector, db_session, utcnow
from ..tools.registry import TOOLS, Tool
from . import discord, mail, slack, telegram, webhook
from .base import ConnectorError, ConnectorSpec

log = logging.getLogger("spark.connectors")

SPECS: dict[str, ConnectorSpec] = {
    s.kind: s for s in (slack.SPEC, telegram.SPEC, mail.SPEC, discord.SPEC, webhook.SPEC)}

KEY_ERROR = ("Stored credentials can't be decrypted (SPARK_SECRET_KEY changed). "
             "Disconnect and connect again.")


def spec(kind: str) -> ConnectorSpec:
    try:
        return SPECS[kind]
    except KeyError:
        raise ConnectorError(f"Unknown connector kind: {kind}") from None


def _decode(row: Connector) -> dict[str, str] | None:
    raw = decrypt(row.config_enc) if row.config_enc else None
    if raw is None:
        return None
    try:
        data = json.loads(raw)
    except ValueError:
        return None
    return {k: str(v) for k, v in data.items()} if isinstance(data, dict) else None


def load_config(kind: str, enabled_only: bool = False) -> dict[str, str] | None:
    """Decrypted config for a connected kind; None if absent (or disabled when
    enabled_only). Only this module and the API touch the ciphertext."""
    with db_session() as db:
        row = db.get(Connector, kind)
        if row is None or (enabled_only and row.enabled != "true"):
            return None
        return _decode(row)


def merge_config(kind: str, incoming: dict[str, str]) -> dict[str, str]:
    """Validate incoming fields against the spec; a blank secret keeps the
    value already stored so re-saving never requires re-pasting tokens."""
    s = spec(kind)
    current = load_config(kind) or {}
    merged: dict[str, str] = {}
    for f in s.fields:
        value = str(incoming.get(f.key, "") or "").strip()
        if not value and f.secret:
            value = current.get(f.key, "")
        if not value and f.required:
            raise ConnectorError(f"{f.label} is required.")
        merged[f.key] = value
    return merged


def save(kind: str, config: dict[str, str], identity: str,
         notify: bool | None = None) -> Connector:
    with db_session() as db:
        row = db.get(Connector, kind)
        if row is None:
            row = Connector(kind=kind, config_enc="", enabled="true",
                            notify="true" if notify else "false")
            db.add(row)
        elif notify is not None:
            row.notify = "true" if notify else "false"
        row.config_enc = encrypt(json.dumps(config))
        row.identity = identity[:200]
        row.updated_at = utcnow()
        db.commit()
        db.refresh(row)
        return row


def status(kind: str) -> dict:
    """UI-facing view of one connector: spec, connection state, tool names —
    plain field values are echoed back, secrets only as has_value."""
    s = spec(kind)
    with db_session() as db:
        row = db.get(Connector, kind)
    config = _decode(row) if row else None
    fields = [{
        "key": f.key, "label": f.label, "secret": f.secret, "required": f.required,
        "hint": f.hint, "placeholder": f.placeholder,
        "has_value": bool(config and config.get(f.key)),
        "value": "" if f.secret else (config or {}).get(f.key, ""),
    } for f in s.fields]
    return {
        "kind": s.kind, "name": s.name, "description": s.description,
        "icon": s.icon, "docs_url": s.docs_url, "notes": list(s.notes),
        "fields": fields,
        "connected": row is not None,
        "identity": row.identity if row else "",
        "enabled": bool(row and row.enabled == "true"),
        "notify": bool(row and row.notify == "true"),
        "supports_notify": s.supports_notify,
        "error": KEY_ERROR if row is not None and config is None else "",
        "tools": [{"name": t.name, "description": t.description,
                   "requires_approval": t.requires_approval} for t in s.tools],
    }


def list_status() -> list[dict]:
    return [status(kind) for kind in SPECS]


def _bind(s: ConnectorSpec, config: dict[str, str]) -> list[Tool]:
    return [Tool(name=t.name, description=t.description, input_schema=t.input_schema,
                 fn=functools.partial(t.fn, config), requires_approval=t.requires_approval)
            for t in s.tools if t.name not in TOOLS]


def enabled_tools() -> list[Tool]:
    """Tools from every connected + enabled connector, config bound in. Names
    already registered as built-ins (the mail pair) are skipped — the built-in
    delegates to the connector config itself — so the LLM never sees
    duplicate tool names."""
    with db_session() as db:
        rows = db.query(Connector).filter(Connector.enabled == "true").all()
        decoded = [(r.kind, _decode(r)) for r in rows]
    tools: list[Tool] = []
    for kind, config in decoded:
        s = SPECS.get(kind)
        if s is None or config is None:
            continue
        tools += _bind(s, config)
    return tools


def tool_specs(tools: list[Tool]) -> list[dict]:
    return [{"name": t.name, "description": t.description, "input_schema": t.input_schema}
            for t in tools]


def notify_targets(channel: str = "auto") -> list[tuple[ConnectorSpec, dict[str, str]]]:
    """(spec, config) for each delivery target: every enabled connector flagged
    notify when channel is "auto", or exactly that connector kind."""
    with db_session() as db:
        rows = db.query(Connector).filter(Connector.enabled == "true").all()
        decoded = [(r.kind, r.notify == "true", _decode(r)) for r in rows]
    out = []
    for kind, flagged, config in decoded:
        s = SPECS.get(kind)
        if s is None or not s.supports_notify or config is None:
            continue
        if (channel == "auto" and flagged) or channel == kind:
            out.append((s, config))
    return out


def deliver(message: str, subject: str, channel: str = "auto") -> list[str]:
    """Send through the notify targets; one failure never blocks the others.
    Returns one result line per target (empty list = nothing attempted)."""
    results: list[str] = []
    for s, config in notify_targets(channel):
        try:
            results.append(f"{s.name}: {s.send(config, message, subject)}")
        except Exception as e:  # noqa: BLE001
            log.warning("notify via %s failed: %s", s.kind, e)
            results.append(f"{s.name}: delivery failed ({str(e)[:200]})")
    return results
