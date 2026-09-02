"""Outbound webhook connector: POST JSON to one fixed URL (Zapier, n8n, Make,
a Slack/Discord incoming webhook, your own service)."""
from __future__ import annotations

import json
import sys
from typing import Any
from urllib.parse import urlparse

from .base import ConnectorError, ConnectorSpec, ConnectorTool, Field, request_json


def _headers(config: dict[str, str]) -> dict[str, str]:
    headers = {"Content-Type": "application/json", "User-Agent": "Astra/1.0"}
    auth = config.get("auth_header", "").strip()
    if auth:
        headers["Authorization"] = auth
    return headers


def _post(config: dict[str, str], payload: Any) -> Any:
    url = config.get("url", "").strip()
    if not url.startswith(("http://", "https://")):
        raise ConnectorError("Webhook URL must start with http:// or https://")
    return request_json("POST", url, secrets=(config.get("auth_header", ""),),
                        headers=_headers(config), json=payload)


def verify(config: dict[str, str]) -> str:
    _post(config, {"type": "test", "message": "Astra connected this webhook.",
                   "text": "Astra connected this webhook.", "content": "Astra connected."})
    return urlparse(config.get("url", "")).netloc or "webhook"


def post(config: dict[str, str], payload: Any) -> str:
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except ValueError:
            payload = {"text": payload}
    _post(config, payload)
    return "Webhook delivered (2xx)."


def send(config: dict[str, str], message: str, subject: str) -> str:
    # Redundant keys so Slack/Discord incoming webhooks render it without mapping.
    return post(config, {"type": "notification", "subject": subject,
                         "message": message, "text": f"{subject}\n{message}".strip(),
                         "content": f"**{subject}**\n{message}"[:2000].strip()})


SPEC = ConnectorSpec(
    kind="webhook",
    name="Webhook",
    description="POST results as JSON to any URL — Zapier, n8n, Make, or your own app.",
    icon="webhook",
    module=sys.modules[__name__],
    fields=(
        # Secret: incoming-webhook URLs (Slack, Discord) carry their token in
        # the path, so the value must never be echoed back to the dashboard.
        Field("url", "Webhook URL", secret=True, placeholder="https://hooks.example.com/...",
              hint="Connecting sends a small test payload; the endpoint must answer 2xx."),
        Field("auth_header", "Authorization header", secret=True, required=False,
              placeholder="Bearer ...", hint="Optional; sent verbatim as Authorization."),
    ),
    tools=(
        ConnectorTool(
            name="webhook_post",
            description="POST a JSON payload to the configured webhook URL. Requires human approval before executing.",
            input_schema={"type": "object", "properties": {
                "payload": {"type": "object", "description": "JSON object to send",
                            "additionalProperties": True},
            }, "required": ["payload"]},
            fn=post, requires_approval=True),
    ),
)
