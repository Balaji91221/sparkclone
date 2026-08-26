#!/usr/bin/env bash
# Runs the whole Astra/sparkclone stack: FastAPI backend + Next.js dashboard.
#
#   ./run.sh              start both (backend :8000, frontend :3000)
#   ./run.sh backend      backend only
#   ./run.sh frontend     frontend only
#   ./run.sh docker       docker compose up --build (API + Postgres)
#   ./run.sh test         pytest + frontend typecheck/lint
#   ./run.sh down         stop whatever is running on both ports
#
# Env overrides: API_PORT, WEB_PORT, RELOAD=0 to disable uvicorn --reload,
#               KILL_STALE=0 to fail instead of reclaiming a busy port.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

API_PORT="${API_PORT:-8000}"
WEB_PORT="${WEB_PORT:-3000}"
RELOAD="${RELOAD:-1}"
# Node keeps proxied sockets alive ~60s; uvicorn drops idle ones after 5s by
# default, so the Next dev proxy reuses a socket the server just closed and
# logs ECONNRESET. Outlive the client's idle window instead.
KEEPALIVE="${KEEPALIVE:-75}"
VENV="$ROOT/.venv"
LOG_DIR="$ROOT/.logs"

log()  { printf '\033[1;36m[run]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[run]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[run]\033[0m %s\n' "$*" >&2; exit 1; }

ensure_env_file() {
  if [ ! -f .env ]; then
    warn ".env missing — copying .env.example. Fill in your keys before real use."
    cp .env.example .env
  fi
}

ensure_python() {
  if [ ! -d "$VENV" ]; then
    log "creating virtualenv at .venv"
    (command -v python3 >/dev/null) || die "python3 not found"
    python3 -m venv "$VENV"
  fi
  # shellcheck disable=SC1091
  source "$VENV/bin/activate"
  local stamp="$VENV/.requirements.sha"
  local current
  current="$(shasum requirements.txt | awk '{print $1}')"
  if [ "$(cat "$stamp" 2>/dev/null || true)" != "$current" ]; then
    log "installing python dependencies"
    pip install --quiet --upgrade pip
    pip install --quiet -r requirements.txt
    printf '%s' "$current" > "$stamp"
  fi
}

ensure_node() {
  (command -v npm >/dev/null) || die "npm not found — install Node.js 20+"
  if [ ! -d frontend/node_modules ] || [ frontend/package-lock.json -nt frontend/node_modules ]; then
    log "installing frontend dependencies"
    (cd frontend && npm install)
  fi
}

port_busy() { lsof -iTCP:"$1" -sTCP:LISTEN -t >/dev/null 2>&1; }

# The API reads DATABASE_URL from .env. If it points at a Postgres that is not
# up, uvicorn dies on startup — fall back to the SQLite default instead.
ensure_database() {
  local url
  url="$(grep -E '^DATABASE_URL=' .env 2>/dev/null | tail -1 | cut -d= -f2-)"
  case "$url" in
    *postgres*) ;;
    *) return 0 ;;
  esac
  local host port
  host="$(printf '%s' "$url" | sed -n 's#.*@\([^:/]*\).*#\1#p')"
  port="$(printf '%s' "$url" | sed -n 's#.*@[^:]*:\([0-9]*\).*#\1#p')"
  host="${host:-localhost}"
  port="${port:-5432}"
  if nc -z "$host" "$port" >/dev/null 2>&1; then
    log "database → postgres at $host:$port"
    return 0
  fi
  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    log "postgres at $host:$port is down — starting the compose db service"
    docker compose up -d db
    for _ in $(seq 1 30); do
      nc -z "$host" "$port" >/dev/null 2>&1 && { log "database → postgres at $host:$port"; return 0; }
      sleep 1
    done
    warn "postgres did not come up in time"
  fi
  warn "postgres at $host:$port unreachable — falling back to SQLite (./spark.db)"
  export DATABASE_URL="sqlite:///./spark.db"
}

# Next 16 allows one dev server per project directory, regardless of port.
ensure_no_stray_next() {
  local lock=frontend/.next/dev/lock pid
  [ -f "$lock" ] || return 0
  pid="$(sed -n 's/.*"pid":\([0-9]*\).*/\1/p' "$lock")"
  [ -n "$pid" ] || return 0
  ps -p "$pid" >/dev/null 2>&1 || return 0
  if [ "${KILL_STALE:-1}" != "0" ]; then
    warn "stopping the Next dev server already running for frontend/ (pid $pid)"
    kill "$pid" 2>/dev/null || true
    for _ in $(seq 1 20); do
      ps -p "$pid" >/dev/null 2>&1 || return 0
      sleep 0.25
    done
  fi
  die "a Next dev server is already running for frontend/ (pid $pid). Run 'kill $pid' first, or use its existing URL."
}

# A previous run that was killed with SIGKILL (or started outside this script)
# leaves its dev server holding the port. Reclaim it when it is plainly one of
# ours — our user, and a node/next/uvicorn process — otherwise refuse to touch
# whatever it is. KILL_STALE=0 disables the reclaim entirely.
reclaim_port() {
  local port="$1" pid cmd
  for pid in $(lsof -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null); do
    # `ps -o comm=` returns the full executable path, and macOS framework
    # Python reports it capitalised (.../MacOS/Python) — match case-insensitively.
    cmd="$(ps -o comm= -p "$pid" 2>/dev/null | tr 'A-Z' 'a-z' || true)"
    case "$cmd" in
      *node|*next*|*uvicorn|*python|*python3) ;;
      *) return 1 ;;
    esac
    [ "$(ps -o user= -p "$pid" 2>/dev/null | tr -d ' ')" = "$(id -un)" ] || return 1
    warn "reclaiming port $port from a stale ${cmd##*/} (pid $pid)"
    kill "$pid" 2>/dev/null || true
  done
  for _ in $(seq 1 20); do
    port_busy "$port" || return 0
    sleep 0.25
  done
  return 1
}

