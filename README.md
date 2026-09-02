# Astra

A self-hosted, Gemini-Spark-style 24/7 personal agent. Describe what you want in
plain language — "check my inbox every weekday at 9am and send me a summary" —
and Astra (the agent) drafts the automation, schedules it with cron, runs it in the
background, and pauses for your approval before anything sensitive.

Backend: FastAPI + SQLAlchemy + APScheduler, LLM via NVIDIA NIM (OpenAI-format).
Dashboard: Next.js App Router + Tailwind. Storage: Postgres (Docker) or SQLite.

## Features

- **Agent runtime** — tool-use loop with step budgets, streaming transcript
  persistence, auto-continue nudges, and honest failure states (a capped run is
  `failed`, never silently "succeeded").
- **Chat with Astra** — conversational task management: create, update, pause, and
  delete schedules from chat; the agent drafts task prompts for you and
  guardrails are appended server-side.
- **Google integration** — OAuth sign-in with Gmail (read + approval-gated send
  with real multipart HTML/attachments) and Drive (list/read, Docs export).
  Refresh tokens are Fernet-encrypted at rest.
- **Connectors** — connect Slack, Telegram, Mail (IMAP/SMTP), Discord and
  outbound webhooks from the dashboard's **Connectors** page. Credentials are
  verified against the real service before they are saved, Fernet-encrypted at
  rest, and never returned by any endpoint. Each connected service adds its
  tools to the agent (reads are free, sends are approval-gated) and can be
  flagged as a notification channel.
- **MCP connectors** — connect any MCP server over **stdio**, **SSE**, or
  **streamable HTTP**; tools are discovered (with pagination), namespaced
  `mcp_<server>_<tool>`, and their results wrapped as untrusted content.
- **Skills** — reusable markdown instruction blocks attached to tasks.
- **Schedules** — cron, fixed intervals ("every 15 minutes"), and one-off runs
  at a datetime ("remind me tomorrow at 9am" — fires once, then disables
  itself), plus on-demand "Run now". Missed fires while the server was down run
  once on startup (1-hour grace, coalesced). Tasks may opt into up to 3
  automatic retries with backoff; each retry is a visible run.
- **Webhook triggers** — `POST /api/hooks/{task_id}/{secret}` starts a run from
  any external service (GitHub push, form submission, alert). Authenticated by
  a per-task rotatable secret, never the dashboard token; rate-capped to one
  fire per minute per task.
- **Approval gates** — sensitive tool calls pause the run or chat until you
  approve or deny from the dashboard.
- **Prompt-injection defense** — all external content (emails, web pages,
  transcripts, MCP results and tool descriptions) is wrapped in
  `<untrusted_content>` and the system prompt forbids following instructions
  inside it.
- **Run monitoring** — live transcript with per-step tool activity, reasoning,
  and results, Gemini-Spark style.

## Quick start

```bash
cp .env.example .env        # fill in the values below
docker compose up --build   # API on :8000, Postgres on :5433
```

Without Docker (Postgres already running, or leave `DATABASE_URL` unset for SQLite):

```bash
pip install -r requirements.txt
uvicorn app.main:app --port 8000 --reload
```

### Dashboard (Next.js)

The dashboard lives in `frontend/` and proxies `/api` + `/auth` to the FastAPI
server, so no CORS setup is needed:

```bash
cd frontend
npm install
npm run dev        # http://localhost:3000 — "Sign in with Google" (SPARK_ALLOWED_EMAILS)
                   # or paste SPARK_API_TOKEN
```

### Environment

