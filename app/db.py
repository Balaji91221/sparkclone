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


class Approval(Base):
    __tablename__ = "approvals"
    id = Column(String, primary_key=True, default=new_id)
    run_id = Column(String, ForeignKey("runs.id"), nullable=False)
    tool_name = Column(String, nullable=False)
    tool_input = Column(JSON, default=dict)
    status = Column(String, default="pending")  # pending | approved | denied
    created_at = Column(DateTime(timezone=True), default=utcnow)
    resolved_at = Column(DateTime(timezone=True))
    run = relationship("Run", back_populates="approvals")


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


def db_session() -> Session:
    return SessionLocal()