# Kill whatever is serving our two ports. Used by `run.sh down` and as the
# teardown backstop.
stop_ports() {
  local port pid
  for port in "$API_PORT" "$WEB_PORT"; do
    for pid in $(lsof -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null); do
      kill "$pid" 2>/dev/null || true
    done
  done
  for _ in $(seq 1 20); do
    port_busy "$API_PORT" || port_busy "$WEB_PORT" || return 0
    sleep 0.25
  done
  for port in "$API_PORT" "$WEB_PORT"; do
    for pid in $(lsof -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null); do
      kill -9 "$pid" 2>/dev/null || true
    done
  done
}

check_port() {
  port_busy "$1" || return 0
  if [ "${KILL_STALE:-1}" != "0" ] && reclaim_port "$1"; then
    return 0
  fi
  die "port $1 is already in use ($2). Stop it or set ${3}=<other port>."
}

start_backend() {
  ensure_env_file
  ensure_python
  ensure_database
  check_port "$API_PORT" backend API_PORT
  local args=(uvicorn app.main:app --host 0.0.0.0 --port "$API_PORT" --timeout-keep-alive "$KEEPALIVE")
  [ "$RELOAD" = "1" ] && args+=(--reload)
  log "backend  → http://localhost:$API_PORT  (docs at /docs)"
  "${args[@]}"
}

start_frontend() {
  ensure_node
  ensure_no_stray_next
  check_port "$WEB_PORT" frontend WEB_PORT
  log "frontend → http://localhost:$WEB_PORT"
  cd frontend
  BACKEND_URL="http://127.0.0.1:$API_PORT" npm run dev -- --port "$WEB_PORT"
}

start_all() {
  ensure_env_file
  ensure_python
  ensure_node
  ensure_database
  ensure_no_stray_next
  check_port "$API_PORT" backend API_PORT
  check_port "$WEB_PORT" frontend WEB_PORT
  mkdir -p "$LOG_DIR"

  local pids=()
  cleanup() {
    trap - INT TERM EXIT
    log "shutting down"
    for pid in "${pids[@]:-}"; do
      [ -n "$pid" ] || continue
      kill -- "-$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
    done
    # Without a controlling terminal bash cannot enable job control, so the
    # subshells never become group leaders and the group kill above misses.
    # Sweep the ports directly rather than leaving half the stack orphaned.
    stop_ports
    wait 2>/dev/null || true
  }
  trap cleanup INT TERM EXIT

  local uargs=(uvicorn app.main:app --host 0.0.0.0 --port "$API_PORT" --timeout-keep-alive "$KEEPALIVE")
  [ "$RELOAD" = "1" ] && uargs+=(--reload)
  # Each half runs inside its own subshell so that, under `set -m`, the
  # subshell's PID is also its process-group id — that is what cleanup() kills
  # and what the supervisor polls. Backgrounding a bare pipeline instead gives
  # $! of the LAST element (sed) while the group is led by the FIRST, so the
  # group kill silently misses and leaves orphans behind.
  #
  # stdin is detached: a background process group that reads the terminal gets
  # SIGTTIN, and next dev's interactive keypress handler does exactly that.
  set -m
  # ${PIPESTATUS[0]} is the real command's status; the pipeline's own $? is
  # sed's and says nothing. rc=0 means the server exited on its own, 143 that
  # something SIGTERMed it, 141 a SIGPIPE from the tee/sed chain dying.
  (
    "${uargs[@]}" 2>&1 | tee "$LOG_DIR/backend.log" | sed -u 's/^/[api] /'
    warn "backend exited (rc=${PIPESTATUS[0]})"
  ) </dev/null &
  pids+=("$!")

  (
    cd frontend
    BACKEND_URL="http://127.0.0.1:$API_PORT" npm run dev -- --port "$WEB_PORT" 2>&1 \
      | tee "$LOG_DIR/frontend.log" | sed -u 's/^/[web] /'
    warn "frontend exited (rc=${PIPESTATUS[0]})"
  ) </dev/null &
  pids+=("$!")
  set +m

  log "backend  → http://localhost:$API_PORT/docs"
  log "frontend → http://localhost:$WEB_PORT   (logs in .logs/)"
  log "Ctrl-C to stop both."

  # bash 3.2 (macOS) has no `wait -n`, so poll. If either half dies the other is
  # useless — a live backend with a dead dev server just leaves open browser
  # tabs failing to fetch — so tear the whole stack down instead.
  while :; do
    for pid in "${pids[@]}"; do
      if ! kill -0 "$pid" 2>/dev/null; then
        warn "a process exited — shutting the stack down"
        return 0
      fi
    done
    sleep 1
  done
}

run_tests() {
  ensure_python
  ensure_node
  log "pytest"
  pytest
  log "frontend typecheck + lint"
  (cd frontend && npm run typecheck && npm run lint)
}

case "${1:-all}" in
  all|"")   start_all ;;
  backend|api) start_backend ;;
  frontend|web) start_frontend ;;
  docker)   ensure_env_file; exec docker compose up --build ;;
  test)     run_tests ;;
  down|stop) log "stopping anything on ports $API_PORT and $WEB_PORT"; stop_ports ;;
  *)        die "unknown command '$1' (use: all | backend | frontend | docker | test | down)" ;;
esac
