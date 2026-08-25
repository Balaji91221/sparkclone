#!/usr/bin/env python3
"""One-shot data migration: spark.db (SQLite) -> Postgres.

Usage: python3 scripts/migrate_sqlite_to_postgres.py <postgres_url>
Creates the schema on Postgres and copies every row, preserving ids.
Idempotent-ish: refuses to run if the target already has tasks.
"""
from __future__ import annotations

import sys

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

sys.path.insert(0, ".")
from app.db import (  # noqa: E402
    Approval,
    Base,
    Chat,
    ChatMessage,
    GoogleCredential,
    MCPServer,
    Run,
    Skill,
    Task,
)

TABLES = [Skill, Task, Run, Approval, Chat, ChatMessage, GoogleCredential, MCPServer]


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: migrate_sqlite_to_postgres.py <postgres_url>")
    src = create_engine("sqlite:///./spark.db")
    dst = create_engine(sys.argv[1])
    Base.metadata.create_all(dst)

    with Session(src) as s_in, Session(dst) as s_out:
        if s_out.execute(select(Task).limit(1)).first():
            raise SystemExit("Target already has data — refusing to migrate twice.")
        for model in TABLES:
            rows = s_in.execute(select(model)).scalars().all()
            for row in rows:
                data = {c.name: getattr(row, c.name)
                        for c in model.__table__.columns}
                s_out.add(model(**data))
            print(f"{model.__tablename__}: {len(rows)} rows")
        s_out.commit()
    print("Migration complete.")


if __name__ == "__main__":
    main()
