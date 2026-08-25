"""Sliding-window rate limiter: waits instead of dropping, sync and async."""
from __future__ import annotations

import asyncio
import time

from app.agent.rate_limiter import AsyncRateLimiter, RateLimiter


def test_under_limit_is_instant():
    rl = RateLimiter(max_requests=3, per_seconds=5.0)
    started = time.monotonic()
    for _ in range(3):
        rl.acquire()
    assert time.monotonic() - started < 0.1


def test_over_limit_waits_for_window():
    rl = RateLimiter(max_requests=2, per_seconds=0.3)
    rl.acquire()
    rl.acquire()
    started = time.monotonic()
    rl.acquire()  # third call must wait until the first stamp expires
    waited = time.monotonic() - started
    assert 0.15 <= waited <= 1.0


def test_context_manager_acquires():
    rl = RateLimiter(max_requests=1, per_seconds=0.2)
    with rl:
        pass
    started = time.monotonic()
    with rl:  # second entry waits out the window
        pass
    assert time.monotonic() - started >= 0.1


def test_async_over_limit_waits():
    async def scenario() -> float:
        rl = AsyncRateLimiter(max_requests=2, per_seconds=0.3)
        await rl.acquire()
        await rl.acquire()
        started = time.monotonic()
        async with rl:
            pass
        return time.monotonic() - started

    waited = asyncio.run(scenario())
    assert 0.15 <= waited <= 1.0
