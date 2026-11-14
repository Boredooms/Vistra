"""Redis: ephemeral state only (rate limits, locks, job queue, breaker state). Never the system of record.

If REDIS_URL is unset the API still works: rate limiting is skipped, locks degrade to in-process locks and the
job queue falls back to in-process execution. /readyz reports which mode is active.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import redis.asyncio as aioredis
from redis.exceptions import LockError, RedisError

from app.core.config import get_settings
from app.core.errors import ProblemError

log = logging.getLogger("vistra.redis")
_client: aioredis.Redis | None = None
_local_locks: dict[str, asyncio.Lock] = {}

PREFIX = "vistra:"
INGEST_QUEUE = PREFIX + "queue:ingestion"
INGEST_PROCESSING = PREFIX + "queue:ingestion:processing"


def get_redis() -> aioredis.Redis | None:
    global _client
    url = get_settings().redis_url
    if not url:
        return None
    if _client is None:
        _client = aioredis.from_url(url, decode_responses=True, socket_timeout=10, socket_connect_timeout=10,
                                    health_check_interval=30, retry_on_timeout=True)
    return _client


async def close_redis() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


async def ping() -> str:
    r = get_redis()
    if r is None:
        return "not_configured"
    try:
        return "ok" if await r.ping() else "error"
    except RedisError:
        return "unreachable"


async def rate_limit(bucket: str, limit: int, window_s: int = 60) -> None:
    """Fixed-window limiter. Fails open if Redis is down (availability over strictness for this sprint)."""
    if not get_settings().rate_limit_enabled:
        return
    r = get_redis()
    if r is None:
        return
    key = f"{PREFIX}rl:{bucket}:{int(time.time() // window_s)}"
    try:
        async with r.pipeline(transaction=True) as p:
            p.incr(key)
            p.expire(key, window_s + 5)
            count, _ = await p.execute()
    except RedisError:
        log.warning("rate limiter unavailable; failing open")
        return
    if int(count) > limit:
        raise ProblemError("RATE_LIMITED", 429, "Rate limited", f"More than {limit} requests in {window_s}s; retry shortly")


@asynccontextmanager
async def lock(name: str, ttl_s: int = 120, wait_s: float = 10) -> AsyncIterator[None]:
    """Distributed lock (Redis) with an in-process fallback. Raises VERSION_CONFLICT if it cannot be acquired."""
    r = get_redis()
    if r is None:
        lk = _local_locks.setdefault(name, asyncio.Lock())
        async with lk:
            yield
        return
    lk = r.lock(f"{PREFIX}lock:{name}", timeout=ttl_s, blocking_timeout=wait_s)
    try:
        got = await lk.acquire()
    except RedisError as e:
        raise ProblemError("AUTH_UNAVAILABLE", 503, "Lock service unavailable", "Try again shortly") from e
    if not got:
        raise ProblemError("VERSION_CONFLICT", 409, "Busy", "Another request is already processing this resource")
    try:
        yield
    finally:
        try:
            await lk.release()
        except (LockError, RedisError):
            pass


async def enqueue(queue: str, payload: dict) -> bool:
    r = get_redis()
    if r is None:
        return False
    try:
        await r.lpush(queue, json.dumps(payload))
        return True
    except RedisError:
        log.warning("enqueue failed; caller will run inline")
        return False
