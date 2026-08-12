# Arclight

A self-hosted, Gemini-Spark-style 24/7 personal agent. Describe what you want in
plain language — "check my inbox every weekday at 9am and send me a summary" —
and Arc (the agent) drafts the automation, schedules it with cron, runs it in the
background, and pauses for your approval before anything sensitive.

Backend: FastAPI + SQLAlchemy + APScheduler, LLM via NVIDIA NIM (OpenAI-format).
Dashboard: Next.js App Router + Tailwind. Storage: Postgres (Docker) or SQLite.

## Features

- **Agent runtime** — tool-use loop with step budgets, streaming transcript
  persistence, auto-continue nudges, and honest failure states (a capped run is
  `failed`, never silently "succeeded").
- **Chat with Arc** — conversational task management: create, update, pause, and
  delete schedules from chat; the agent drafts task prompts for you and
  guardrails are appended server-side.
- **Google integration** — OAuth sign-in with Gmail (read + approval-gated send
  with real multipart HTML/attachments) and Drive (list/read, Docs export).
  Refresh tokens are Fernet-encrypted at rest.
- **MCP connectors** — connect any MCP server over **stdio**, **SSE**, or
  **streamable HTTP**; tools are discovered (with pagination), namespaced
  `mcp_<server>_<tool>`, and their results wrapped as untrusted content.
- **Skills** — reusable markdown instruction blocks attached to tasks.
- **Schedules** — cron triggers (APScheduler) plus on-demand "Run now".
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
docker compose up --build   # API on :8010, Postgres on :5433
```

Without Docker (Postgres already running, or leave `DATABASE_URL` unset for SQLite):

```bash
pip install -r requirements.txt
uvicorn app.main:app --port 8010 --reload
```

### Dashboard (Next.js)

The dashboard lives in `frontend/` and proxies `/api` + `/auth` to the FastAPI
server, so no CORS setup is needed:

```bash
cd frontend
npm install
npm run dev        # http://localhost:3000 — sign in with SPARK_API_TOKEN
```

### Environment

| Variable | Purpose |
|---|---|
| `SPARK_API_TOKEN` | Single-user bearer token for the dashboard/API |
| `SPARK_SECRET_KEY` | Fernet key material for encrypting Google refresh tokens |
| `NVIDIA_API_KEY` | NVIDIA NIM key (LLM provider) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth client for Gmail + Drive |
| `OAUTH_REDIRECT_URL` | e.g. `http://localhost:3000/auth/google/callback` |
| `YOUTUBE_API_KEY` | YouTube Data API v3 (video metadata) |
| `DATABASE_URL` | e.g. `postgresql+psycopg://spark:sparkpass@localhost:5433/sparkclone`; omit for SQLite |

## Example: weekday inbox digest

Open **Chat** and say: *"Every weekday at 9am, read my inbox, summarize what
matters, and email me a prioritized to-do list."* Arc drafts the task prompt,
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

- Single-user bearer-token auth (`SPARK_API_TOKEN`). Put the app behind HTTPS
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
- **MCP servers**: add them from Settings → MCP in the dashboard (any transport);
  `scripts/demo_mcp_server.py` is a tiny test server supporting all three.
- **Event triggers**: add a webhook endpoint that calls
  `scheduler.enqueue_run(task_id)`.
- **Distributed workers**: the in-process scheduler and rate limiter bound one
  process; scale-out needs a shared queue (e.g. Redis) and an external cron.
