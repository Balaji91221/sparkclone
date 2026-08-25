# 📋 Feature Plan — Sign in with Google as the dashboard login  (NEW FEATURE)

**Project:** sparkclone (Astra) · **Date:** 2026-08-25 · **Status:** Draft — awaiting approval

## 1. Need & Goal

Today you log into the dashboard by pasting a long random token (`SPARK_API_TOKEN`)
from your `.env` file. Separately, you "Connect Google" so the agent can read Gmail,
Drive and Calendar. That is two logins for one person, and the token one is clunky.

Goal: click **Sign in with Google** once. That single step both logs you into the
dashboard *and* connects Gmail/Drive/Calendar for the agent. The old token keeps
working for scripts, webhooks and tests, so nothing automated breaks.

## 2. Current State

- **Dashboard auth** — every API request carries `Authorization: Bearer <SPARK_API_TOKEN>`.
  Checked in `app/api/deps.py:8` (`auth()`) and, separately, in
  `app/auth/google_oauth.py:45` (`_require_token`). The frontend stores the token in
  `localStorage` (`frontend/lib/api.ts`) and shows `components/login.tsx` when missing.
- **Google connect** — `GET /auth/google/login` redirects to Google, `GET /auth/google/callback`
  exchanges the code, fetches the user's email, and saves **one** `GoogleCredential`
  row (encrypted refresh token, scopes). `/auth/google/status` and `/disconnect`
  require the bearer token. The login route is only reachable from Settings after
  you're already logged in, so it cannot *be* the login.
- **Proxying** — Next.js rewrites `/api/*` and `/auth/*` to the backend
  (`frontend/next.config.ts`), so browser and backend share the `localhost:3000`
  origin. That matters: a cookie set by the backend on a proxied response is a
  first-party cookie for the dashboard.
- **Security helpers** already exist: `make_state`/`check_state` (HMAC-signed OAuth
  state, `app/auth/crypto.py:39`) and `SPARK_SECRET_KEY` — reusable for signing the
  session cookie.
- **Dev shortcut** added earlier this session: `NEXT_PUBLIC_SPARK_DEV_TOKEN` in
  `frontend/.env.local` auto-signs-in and hides "Sign out". Becomes redundant here.

## 3. Scope

**In scope:** Google as dashboard login · signed session cookie · email allowlist ·
bearer token retained as a fallback · sign-out · frontend login screen swap ·
tests · README/`.env.example` updates.

**Out of scope:** multiple users / roles (app stays single-user) · other identity
providers · replacing the bearer token for webhooks and e2e · changing which
Google scopes are requested.

## 4. Assumptions

- Single-user app: exactly one allowed Google account (yours). Allowlist is a
  comma-separated env var, not a UI.
- Frontend and backend stay same-origin via the Next.js rewrites (dev and prod).
  If they are ever split onto different domains, the cookie needs `SameSite=None; Secure`
  and CORS `allow_credentials` — noted as a risk, not built now.
- The Google OAuth client already configured (`GOOGLE_CLIENT_ID/SECRET`,
  `OAUTH_REDIRECT_URL=http://localhost:3000/auth/google/callback`) is reused unchanged.
- The one existing `GoogleCredential` row stays the agent's credential; login simply
  refreshes it. Signing in with a *different* allowed account replaces it (same as today).

## 5. Entry Criteria

- [ ] Feature behavior agreed with user (this document)
- [ ] Affected areas identified (§8)
- [ ] Existing tests pass on current code: `pytest` and `cd frontend && npx playwright test`
- [ ] Working branch created from `feature/scheduler-agents`: `feature/google-signin-login`
- [ ] `SPARK_ALLOWED_EMAILS` value decided (your Gmail address)

## 6. Exit Criteria

- [ ] Fresh browser → dashboard shows "Sign in with Google" → after Google consent you
      land on the dashboard, and Settings shows Google connected with Calendar scope
- [ ] A Google account **not** on the allowlist is rejected with a clear message and no
      session is created
- [ ] "Sign out" clears the session and returns to the login screen (and stays there)
- [ ] `curl -H "Authorization: Bearer $SPARK_API_TOKEN"` still works on every `/api/*` route
- [ ] Webhook route `POST /api/hooks/{task_id}/{secret}` unaffected
- [ ] All existing pytest + Playwright tests pass; new tests in §12 pass
- [ ] README "Quick start" and `.env.example` document `SPARK_ALLOWED_EMAILS`

## 7. Requirements

**Functional**
- **FR-1:** `GET /auth/google/login` is public (no bearer token) and starts the OAuth flow.
- **FR-2:** On successful callback, if the Google email is in `SPARK_ALLOWED_EMAILS`, the
  backend stores the Google credential (as today) **and** sets a signed, `HttpOnly`
  session cookie, then redirects to `/`.
- **FR-3:** If the email is not allowlisted, no credential is stored, no cookie is set,
  and the user is redirected to `/?auth=denied` with an explanatory message.
