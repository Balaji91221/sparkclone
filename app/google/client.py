"""Thin Gmail/Drive REST helpers over the stored OAuth credential.

All functions return plain strings (tool-friendly). When no Google account is
connected or the token refresh fails, they return RECONNECT_MSG instead of
raising, so a run degrades gracefully.
"""
from __future__ import annotations

import base64
import os
from email.message import EmailMessage

import httpx

from ..auth.google_oauth import get_access_token
from ..config import settings

GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me"
DRIVE = "https://www.googleapis.com/drive/v3"

RECONNECT_MSG = ("Google is not connected (or the connection expired). "
                 "Open Settings in the dashboard and click Connect Google.")


def _client(token: str) -> httpx.Client:
    return httpx.Client(timeout=30, headers={"Authorization": f"Bearer {token}"})


def gmail_list_messages(limit: int, query: str) -> list[dict] | str:
    token = get_access_token()
    if not token:
        return RECONNECT_MSG
    limit = max(1, min(int(limit), 50))
    with _client(token) as c:
        res = c.get(f"{GMAIL}/messages", params={"maxResults": limit, "q": query})
        if res.status_code != 200:
            return f"Gmail API error {res.status_code}: {res.text[:300]}"
        ids = [m["id"] for m in res.json().get("messages", [])]
        out = []
        for mid in ids:
            mres = c.get(f"{GMAIL}/messages/{mid}", params={
                "format": "metadata",
                "metadataHeaders": ["From", "Subject", "Date"],
            })
            if mres.status_code != 200:
                continue
            m = mres.json()
            headers = {h["name"]: h["value"]
                       for h in m.get("payload", {}).get("headers", [])}
            out.append({
                "from": headers.get("From", ""),
                "subject": headers.get("Subject", ""),
                "date": headers.get("Date", ""),
                "snippet": m.get("snippet", ""),
            })
        return out


def _resolve_attachment(path: str) -> str | None:
    """Only files inside the allowlisted attachments directory may be sent."""
    allowed = os.path.realpath(os.path.expanduser(settings.attachments_dir))
    real = os.path.realpath(os.path.expanduser(path))
    if not real.startswith(allowed + os.sep):
        return None
    return real if os.path.isfile(real) else None


def build_email(to: str, subject: str, body: str, html: str = "",
                attachments: list[str] | None = None) -> tuple[EmailMessage, list[str]]:
    """Assemble the MIME message; returns (message, rejected_attachment_paths)."""
    msg = EmailMessage()
    msg["To"], msg["Subject"] = to, subject
    msg.set_content(body)
    if html.strip():
        msg.add_alternative(html, subtype="html")
    rejected = []
    for path in attachments or []:
        real = _resolve_attachment(path)
        if not real:
            rejected.append(path)
            continue
        with open(real, "rb") as f:
            data = f.read()
        subtype = "pdf" if real.lower().endswith(".pdf") else "octet-stream"
        msg.add_attachment(data, maintype="application", subtype=subtype,
                           filename=os.path.basename(real))
    return msg, rejected


def gmail_send(to: str, subject: str, body: str, html: str = "",
               attachments: list[str] | None = None) -> str:
    token = get_access_token()
    if not token:
        return RECONNECT_MSG
    msg, rejected = build_email(to, subject, body, html, attachments)
    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
    with _client(token) as c:
        res = c.post(f"{GMAIL}/messages/send", json={"raw": raw})
        if res.status_code != 200:
            return f"Gmail send failed {res.status_code}: {res.text[:300]}"
        note = ""
        if rejected:
            note = (f" NOTE: {len(rejected)} attachment(s) were refused (outside "
                    f"{settings.attachments_dir}): {rejected}")
        return f"Email sent to {to} via Gmail (id {res.json().get('id', '?')}).{note}"


def drive_list(query: str, limit: int) -> list[dict] | str:
    token = get_access_token()
    if not token:
        return RECONNECT_MSG
    limit = max(1, min(int(limit), 50))
    params: dict = {
        "pageSize": limit,
        "fields": "files(id,name,mimeType,modifiedTime,size)",
        "orderBy": "modifiedTime desc",
    }
    if query:
        safe = query.replace("'", "\\'")
        params["q"] = f"name contains '{safe}' or fullText contains '{safe}'"
    with _client(token) as c:
        res = c.get(f"{DRIVE}/files", params=params)
        if res.status_code != 200:
            return f"Drive API error {res.status_code}: {res.text[:300]}"
        return res.json().get("files", [])


GOOGLE_DOC_EXPORTS = {
    "application/vnd.google-apps.document": "text/plain",
    "application/vnd.google-apps.spreadsheet": "text/csv",
    "application/vnd.google-apps.presentation": "text/plain",
}


def drive_read(file_id: str) -> str:
    token = get_access_token()
    if not token:
        return RECONNECT_MSG
    with _client(token) as c:
        meta = c.get(f"{DRIVE}/files/{file_id}", params={"fields": "id,name,mimeType"})
        if meta.status_code != 200:
            return f"Drive API error {meta.status_code}: {meta.text[:300]}"
        info = meta.json()
        mime = info.get("mimeType", "")
        if mime in GOOGLE_DOC_EXPORTS:
            res = c.get(f"{DRIVE}/files/{file_id}/export",
                        params={"mimeType": GOOGLE_DOC_EXPORTS[mime]})
        else:
            res = c.get(f"{DRIVE}/files/{file_id}", params={"alt": "media"})
        if res.status_code != 200:
            return f"Drive read failed {res.status_code}: {res.text[:300]}"
        if "text" in res.headers.get("content-type", "") or mime in GOOGLE_DOC_EXPORTS:
            return f"# {info.get('name', file_id)}\n\n{res.text[:40000]}"
        return (f"File {info.get('name', file_id)} is binary ({mime}); "
                f"{len(res.content)} bytes. Only text files can be read inline.")
