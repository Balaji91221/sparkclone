from __future__ import annotations

import datetime as dt
import enum
import uuid

from sqlalchemy import (
    JSON,
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    create_engine,
)
from sqlalchemy.orm import DeclarativeBase, Session, relationship, sessionmaker

from .config import settings

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False} if settings.database_url.startswith("sqlite") else {},
)

if settings.database_url.startswith("sqlite"):
    from sqlalchemy import event

    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(dbapi_conn, _record):
        # WAL lets the worker threads write while the API reads; busy_timeout
        # turns "database is locked" crashes into short waits.
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA busy_timeout=5000")
        cur.close()

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def new_id() -> str:
    return uuid.uuid4().hex


def utcnow() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


class Base(DeclarativeBase):
    pass


class RunStatus(str, enum.Enum):
    queued = "queued"
    running = "running"
    waiting_approval = "waiting_approval"
    succeeded = "succeeded"
    failed = "failed"
    cancelled = "cancelled"


class Skill(Base):
    __tablename__ = "skills"
    id = Column(String, primary_key=True, default=new_id)
    name = Column(String, nullable=False, unique=True)
    description = Column(Text, default="")
    instructions = Column(Text, nullable=False)  # markdown injected into prompts
    created_at = Column(DateTime(timezone=True), default=utcnow)


class Task(Base):
    __tablename__ = "tasks"
    id = Column(String, primary_key=True, default=new_id)
    name = Column(String, nullable=False)
    prompt = Column(Text, nullable=False)
    skill_ids = Column(JSON, default=list)      # list[str]
    allowed_tools = Column(JSON, default=list)  # empty = all tools
    # Schedule kind: "cron" | "interval" | "date" | "webhook" | "manual".
    # _migrate() backfills legacy rows from the old cron column, so "" only
    # appears transiently and readers treat it as "manual".
    trigger_type = Column(String, default="")
    trigger_value = Column(String, default="")  # cron string | seconds | ISO datetime
    webhook_secret = Column(String, default="")  # set only for webhook tasks
    max_retries = Column(Integer, default=0)     # 0-3 automatic retries on failure
    enabled = Column(String, default="true")
    created_at = Column(DateTime(timezone=True), default=utcnow)
    runs = relationship("Run", back_populates="task", cascade="all, delete-orphan")


class Run(Base):
    __tablename__ = "runs"
    id = Column(String, primary_key=True, default=new_id)
    task_id = Column(String, ForeignKey("tasks.id"), nullable=False)
    status = Column(Enum(RunStatus), default=RunStatus.queued)
    trigger = Column(String, default="manual")  # manual | schedule | webhook | retry
    attempt = Column(Integer, default=0)        # 0 = first try, 1+ = retry number
    started_at = Column(DateTime(timezone=True))
    finished_at = Column(DateTime(timezone=True))
    output = Column(Text, default="")
    error = Column(Text, default="")
    transcript = Column(JSON, default=list)  # agent message history (redacted)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    task = relationship("Task", back_populates="runs")
    approvals = relationship("Approval", back_populates="run", cascade="all, delete-orphan")


class Chat(Base):
    """An interactive conversation with the agent."""
    __tablename__ = "chats"
    id = Column(String, primary_key=True, default=new_id)
    title = Column(String, default="New chat")
    status = Column(String, default="idle")  # idle | thinking | waiting_approval
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow)


class ChatMessage(Base):
    """One transcript message (user / assistant / tool) in a chat."""
    __tablename__ = "chat_messages"
    id = Column(String, primary_key=True, default=new_id)
    chat_id = Column(String, ForeignKey("chats.id"), nullable=False)
    message = Column(JSON, nullable=False)  # provider-format message dict
    created_at = Column(DateTime(timezone=True), default=utcnow)


class Approval(Base):
    __tablename__ = "approvals"
    id = Column(String, primary_key=True, default=new_id)
    # Exactly one origin: run_id for task runs ("" when from chat), chat_id
    # for chat turns ("" when from a run). run_id keeps NOT NULL for legacy
    # rows; SQLite does not enforce the FK, so "" is safe there.
    run_id = Column(String, ForeignKey("runs.id"), nullable=False)
    chat_id = Column(String, default="")
    tool_name = Column(String, nullable=False)
    tool_input = Column(JSON, default=dict)
    status = Column(String, default="pending")  # pending | approved | denied
    created_at = Column(DateTime(timezone=True), default=utcnow)
    resolved_at = Column(DateTime(timezone=True))
    run = relationship("Run", back_populates="approvals")


