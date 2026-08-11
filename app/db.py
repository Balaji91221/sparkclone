from __future__ import annotations

import datetime as dt
import enum
import uuid

from sqlalchemy import (JSON, Column, DateTime, Enum, ForeignKey, String, Text,
                        create_engine)
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
    cron = Column(String, default="")           # e.g. "0 9 * * MON"; empty = manual
    enabled = Column(String, default="true")
    created_at = Column(DateTime(timezone=True), default=utcnow)
    runs = relationship("Run", back_populates="task", cascade="all, delete-orphan")


class Run(Base):
    __tablename__ = "runs"
    id = Column(String, primary_key=True, default=new_id)
    task_id = Column(String, ForeignKey("tasks.id"), nullable=False)
    status = Column(Enum(RunStatus), default=RunStatus.queued)
    trigger = Column(String, default="manual")  # manual | schedule
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


def _migrate() -> None:
    """Tiny additive migrations create_all can't do on existing tables."""
    if not settings.database_url.startswith("sqlite"):
        return
    from sqlalchemy import text
    with engine.connect() as conn:
        cols = [row[1] for row in conn.execute(text("PRAGMA table_info(approvals)"))]
        if "chat_id" not in cols:
            conn.execute(text(
                "ALTER TABLE approvals ADD COLUMN chat_id VARCHAR DEFAULT ''"))
            conn.commit()


def db_session() -> Session:
    return SessionLocal()
