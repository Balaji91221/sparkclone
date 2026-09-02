"""Connectors: API, secret handling, tool merging, gating, and notify fan-out."""
from __future__ import annotations

from unittest.mock import patch

import pytest

from app.connectors import registry as connectors
from app.connectors.base import ConnectorError, chunks, scrub
from app.db import Connector, db_session
from app.tools.registry import TOOLS
from tests.conftest import AUTH

TOKEN = "xoxb-super-secret-token-value"


@pytest.fixture(autouse=True)
def no_email_fallback():
    """notify()'s email chain is the developer's real .env — never exercise it."""
    with patch("app.tools.registry._notify_email", return_value=""):
        yield


@pytest.fixture(autouse=True)
def clean_connectors():
    with db_session() as db:
        db.query(Connector).delete()
        db.commit()
    yield
    with db_session() as db:
        db.query(Connector).delete()
        db.commit()


def connect_slack(client, token: str = TOKEN, channel: str = "general"):
    with patch("app.connectors.slack.verify", return_value="astra in acme"):
        return client.post("/api/connectors/slack", headers=AUTH, json={
            "config": {"bot_token": token, "default_channel": channel}})


# ------------------------------------------------------------------- listing

def test_list_shows_every_kind_disconnected(client):
    body = client.get("/api/connectors", headers=AUTH).json()
    kinds = {c["kind"] for c in body}
    assert kinds == {"slack", "telegram", "mail", "discord", "webhook"}
    for c in body:
        assert c["connected"] is False
        assert c["fields"] and c["tools"]


def test_unknown_kind_is_404(client):
    assert client.post("/api/connectors/nope", headers=AUTH, json={}).status_code == 404


def test_requires_auth(client):
    assert client.get("/api/connectors").status_code == 401


# ------------------------------------------------------------------ connect

def test_connect_verifies_and_stores_encrypted(client):
    res = connect_slack(client)
    assert res.status_code == 200
    body = res.json()
    assert body["connected"] and body["identity"] == "astra in acme"
    assert body["enabled"] is True
    with db_session() as db:
        row = db.get(Connector, "slack")
    assert TOKEN not in row.config_enc          # Fernet ciphertext at rest
    assert connectors.load_config("slack")["bot_token"] == TOKEN


def test_failed_verification_saves_nothing(client):
    with patch("app.connectors.slack.verify",
               side_effect=ConnectorError("invalid_auth")):
        res = client.post("/api/connectors/slack", headers=AUTH,
                          json={"config": {"bot_token": "bad"}})
    assert res.status_code == 422
    assert "invalid_auth" in res.text
    assert connectors.load_config("slack") is None


def test_missing_required_field_is_422(client):
    res = client.post("/api/connectors/slack", headers=AUTH, json={"config": {}})
    assert res.status_code == 422
    assert "Bot token" in res.text


def test_blank_secret_on_resave_keeps_stored_value(client):
    connect_slack(client)
    with patch("app.connectors.slack.verify", return_value="astra in acme"):
        res = client.post("/api/connectors/slack", headers=AUTH, json={
            "config": {"bot_token": "", "default_channel": "alerts"}})
    assert res.status_code == 200
    config = connectors.load_config("slack")
    assert config["bot_token"] == TOKEN          # unchanged
    assert config["default_channel"] == "alerts"  # updated


# ------------------------------------------------------------- secret safety

def test_no_endpoint_ever_returns_the_secret(client):
    connect_slack(client)
    paths = ["/api/connectors", "/api/tools", "/api/settings/notifications"]
    for path in paths:
        assert TOKEN not in client.get(path, headers=AUTH).text
    assert TOKEN not in connect_slack(client).text
    with patch("app.connectors.slack.verify", return_value="astra in acme"):
        assert TOKEN not in client.post("/api/connectors/slack/test", headers=AUTH).text


def test_failed_verify_error_does_not_leak_the_token(client):
    """Telegram puts the token in the URL, so error text must be scrubbed."""
    import httpx

    from app.connectors import telegram
    token = "123456:AA-secret-bot-token"
    boom = httpx.ConnectError(f"connect failed: api.telegram.org/bot{token}/getMe")
    with patch("httpx.request", side_effect=boom):
        res = client.post("/api/connectors/telegram", headers=AUTH,
                          json={"config": {"bot_token": token}})
    assert res.status_code == 422
    assert token not in res.text
    assert "***" in res.text
    with pytest.raises(ConnectorError) as e:
        with patch("httpx.request",
                   side_effect=httpx.ConnectError(f"boom {token}")):
            telegram.verify({"bot_token": token})
    assert token not in str(e.value)