class MCPServer(Base):
    """A user-registered MCP server whose tools the agent may call."""
    __tablename__ = "mcp_servers"
    id = Column(String, primary_key=True, default=new_id)
    name = Column(String, nullable=False, unique=True)
    transport = Column(String, nullable=False)  # "stdio" | "http"
    command = Column(String, default="")        # stdio: executable
    args = Column(JSON, default=list)           # stdio: argv list
    env_enc = Column(Text, default="")          # stdio: Fernet-encrypted env JSON
    url = Column(String, default="")            # http: endpoint URL
    enabled = Column(String, default="true")
    requires_approval = Column(String, default="true")  # gate every tool call
    created_at = Column(DateTime(timezone=True), default=utcnow)


class Setting(Base):
    """Small key/value store for user-editable app settings."""
    __tablename__ = "settings"
    key = Column(String, primary_key=True)
    value = Column(JSON, nullable=False, default=dict)


class GoogleCredential(Base):
    __tablename__ = "google_credentials"
    id = Column(String, primary_key=True, default=new_id)
    email = Column(String, default="")
    refresh_token_enc = Column(Text, nullable=False)  # Fernet-encrypted at rest
    access_token = Column(Text, default="")
    token_expiry = Column(DateTime(timezone=True))
    scopes = Column(JSON, default=list)
    created_at = Column(DateTime(timezone=True), default=utcnow)


def init_db() -> None:
    Base.metadata.create_all(engine)
    _migrate()


# Backfill legacy rows before the cron column is dropped: rows written before
# trigger_type existed derive their kind from cron. Portable SQL (SQLite + PG).
_CRON_BACKFILL = (
    "UPDATE tasks SET "
    "trigger_type = CASE WHEN cron != '' THEN 'cron' ELSE 'manual' END, "
    "trigger_value = CASE WHEN cron != '' THEN cron ELSE trigger_value END "
    "WHERE trigger_type = '' OR trigger_type IS NULL")


def _migrate() -> None:
    """Tiny additive migrations create_all can't do on existing tables."""
    if settings.database_url.startswith("sqlite"):
        _migrate_sqlite()
    else:
        _migrate_postgres()


def _migrate_sqlite() -> None:
    from sqlalchemy import text
    with engine.connect() as conn:
        cols = [row[1] for row in conn.execute(text("PRAGMA table_info(approvals)"))]
        if "chat_id" not in cols:
            conn.execute(text(
                "ALTER TABLE approvals ADD COLUMN chat_id VARCHAR DEFAULT ''"))
            conn.commit()
        task_cols = [row[1] for row in conn.execute(text("PRAGMA table_info(tasks)"))]
        for name, ddl in (
            ("trigger_type", "VARCHAR DEFAULT ''"),
            ("trigger_value", "VARCHAR DEFAULT ''"),
            ("webhook_secret", "VARCHAR DEFAULT ''"),
            ("max_retries", "INTEGER DEFAULT 0"),
        ):
            if name not in task_cols:
                conn.execute(text(f"ALTER TABLE tasks ADD COLUMN {name} {ddl}"))
        if "cron" in task_cols:
            conn.execute(text(_CRON_BACKFILL))
            try:
                conn.execute(text("ALTER TABLE tasks DROP COLUMN cron"))
            except Exception:  # noqa: BLE001 — SQLite < 3.35 can't DROP COLUMN
                # The orphaned column is harmless: the model no longer maps it,
                # so it just keeps its per-row default from here on.
                pass
        conn.commit()
        run_cols = [row[1] for row in conn.execute(text("PRAGMA table_info(runs)"))]
        if "attempt" not in run_cols:
            conn.execute(text("ALTER TABLE runs ADD COLUMN attempt INTEGER DEFAULT 0"))
            conn.commit()


def _migrate_postgres() -> None:
    from sqlalchemy import text
    with engine.connect() as conn:
        # create_all() only creates missing tables, never missing columns on an
        # existing one — so add them here before anything reads them. The
        # backfill below selects on trigger_type and fails outright if this is
        # skipped on a table that predates it.
        for table, name, ddl in (
            ("approvals", "chat_id", "VARCHAR DEFAULT ''"),
            ("tasks", "trigger_type", "VARCHAR DEFAULT ''"),
            ("tasks", "trigger_value", "VARCHAR DEFAULT ''"),
            ("tasks", "webhook_secret", "VARCHAR DEFAULT ''"),
            ("tasks", "max_retries", "INTEGER DEFAULT 0"),
            ("runs", "attempt", "INTEGER DEFAULT 0"),
        ):
            conn.execute(text(
                f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {name} {ddl}"))
        conn.commit()

        has_cron = conn.execute(text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name = 'tasks' AND column_name = 'cron'")).first()
        if has_cron:
            conn.execute(text(_CRON_BACKFILL))
            conn.execute(text("ALTER TABLE tasks DROP COLUMN IF EXISTS cron"))
            conn.commit()


def db_session() -> Session:
    return SessionLocal()