- **FR-4:** `auth()` accepts a request when **either** the bearer token matches **or**
  a valid, unexpired session cookie is present.
- **FR-5:** `POST /auth/logout` clears the session cookie. It does **not** revoke the
  Google credential (that remains "Disconnect Google" in Settings).
- **FR-6:** `GET /auth/session` returns `{signed_in: bool, email: str}` so the frontend can
  decide between login screen and dashboard without a stored token.
- **FR-7:** Login screen shows a single "Sign in with Google" button, plus a collapsed
  "Use API token instead" fallback that keeps the current form.
- **FR-8:** Sidebar "Sign out" calls `/auth/logout` and clears any stored token.

**Non-functional**
- **NFR-1:** Session cookie is `HttpOnly`, `SameSite=Lax`, `Secure` when
  `SPARK_ENV=production`, signed with `SPARK_SECRET_KEY` (HMAC), expiry 7 days.
  JavaScript cannot read it, which is the point.
- **NFR-2:** Startup refuses to run with the default `SPARK_SECRET_KEY` in production
  (already enforced for the token in `app/config.py:92` — extend the same check).
- **NFR-3:** If `SPARK_ALLOWED_EMAILS` is empty, Google login is disabled (login page
  shows only the token form) rather than allowing everyone.
- **NFR-4:** No new dependencies — `itsdangerous`-style signing done with stdlib `hmac`,
  matching `crypto.py`.
- **NFR-5:** OAuth `state` remains HMAC-checked (existing) to block login CSRF.

## 8. Affected Files & Folder Structure Changes

```
app/
├── config.py                    # MODIFIED — add allowed_emails, session_max_age; prod secret check
├── api/deps.py                  # MODIFIED — auth(): bearer OR session cookie
├── auth/
│   ├── crypto.py                # MODIFIED — make_session(email) / read_session(cookie) (HMAC + expiry)
│   ├── google_oauth.py          # MODIFIED — login public; callback sets cookie + allowlist check;
│   │                            #            new /auth/session and /auth/logout
│   └── session.py               # NEW — cookie name/attrs, set/clear helpers (keeps oauth file < 400 lines)
├── main.py                      # unchanged (router already mounted)
frontend/
├── lib/api.ts                   # MODIFIED — getSession(), logout(); request() no longer hard-requires a token
├── components/app-shell.tsx     # MODIFIED — gate on session OR token
├── components/login.tsx         # MODIFIED — Google button first, token form as fallback
├── components/sidebar.tsx       # MODIFIED — Sign out → logout(); drop hasDevToken() gating
├── app/settings/page.tsx        # MODIFIED — wording: "Reconnect Google" (login = connect)
├── e2e/helpers.ts               # unchanged — e2e keeps signing in via bearer token
├── .env.local                   # REMOVE NEXT_PUBLIC_SPARK_DEV_TOKEN (obsolete)
tests/
├── test_session_auth.py         # NEW — cookie sign/verify, auth() precedence, allowlist, logout
├── test_google_oauth.py         # NEW — callback with mocked Google: allowed vs denied email
.env.example, README.md          # MODIFIED — SPARK_ALLOWED_EMAILS + new login flow
```

## 9. Architecture Flowchart (with feature highlighted)

```mermaid
flowchart TD
    B[Browser: dashboard] -->|click Sign in with Google| L[/auth/google/login<br/>now public/]:::new
    L --> G[Google consent screen]
    G -->|code + state| C[/auth/google/callback/]
    C --> S{state valid &<br/>email allowlisted?}:::new
    S -->|no| D[Redirect /?auth=denied]:::new
    S -->|yes| DB[(GoogleCredential row<br/>encrypted refresh token)]
    S -->|yes| K[Set signed HttpOnly<br/>session cookie]:::new
    K --> H[Redirect to /]
    B -->|/api/* with cookie| A{auth():<br/>bearer OR cookie}:::new
    W[Webhook / curl / e2e<br/>Bearer token] --> A
    A --> R[API routes]
    B -->|Sign out| O[/auth/logout<br/>clear cookie/]:::new
    classDef new fill:#d4f7d4
```

**Legend:** green = new or changed. Login and Google-connect are now the *same* OAuth
round-trip; the callback both stores the agent's Google credential and issues the
dashboard session. `auth()` is the single gate — the bearer path is untouched, so
webhooks, `curl` and Playwright keep working exactly as before.

## 10. Implementation Phases

