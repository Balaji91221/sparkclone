"""Copy every SQLite row that Postgres does not already have, by primary key.

Additive only: existing Postgres rows are never updated or deleted, so both
datasets survive the merge. Parents are inserted before children so the FKs
(runs.task_id, chat_messages.chat_id, approvals.run_id) always resolve.
"""
import sys
from datetime import timezone
from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import sessionmaker

from app.db import (Base, Skill, Task, Run, Chat, ChatMessage, Approval,
                    MCPServer, Setting, GoogleCredential)

DRY = "--apply" not in sys.argv
ORDER = [Skill, Task, Chat, Run, ChatMessage, Approval, MCPServer, Setting,
         GoogleCredential]

# SQLite was not enforcing these, so it holds rows whose parent is gone (2
# orphaned chat_messages). Postgres does enforce them, so such a row cannot be
# copied — skip it rather than fail the whole merge.
PARENTS = {Run: ("task_id", Task), ChatMessage: ("chat_id", Chat),
           Approval: ("run_id", Run)}
ids = {}

src = create_engine("sqlite:///./spark.db")
dst = create_engine("postgresql+psycopg://spark:sparkpass@localhost:5433/sparkclone")
Base.metadata.create_all(dst)
S, D = sessionmaker(bind=src)(), sessionmaker(bind=dst, autoflush=False)()

sqlite_cols = {t: {c["name"] for c in inspect(src).get_columns(t)}
               for t in inspect(src).get_table_names()}

total = 0
for model in ORDER:
    table = model.__tablename__
    pk = inspect(model).primary_key[0].name
    cols = [c.name for c in model.__table__.columns
            if c.name in sqlite_cols.get(table, set())]
    existing = {r[0] for r in D.query(getattr(model, pk)).all()}
    added = 0
    orphans = 0
    dupes = 0
    # mcp_servers.name and skills.name are UNIQUE, and the two databases hold
    # same-named rows under different ids — keep the one Postgres already has.
    uniq_cols = [c.name for c in model.__table__.columns if c.unique]
    taken = {n: {r[0] for r in D.query(getattr(model, n)).all()} for n in uniq_cols}
    parent_col, parent_model = PARENTS.get(model, (None, None))
    valid_parents = ids.get(parent_model) if parent_model else None
    for row in S.query(model).all():
        if getattr(row, pk) in existing:
            continue
        if valid_parents is not None and getattr(row, parent_col) not in valid_parents:
            orphans += 1
            continue
        if any(getattr(row, n) in taken[n] for n in uniq_cols):
            dupes += 1
            continue
        values = {}
        for name in cols:
            v = getattr(row, name)
            # SQLite stores naive datetimes; the Postgres columns are
            # timestamptz and the app writes UTC, so label them as such.
            if hasattr(v, "tzinfo") and v is not None and v.tzinfo is None:
                v = v.replace(tzinfo=timezone.utc)
            values[name] = v
        if not DRY:
            D.add(model(**values))
        existing.add(getattr(row, pk))
        for n in uniq_cols:
            taken[n].add(getattr(row, n))
        added += 1
    ids[model] = existing
    total += added
    skipped = ([f"{orphans} orphaned"] if orphans else []) + \
              ([f"{dupes} name-clash"] if dupes else [])
    note = f"  (skipped {', '.join(skipped)})" if skipped else ""
    print(f"{table:<20} sqlite={S.query(model).count():<4} "
          f"pg={len(existing) - added:<4} to_insert={added}{note}")
    if not DRY:
        D.flush()

if DRY:
    print(f"\nDRY RUN — would insert {total} rows. Re-run with --apply.")
else:
    D.commit()
    print(f"\ninserted {total} rows")
