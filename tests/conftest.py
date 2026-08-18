"""Test fixtures: an isolated SQLite database and an authenticated client.

DATABASE_URL must be set before any app module is imported — app.config reads
the environment at import time (load_dotenv uses override=False, so this
pre-set value wins over the project's .env).
"""
from __future__ import annotations

import os
import tempfile

_tmpdir = tempfile.mkdtemp(prefix="spark-test-")
os.environ["DATABASE_URL"] = f"sqlite:///{_tmpdir}/test.db"

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.db import init_db
from app.main import app

init_db()

AUTH = {"Authorization": f"Bearer {settings.api_token}"}


@pytest.fixture()
def client() -> TestClient:
    # Plain constructor (no context manager) so startup events — scheduler
    # start, orphan reaping — never run in tests.
    return TestClient(app)
