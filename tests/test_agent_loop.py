"""Agent run loop: completion, tool dispatch, iteration cap, and failure."""
from __future__ import annotations

from unittest.mock import patch

import pytest

from app.agent.agent import execute_run
from app.db import Run, RunStatus, Task, db_session
from app.tools.registry import TOOLS, Tool


def make_run() -> str:
    with db_session() as db:
        task = Task(name="t", prompt="do the thing")
        db.add(task)
        db.commit()
        run = Run(task_id=task.id)
        db.add(run)
        db.commit()
        return run.id


def text_reply(text: str) -> dict:
    return {"text": text, "tool_calls": [],
            "raw_assistant_msg": {"role": "assistant", "content": text}}


def tool_reply(name: str, args: dict) -> dict:
    return {"text": "", "tool_calls": [{"id": "tc1", "name": name, "input": args}],
            "raw_assistant_msg": {"role": "assistant", "content": ""}}


def get_run(run_id: str) -> Run:
    with db_session() as db:
        return db.get(Run, run_id)


@pytest.fixture()
def fake_tool():
    calls: list[dict] = []

    def fn(**kwargs) -> str:
        calls.append(kwargs)
        return "tool says hi"

    TOOLS["fake_probe"] = Tool(name="fake_probe", description="test probe",
                               input_schema={"type": "object", "properties": {}},
                               fn=fn)
    yield calls
    del TOOLS["fake_probe"]


def test_text_only_run_succeeds():
    run_id = make_run()
    # The loop nudges twice before accepting a toolless reply as final.
    with patch("app.agent.agent.providers.complete",
               return_value=text_reply("all done")):
        execute_run(run_id)
    run = get_run(run_id)
    assert run.status == RunStatus.succeeded
    assert run.output == "all done"
    assert run.finished_at is not None


def test_tool_call_round_trip(fake_tool):
    run_id = make_run()
    replies = iter([tool_reply("fake_probe", {"x": 1})]
                   + [text_reply("done")] * 3)
    with patch("app.agent.agent.providers.complete",
               side_effect=lambda *a, **k: next(replies)):
        execute_run(run_id)
    assert fake_tool == [{"x": 1}]
    run = get_run(run_id)
    assert run.status == RunStatus.succeeded
    # The tool result must appear in the persisted transcript.
    assert any("tool says hi" in str(m) for m in run.transcript)


def test_unknown_tool_reports_error_and_continues():
    run_id = make_run()
    replies = iter([tool_reply("no_such_tool", {})] + [text_reply("ok")] * 3)
    with patch("app.agent.agent.providers.complete",
               side_effect=lambda *a, **k: next(replies)):
        execute_run(run_id)
    run = get_run(run_id)
    assert run.status == RunStatus.succeeded
    assert any("Unknown tool no_such_tool" in str(m) for m in run.transcript)


def test_iteration_cap_fails_run(fake_tool):
    run_id = make_run()
    with patch("app.agent.agent.settings.max_agent_iterations", 3), \
         patch("app.agent.agent.providers.complete",
               return_value=tool_reply("fake_probe", {})):
        execute_run(run_id)
    run = get_run(run_id)
    assert run.status == RunStatus.failed
    assert "Stopped after the maximum" in run.error
    assert len(fake_tool) == 3


def test_provider_exception_fails_run():
    run_id = make_run()
    with patch("app.agent.agent.providers.complete",
               side_effect=RuntimeError("provider exploded")):
        execute_run(run_id)
    run = get_run(run_id)
    assert run.status == RunStatus.failed
    assert "provider exploded" in run.error
    assert run.finished_at is not None