def test_scrub_removes_every_secret():
    assert scrub("a=1 b=2", "1", "2") == "a=*** b=***"
    assert scrub("nothing", "") == "nothing"


def test_list_reports_secret_presence_not_value(client):
    connect_slack(client)
    slack = next(c for c in client.get("/api/connectors", headers=AUTH).json()
                 if c["kind"] == "slack")
    token_field = next(f for f in slack["fields"] if f["key"] == "bot_token")
    assert token_field["secret"] and token_field["has_value"] and token_field["value"] == ""
    # Non-secret fields round-trip so the edit form can prefill them.
    channel = next(f for f in slack["fields"] if f["key"] == "default_channel")
    assert channel["value"] == "general"


# ------------------------------------------------------- lifecycle endpoints

def test_toggle_notify_and_disconnect(client):
    connect_slack(client)
    assert client.post("/api/connectors/slack/toggle", headers=AUTH).json()["enabled"] is False
    assert client.post("/api/connectors/slack/toggle", headers=AUTH).json()["enabled"] is True
    assert client.post("/api/connectors/slack/notify", headers=AUTH).json()["notify"] is True
    assert client.delete("/api/connectors/slack", headers=AUTH).status_code == 200
    assert connectors.load_config("slack") is None
    assert client.post("/api/connectors/slack/toggle", headers=AUTH).status_code == 404


def test_test_endpoint_reverifies(client):
    connect_slack(client)
    with patch("app.connectors.slack.verify", return_value="astra in acme") as v:
        res = client.post("/api/connectors/slack/test", headers=AUTH)
    assert res.status_code == 200 and v.called
    assert res.json()["identity"] == "astra in acme"


# --------------------------------------------------------------- tool merging

def test_enabled_connector_tools_are_bound_and_listed(client):
    assert connectors.enabled_tools() == []
    connect_slack(client)
    names = {t.name for t in connectors.enabled_tools()}
    assert names == {"slack_list_channels", "slack_read_channel", "slack_post_message"}
    # Config is bound in: the agent calls fn(**args) with no config argument.
    tool = next(t for t in connectors.enabled_tools() if t.name == "slack_post_message")
    with patch("app.connectors.slack._api", return_value={"ok": True}) as api:
        with patch("app.connectors.slack._resolve_channel", return_value="C1"):
            tool.fn(text="hi")
    assert api.call_args.args[0]["bot_token"] == TOKEN


def test_disabled_connector_contributes_no_tools(client):
    connect_slack(client)
    client.post("/api/connectors/slack/toggle", headers=AUTH)
    assert connectors.enabled_tools() == []


def test_connector_tools_reach_a_run_and_respect_allowed_tools(client):
    from app.agent.agent import AstraAgent
    from app.db import Run, Task
    connect_slack(client)
    with db_session() as db:
        task = Task(name="t", prompt="p", allowed_tools=[])
        db.add(task)
        db.commit()
        run = Run(task_id=task.id)
        db.add(run)
        db.commit()
        run_id, task_obj = run.id, task

        agent = AstraAgent(run_id)
        with patch("app.mcp.manager.enabled_tools", return_value=[]):
            _, specs = agent._build_context(task_obj)
        assert "slack_post_message" in {s["name"] for s in specs}

        task_obj.allowed_tools = ["notify"]
        agent2 = AstraAgent(run_id)
        with patch("app.mcp.manager.enabled_tools", return_value=[]):
            _, specs2 = agent2._build_context(task_obj)
    names = {s["name"] for s in specs2}
    assert "slack_post_message" not in names and "notify" in names


def test_sends_are_approval_gated_reads_are_not(client):
    connect_slack(client)
    gated = {t.name: t.requires_approval for t in connectors.enabled_tools()}
    assert gated["slack_post_message"] is True
    assert gated["slack_read_channel"] is False
    assert gated["slack_list_channels"] is False


def test_tools_api_lists_connector_tools_with_source(client):
    connect_slack(client)
    tools = client.get("/api/tools", headers=AUTH).json()
    entry = next(t for t in tools if t["name"] == "slack_post_message")
    assert entry["source"] == "slack" and entry["requires_approval"] is True


def test_mail_tools_never_duplicate_the_builtins(client):
    """read_inbox/send_email stay single built-ins that delegate to the config."""
    with patch("app.connectors.mail.verify", return_value="you@example.com"):
        client.post("/api/connectors/mail", headers=AUTH, json={"config": {
            "imap_host": "imap.example.com", "imap_user": "you@example.com",
            "imap_password": "pw", "smtp_host": "smtp.example.com",
            "smtp_port": "587", "smtp_user": "you@example.com", "smtp_password": "pw"}})
    assert connectors.enabled_tools() == []
    names = [t["name"] for t in client.get("/api/tools", headers=AUTH).json()]
    assert names.count("read_inbox") == 1 and names.count("send_email") == 1