| Phase | Goal | Tasks | Files | Effort |
|---|---|---|---|---|
| 1 | Session primitives (backend only, runnable via pytest) | `make_session`/`read_session` with HMAC + expiry; `session.py` cookie helpers; config `allowed_emails`, `session_max_age`; prod secret check | `crypto.py`, `session.py`, `config.py`, `tests/test_session_auth.py` | S |
| 2 | Dual auth gate | `auth()` accepts cookie or bearer; `_require_token` in oauth file delegates to `auth()`; add `/auth/session` + `/auth/logout` | `deps.py`, `google_oauth.py` | S |
| 3 | Google login issues session | Make `/login` public; callback: allowlist check → set cookie → redirect `/`; denied → `/?auth=denied` (no credential stored) | `google_oauth.py`, `tests/test_google_oauth.py` | M |
| 4 | Frontend | `getSession()`/`logout()` in `api.ts`; `app-shell` gates on session or token; new login screen; sidebar sign-out; settings wording; remove dev-token shortcut | `api.ts`, `app-shell.tsx`, `login.tsx`, `sidebar.tsx`, `settings/page.tsx`, `.env.local` | M |
| 5 | Docs + verification | README, `.env.example`; full test run; manual walkthrough (§12) | `README.md`, `.env.example` | S |

Each phase leaves the app runnable; after Phase 3 you can already log in via Google
using `curl -c` to see the cookie, before the UI exists.

## 11. Risks & Rollback

| Risk | Mitigation |
|---|---|
| Lock-out: allowlist typo → Google login always denied | Bearer-token login remains on the login page; message says "email X is not allowed", so the typo is visible |
| Anyone with a Google account could log in if allowlist is empty | NFR-3: empty allowlist **disables** Google login instead of opening it |
| Cookie not sent because frontend and backend are on different origins in prod | Assumption documented; same-origin via Next rewrites. If split later: `SameSite=None; Secure` + `allow_credentials` — flagged, not built |
| Session forged if `SPARK_SECRET_KEY` is the default | NFR-2: production startup refuses default secret (extends existing check) |
| Playwright e2e break because login screen changed | e2e already injects the bearer token into `localStorage` before boot (`e2e/helpers.ts:27`); that path is kept |
| Google callback redirects to `/settings?google=connected` today; other code may depend on it | Grep for `google=` in frontend and keep the Settings handling for the "Reconnect" path |

**Rollback:** the work lives on `feature/google-signin-login`; abandon the branch and the
current token login is untouched. No database migration is involved (no schema change),
so rolling back leaves data intact. If deployed, unsetting `SPARK_ALLOWED_EMAILS`
disables Google login immediately without a code change.

## 12. Testing & Verification

**Automated (pytest)**
- `test_session_auth.py`: cookie round-trip; tampered cookie rejected; expired cookie
  rejected; `auth()` passes with valid cookie, with valid bearer, and 401 with neither;
  `/auth/logout` clears the cookie; `/auth/session` reports email.
- `test_google_oauth.py`: mock Google token + userinfo endpoints with `httpx` mocking;
  allowlisted email → credential row + `Set-Cookie` + redirect `/`; non-allowlisted →
  no row, no cookie, redirect `/?auth=denied`; empty allowlist → `/login` returns 404/disabled.
- Existing suites unchanged and green.

**Automated (Playwright)** — existing specs continue to sign in via bearer token. Add one
spec: unauthenticated visit shows the Google button; `?auth=denied` shows the message.

**Manual walkthrough** (maps to Exit Criteria)
1. Clear cookies/localStorage → open http://localhost:3000 → "Sign in with Google" visible.
2. Sign in with the allowlisted account → dashboard loads; Settings shows connected with
   Calendar scope (this also fixes the "Calendar permission missing" notice).
3. Sign out → back to login; refresh → still login.
4. Sign in with a *different* Google account → denied message; Settings via `curl` shows
   the previous credential untouched.
5. `curl -H "Authorization: Bearer $SPARK_API_TOKEN" localhost:8000/api/tasks` → 200.

## 13. Beginner Notes

- **OAuth** — a standard way for Google to prove who you are to another app, and to hand
  that app limited permissions ("scopes"), without giving it your password.
- **Scope** — one permission in OAuth, e.g. "read Gmail". Google only grants *new* scopes
  on a fresh consent screen, which is why Calendar needs a reconnect today.
- **Session cookie** — a small signed note the server puts in your browser saying "this
  browser is logged in as X". The browser sends it back automatically with each request.
- **HttpOnly / SameSite / Secure** — cookie flags: JavaScript can't read it, it isn't sent
  from other sites (blocks CSRF), and it's only sent over HTTPS.
- **HMAC signing** — a checksum made with a secret key; if anyone edits the cookie, the
  checksum no longer matches and the server rejects it.
- **CSRF** — tricking a logged-in browser into sending a request the user didn't intend;
  the signed OAuth `state` and `SameSite` cookie both defend against it.
- **Allowlist** — explicit list of who is permitted; everyone else is denied by default.
- **Bearer token** — the current `SPARK_API_TOKEN`: whoever holds ("bears") it is let in.
  Fine for scripts; awkward for humans, which is why we add Google login.
- **Same-origin** — browser and API appear to be on the same address (`localhost:3000`),
  thanks to Next.js rewrites; cookies work simply under that condition.
