# SparkClone

A self-hosted, Spark-style 24/7 personal agent built on the Claude API. Define tasks in plain language, attach reusable skills, schedule them with cron, and let the agent read your inbox, browse the web, run code, and deliver digests — pausing for your approval before any sensitive action.

## Features

- **Agent runtime** — Claude Messages API tool-use loop with iteration caps, transcript persistence, and retry/backoff.
- **Skills** — reusable markdown instruction blocks injected into any task's prompt.
- **Schedules** — cron triggers (APScheduler) plus on-demand "Run now".
- **Tools** — `read_inbox` (IMAP), `send_email` (SMTP, approval-gated), `web_fetch`, `run_python` (sandboxed subprocess), `notify`.
- **Approval gates** — sensitive tool calls pause the run until you approve or deny from the dashboard.
- **Prompt-injection defense** — all external content (emails, web pages) is wrapped in `<untrusted_content>` and the system prompt forbids following instructions inside it.
- **Rate limiting** — every Anthropic call goes through a shared sliding-window limiter (`ANTHROPIC_MAX_RPS`, queue-and-wait, retries included).
- **Dashboard** — single-page mission-control UI with live run log and approval queue.

## Quick start

```bash
cp .env.example .env   # fill in ANTHROPIC_API_KEY and SPARK_API_TOKEN
docker compose up --build
# open http://localhost:8000 and paste your SPARK_API_TOKEN
```

Without Docker:

```bash
pip install -r requirements.txt
export $(grep -v '^#' .env | xargs)
uvicorn app.main:app --reload
```

### Dashboard (Next.js)

The dashboard lives in `frontend/` and proxies `/api` + `/health` to the FastAPI
server on :8000, so no CORS setup is needed:

```bash
cd frontend
npm install
npm run dev        # http://localhost:3000 — sign in with SPARK_API_TOKEN
```

The legacy single-file dashboard is still served by FastAPI at
http://localhost:8000 and will be removed once the Google OAuth phases land.

## Example: Monday inbox digest

1. Create a skill `inbox-digest-style`: *"Group by importance; flag invoices and deadlines first."*
2. Create a task:
   - Prompt: *"Read my inbox from the past 7 days, summarize what matters, and notify me with a prioritized to-do list."*
   - Cron: `0 9 * * MON`
3. It runs every Monday 09:00 (server TZ); results land in the run log and your notify email.

## Architecture

```
frontend/ (Next.js) ──► FastAPI (app/main.py + app/api routers) ──► SQLite/Postgres (app/db.py)
                        │
                        ├─ scheduler.py  (APScheduler cron → enqueue Run)
                        │        └─ ThreadPool → agent/runtime.py
                        │                          │
                        │                          ├─ Claude Messages API (rate-limited)
                        │                          └─ tools/registry.py (email, web, code, notify)
                        └─ approvals API (pause/resume sensitive tool calls)
```

## Security notes

- Single-user bearer-token auth (`SPARK_API_TOKEN`). Put the app behind HTTPS (reverse proxy) before exposing it.
- `send_email` always requires human approval; add `requires_approval=True` to any tool you consider sensitive (payments, deletes).
- `run_python` uses a subprocess with a timeout. For untrusted multi-tenant use, swap it for a Docker/gVisor/Firecracker sandbox — the tool interface is unchanged.
- Email/web content is treated as untrusted data; never as instructions.
- Use Gmail App Passwords (or a dedicated mailbox) rather than your primary password.

## Extending

- **New tool**: add a function + `register(Tool(...))` in `app/tools/registry.py`. Set `requires_approval=True` for anything sensitive.
- **MCP connectors**: wrap an MCP client call in a tool function — the agent loop doesn't care where the tool's result comes from.
- **Postgres**: set `DATABASE_URL=postgresql+psycopg://...` and add `psycopg[binary]` to requirements.
- **Distributed workers**: the in-process rate limiter bounds one process; if you scale to multiple containers sharing one API key, switch to a Redis-based sliding-window limiter so the cap is enforced globally.
- **Event triggers**: add a webhook endpoint that calls `scheduler.enqueue_run(task_id)`.