| Variable | Purpose |
|---|---|
| `SPARK_ALLOWED_EMAILS` | Google accounts (comma-separated) allowed to sign in to the dashboard; empty disables Google sign-in |
| `SPARK_API_TOKEN` | Bearer token for scripts/webhooks/e2e, and a fallback dashboard login |
| `SPARK_SECRET_KEY` | Fernet key material for encrypting Google refresh tokens |
| `NVIDIA_API_KEY` | NVIDIA NIM key (LLM provider) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth client for sign-in + Gmail/Drive/Calendar |
| `OAUTH_REDIRECT_URL` | e.g. `http://localhost:3000/auth/google/callback` |
| `YOUTUBE_API_KEY` | YouTube Data API v3 (video metadata) |
| `DATABASE_URL` | e.g. `postgresql+psycopg://spark:sparkpass@localhost:5433/sparkclone`; omit for SQLite |

## Starter skills

Skills are reusable instruction blocks the agent can attach to any task. Seed a
curated set of twelve (inbox triage, daily briefing, research digest, meeting
prep, market watch, email drafting, …) with:

```bash
python -m scripts.seed_skills        # creates missing skills, refreshes existing ones
python -m scripts.seed_skills --list # preview without writing
```

## Example: weekday inbox digest

Open **Chat** and say: *"Every weekday at 9am, read my inbox, summarize what
matters, and email me a prioritized to-do list."* Astra drafts the task prompt,
creates the schedule (`0 9 * * MON-FRI`), and confirms. Refine it the same way:
*"make it 8pm instead"* updates the task in place.

## Architecture

```
frontend/ (Next.js) ──► FastAPI (app/main.py + app/api routers) ──► Postgres / SQLite (app/db.py)
                        │
                        ├─ scheduler.py  (APScheduler cron → enqueue Run)
                        │        └─ ThreadPool → agent/agent.py (task runs)
                        │                        agent/chat.py  (chat turns)
                        │                          │
                        │                          ├─ providers.py (NVIDIA NIM, retries)
                        │                          ├─ tools/registry.py (Gmail, Drive, web, code, YouTube)
                        │                          ├─ tools/management.py (chat-only task/skill CRUD)
                        │                          └─ mcp/manager.py (stdio / SSE / streamable HTTP)
                        └─ approvals API (pause/resume sensitive tool calls)
```

## Security notes

- Single-user auth: Google sign-in (allowlisted email, signed HttpOnly session cookie)
  or bearer token (`SPARK_API_TOKEN`). Put the app behind HTTPS
  (reverse proxy) before exposing it.
- `send_gmail` always requires human approval; set `requires_approval=True` on
  any tool you consider sensitive.
- Email attachments may only be read from the configured attachments directory
  (`SPARK_ATTACHMENTS_DIR`); paths are resolved and checked.
- `run_python` uses a subprocess with a timeout. For untrusted multi-tenant use,
  swap in a Docker/gVisor/Firecracker sandbox — the tool interface is unchanged.
- All external content is treated as untrusted data, never as instructions —
  including MCP tool descriptions (tool-poisoning defense).
- Google OAuth apps in Testing mode expire refresh tokens after 7 days; publish
  the consent screen for long-lived tokens.

## Extending

- **New tool**: add a function + `register(Tool(...))` in
  `app/tools/registry.py`. Set `requires_approval=True` for anything sensitive.
- **New connector**: add one module to `app/connectors/` exporting `verify()`,
  optional `send()`, and a `SPEC = ConnectorSpec(...)` listing its fields and
  tools, then add it to `SPECS` in `app/connectors/registry.py`. The API, the
  dashboard page and the agent wiring pick it up with no further changes.
- **Connectors**: connect them from the dashboard's Connectors page. `notify`
  delivers to every connector flagged as a notification channel plus the email
  chain (Gmail → SMTP → stdout); `notify(channel="telegram")` targets one.
- **MCP servers**: add them from Settings → Integrations in the dashboard (any transport);
  `scripts/demo_mcp_server.py` is a tiny test server supporting all three.
- **Event triggers**: built in — create a task with `trigger_type="webhook"`
  and point the external service at its `webhook_url`.
- **Distributed workers**: the in-process scheduler and rate limiter bound one
  process; scale-out needs a shared queue (e.g. Redis) and an external cron.
