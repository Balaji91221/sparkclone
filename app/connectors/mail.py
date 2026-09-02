"""Mail connector: IMAP for reading, SMTP for sending (Gmail needs an App
Password). The connector row wins; the legacy IMAP_*/SMTP_* env settings stay
as a fallback so existing installs keep working untouched."""
from __future__ import annotations

import email as email_lib
import email.header
import imaplib
import json
import smtplib
import sys
from email.mime.text import MIMEText

from ..config import settings
from .base import ConnectorError, ConnectorSpec, ConnectorTool, Field, clamp, scrub, wrap

KEYS = ("imap_host", "imap_user", "imap_password",
        "smtp_host", "smtp_port", "smtp_user", "smtp_password")


def env_config() -> dict[str, str]:
    return {
        "imap_host": settings.imap_host, "imap_user": settings.imap_user,
        "imap_password": settings.imap_password,
        "smtp_host": settings.smtp_host, "smtp_port": str(settings.smtp_port),
        "smtp_user": settings.smtp_user, "smtp_password": settings.smtp_password,
    }


def effective_config() -> dict[str, str]:
    """Connector values win per key, with the legacy env settings filling any
    the user left blank — so connecting IMAP-only keeps a working SMTP."""
    from . import registry
    stored = registry.load_config("mail", enabled_only=True) or {}
    env = env_config()
    return {k: (stored.get(k) or env.get(k, "")) for k in KEYS}


def _decode(h: str) -> str:
    parts = email.header.decode_header(h or "")
    return "".join(p.decode(enc or "utf-8", "replace") if isinstance(p, bytes) else p
                   for p, enc in parts)


def _port(config: dict[str, str]) -> int:
    return clamp(config.get("smtp_port", "587"), 1, 65535, 587)


def read_inbox(config: dict[str, str], limit: int = 10, query: str = "ALL") -> str:
    if not config.get("imap_host"):
        return "IMAP is not configured. Connect Mail on the Connectors page."
    limit = clamp(limit, 1, 50, 10)
    with imaplib.IMAP4_SSL(config["imap_host"]) as m:
        m.login(config.get("imap_user", ""), config.get("imap_password", ""))
        m.select("INBOX", readonly=True)
        _, data = m.search(None, query)
        ids = data[0].split()[-limit:]
        out = []
        for i in reversed(ids):
            _, msg_data = m.fetch(i, "(RFC822)")
            msg = email_lib.message_from_bytes(msg_data[0][1])
            body = ""
            for part in msg.walk():
                if part.get_content_type() == "text/plain":
                    body = part.get_payload(decode=True).decode(
                        part.get_content_charset() or "utf-8", "replace")
                    break
            out.append({
                "from": _decode(msg.get("From", "")),
                "subject": _decode(msg.get("Subject", "")),
                "date": msg.get("Date", ""),
                "body": body[:2000],
            })
    return wrap(json.dumps(out, ensure_ascii=False, indent=1))


def send_email(config: dict[str, str], to: str, subject: str, body: str) -> str:
    if not config.get("smtp_host"):
        return "SMTP is not configured. Connect Mail on the Connectors page."
    msg = MIMEText(body)
    msg["Subject"], msg["From"], msg["To"] = subject, config.get("smtp_user", ""), to
    with smtplib.SMTP(config["smtp_host"], _port(config)) as s:
        s.starttls()
        s.login(config.get("smtp_user", ""), config.get("smtp_password", ""))
        s.send_message(msg)
    return f"Email sent to {to}."


def verify(config: dict[str, str]) -> str:
    if not config.get("imap_host") and not config.get("smtp_host"):
        raise ConnectorError("Fill in an IMAP host (to read) and/or an SMTP host (to send).")
    secrets = (config.get("imap_password", ""), config.get("smtp_password", ""))
    try:
        if config.get("imap_host"):
            with imaplib.IMAP4_SSL(config["imap_host"]) as m:
                m.login(config.get("imap_user", ""), config.get("imap_password", ""))
                m.select("INBOX", readonly=True)
        if config.get("smtp_host"):
            with smtplib.SMTP(config["smtp_host"], _port(config)) as s:
                s.starttls()
                s.login(config.get("smtp_user", ""), config.get("smtp_password", ""))
    except Exception as e:  # noqa: BLE001
        raise ConnectorError(scrub(f"{type(e).__name__}: {e}", *secrets)[:300]) from None
    return config.get("imap_user") or config.get("smtp_user") or "mailbox"


def send(config: dict[str, str], message: str, subject: str) -> str:
    to = settings.notify_email or config.get("smtp_user", "")
    if not to:
        raise ConnectorError("No recipient: set NOTIFY_EMAIL or an SMTP user.")
    return send_email(config, to, subject or "Astra notification", message)


SPEC = ConnectorSpec(
    kind="mail",
    name="Mail",
    description="Read your inbox over IMAP and send email over SMTP — any provider.",
    icon="mail",
    module=sys.modules[__name__],
    fields=(
        Field("imap_host", "IMAP host", required=False, placeholder="imap.gmail.com"),
        Field("imap_user", "IMAP user", required=False, placeholder="you@example.com"),
        Field("imap_password", "IMAP password", secret=True, required=False,
              hint="Gmail: create an App Password (2-step verification required)."),
        Field("smtp_host", "SMTP host", required=False, placeholder="smtp.gmail.com"),
        Field("smtp_port", "SMTP port", required=False, placeholder="587"),
        Field("smtp_user", "SMTP user", required=False, placeholder="you@example.com"),
        Field("smtp_password", "SMTP password", secret=True, required=False),
    ),
    # Same names as the built-in tools: the built-ins delegate here with the
    # effective config, and registry.enabled_tools() never duplicates them.
    tools=(
        ConnectorTool(
            name="read_inbox",
            description="Read recent emails from the user's inbox via IMAP.",
            input_schema={"type": "object", "properties": {
                "limit": {"type": "integer", "default": 10},
                "query": {"type": "string", "default": "ALL"},
            }},
            fn=read_inbox),
        ConnectorTool(
            name="send_email",
            description="Send an email on the user's behalf. Requires human approval.",
            input_schema={"type": "object", "properties": {
                "to": {"type": "string"}, "subject": {"type": "string"},
                "body": {"type": "string"},
            }, "required": ["to", "subject", "body"]},
            fn=send_email, requires_approval=True),
    ),
    notes=("Notifications go to NOTIFY_EMAIL, or to the SMTP user when unset.",),
)
