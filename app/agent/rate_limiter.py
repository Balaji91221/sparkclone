"""Sliding-window rate limiter (sync + async).

Contract:
- Every outbound call to a rate-limited service goes through acquire().
- Throttles by waiting, never by dropping.
- One shared instance per rate-limited resource.
- Concurrency-safe; monotonic clock; lock released while sleeping.
"""
from __future__ import annotations

import asyncio
import threading
import time
from collections import deque


class RateLimiter:
    """Thread-safe sliding-window limiter: at most max_requests start in any
    rolling per_seconds window."""

    def __init__(self, max_requests: int = 20, per_seconds: float = 1.0):
        self.max_requests = max_requests
        self.per_seconds = per_seconds
        self._stamps: deque[float] = deque()
        self._lock = threading.Lock()

    def acquire(self) -> None:
        while True:
            with self._lock:
                now = time.monotonic()
                while self._stamps and now - self._stamps[0] >= self.per_seconds:
                    self._stamps.popleft()
                if len(self._stamps) < self.max_requests:
                    self._stamps.append(now)
                    return
                wait_for = self.per_seconds - (now - self._stamps[0])
            time.sleep(max(wait_for, 0.0))

    def __enter__(self):
        self.acquire()
        return self

    def __exit__(self, *exc):
        return False


class AsyncRateLimiter:
    """Asyncio sliding-window limiter with the same semantics."""

    def __init__(self, max_requests: int = 20, per_seconds: float = 1.0):
        self.max_requests = max_requests
        self.per_seconds = per_seconds
        self._stamps: deque[float] = deque()
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        while True:
            async with self._lock:
                now = time.monotonic()
                while self._stamps and now - self._stamps[0] >= self.per_seconds:
                    self._stamps.popleft()
                if len(self._stamps) < self.max_requests:
                    self._stamps.append(now)
                    return
                wait_for = self.per_seconds - (now - self._stamps[0])
            await asyncio.sleep(max(wait_for, 0.0))

    async def __aenter__(self):
        await self.acquire()
        return self

    async def __aexit__(self, *exc):
        return False
