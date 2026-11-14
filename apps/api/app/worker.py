"""Ingestion worker: consumes the Redis queue (reliable BLMOVE pattern) and runs jobs from ingestion_jobs.

Run standalone:  python -m app.worker        (separate Render background worker)
Or embedded in the API (WORKER_EMBEDDED=true, the default) for single-service deploys.

Recovery: on start and every 60 s, jobs that are queued/running but untouched for 5 minutes are re-enqueued
(the job row, not Redis, is the record). run_job is idempotent by content hash.
"""
from __future__ import annotations

import asyncio
import json
import logging
import sys

from redis.exceptions import RedisError
from sqlalchemy import text

from app.core.db import privileged_conn
from app.core.redis import INGEST_PROCESSING, INGEST_QUEUE, enqueue, get_redis
from app.knowledge import ingestion

log = logging.getLogger("vistra.worker")
STALE_MIN = 5


async def reclaim_stale() -> int:
    """Privileged path (doc 19): job claiming spans tenants; each job then runs under its own org scope."""
    async with privileged_conn() as conn:
        rows = (await conn.execute(text(
            "update ingestion_jobs set updated_at = now() where status in ('queued','running') and attempt < 3 "
            "and updated_at < now() - make_interval(mins => :m) returning id, organization_id"), {"m": STALE_MIN})).all()
    for jid, org in rows:
        await enqueue(INGEST_QUEUE, {"org": org, "job_id": str(jid)})
    if rows:
        log.info("reclaimed stale jobs", extra={"ctx": {"count": len(rows)}})
    return len(rows)


async def run_forever() -> None:
    if get_redis() is None:
        log.warning("REDIS_URL not set: worker idle, jobs run inline in the API")
        return
    # dedicated connection: blocking BLMOVE must never hold a connection request handlers need
    import redis.asyncio as aioredis

    from app.core.config import get_settings

    r = aioredis.from_url(get_settings().redis_url, decode_responses=True, socket_timeout=30, socket_connect_timeout=10,
                          health_check_interval=30)
    # anything left in processing by a crashed worker goes back to the queue
    try:
        while await r.lmove(INGEST_PROCESSING, INGEST_QUEUE, "RIGHT", "LEFT"):
            pass
    except RedisError:
        log.exception("could not restore processing list")
    await reclaim_stale()
    last_reclaim = asyncio.get_running_loop().time()
    log.info("ingestion worker started")
    while True:
        try:
            raw = await r.blmove(INGEST_QUEUE, INGEST_PROCESSING, 5, "RIGHT", "LEFT")
        except asyncio.CancelledError:
            raise
        except RedisError:
            log.warning("redis unavailable; retrying in 5s")
            await asyncio.sleep(5)
            continue
        if raw:
            try:
                msg = json.loads(raw)
                await ingestion.run_job(msg["org"], msg["job_id"])
            except Exception:  # noqa: BLE001 - run_job records failures on the job row
                log.exception("job crashed")
            finally:
                try:
                    await r.lrem(INGEST_PROCESSING, 1, raw)
                except RedisError:
                    pass
        now = asyncio.get_running_loop().time()
        if now - last_reclaim > 60:
            last_reclaim = now
            try:
                await reclaim_stale()
            except Exception:  # noqa: BLE001
                log.exception("reclaim failed")


async def supervise() -> None:
    """Keeps the worker alive: any crash is logged and the loop restarts after a short backoff."""
    while True:
        try:
            await run_forever()
            return  # no Redis configured
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            log.exception("ingestion worker crashed; restarting in 5s")
            await asyncio.sleep(5)


def start_embedded_worker() -> asyncio.Task | None:
    if get_redis() is None:
        return None
    return asyncio.create_task(supervise())


if __name__ == "__main__":
    from app.core.config import get_settings
    from app.core.logging import configure_logging

    configure_logging(get_settings().log_level)
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(supervise())