def test_mail_builtin_uses_connector_config_over_env():
    with patch("app.connectors.registry.load_config",
               return_value={"smtp_host": "smtp.connector", "smtp_user": "c@x",
                             "smtp_password": "pw", "smtp_port": "587"}):
        with patch("app.connectors.mail.send_email",
                   return_value="Email sent.") as send:
            TOOLS["send_email"].fn(to="a@b", subject="s", body="b")
    assert send.call_args.args[0]["smtp_host"] == "smtp.connector"


# --------------------------------------------------------------------- notify

def test_notify_fans_out_to_flagged_connectors(client):
    connect_slack(client)
    client.post("/api/connectors/slack/notify", headers=AUTH)
    with patch("app.connectors.slack.send",
               return_value="Posted to #general.") as send:
        out = TOOLS["notify"].fn(message="digest", subject="Astra")
    assert send.called
    assert send.call_args.args[1:] == ("digest", "Astra")
    assert "Slack" in out


def test_notify_skips_connectors_not_flagged(client):
    connect_slack(client)  # connected but notify flag off
    with patch("app.connectors.slack.send") as send:
        out = TOOLS["notify"].fn(message="digest")
    assert not send.called
    assert "no delivery channel configured" in out


def test_notify_can_target_one_channel(client):
    connect_slack(client)  # not flagged, but explicitly addressed
    with patch("app.connectors.slack.send", return_value="Posted.") as send:
        out = TOOLS["notify"].fn(message="hi", channel="slack")
    assert send.called and "Slack" in out
    assert "No connected connector" in TOOLS["notify"].fn(message="hi", channel="telegram")


def test_notify_survives_a_failing_channel(client):
    connect_slack(client)
    client.post("/api/connectors/slack/notify", headers=AUTH)
    with patch("app.connectors.slack.send", side_effect=ConnectorError("channel_not_found")):
        out = TOOLS["notify"].fn(message="digest")
    assert "delivery failed" in out and "channel_not_found" in out


def test_notify_stays_ungated():
    assert TOOLS["notify"].requires_approval is False


def test_mail_falls_back_to_env_for_blank_keys():
    """Connecting IMAP-only must not knock out an env-configured SMTP."""
    from app.connectors import mail
    with patch("app.connectors.registry.load_config",
               return_value={"imap_host": "imap.connector", "smtp_host": ""}):
        with patch("app.connectors.mail.env_config",
                   return_value={k: "" for k in mail.KEYS} | {"smtp_host": "smtp.env"}):
            config = mail.effective_config()
    assert config["imap_host"] == "imap.connector"
    assert config["smtp_host"] == "smtp.env"


def test_webhook_url_is_treated_as_a_secret(client):
    """Incoming-webhook URLs carry their token in the path."""
    url = "https://hooks.example.com/services/T000/B000/zzSECRETPATHzz"
    with patch("app.connectors.webhook.verify", return_value="hooks.example.com"):
        res = client.post("/api/connectors/webhook", headers=AUTH,
                          json={"config": {"url": url}})
    assert res.status_code == 200
    assert url not in res.text
    assert url not in client.get("/api/connectors", headers=AUTH).text
    hook = next(c for c in client.get("/api/connectors", headers=AUTH).json()
                if c["kind"] == "webhook")
    field = next(f for f in hook["fields"] if f["key"] == "url")
    assert field["secret"] and field["has_value"] and field["value"] == ""
    assert connectors.load_config("webhook")["url"] == url


def test_notification_settings_report_connector_channels(client):
    connect_slack(client)
    client.post("/api/connectors/slack/notify", headers=AUTH)
    body = client.get("/api/settings/notifications", headers=AUTH).json()
    assert body["channels"] == ["slack"]


# ---------------------------------------------------------------- unit bits

def test_chunks_never_exceed_the_limit():
    text = "\n".join(f"line {i}" for i in range(500))
    parts = chunks(text, 100)
    assert all(len(p) <= 100 for p in parts)
    assert "".join(p.replace("\n", "") for p in parts) == text.replace("\n", "")
    assert chunks("short", 100) == ["short"]


def test_unreadable_config_reports_a_key_error(client):
    connect_slack(client)
    with db_session() as db:
        row = db.get(Connector, "slack")
        row.config_enc = "not-a-fernet-token"
        db.commit()
    slack = next(c for c in client.get("/api/connectors", headers=AUTH).json()
                 if c["kind"] == "slack")
    assert "SPARK_SECRET_KEY" in slack["error"]
    assert connectors.enabled_tools() == []
