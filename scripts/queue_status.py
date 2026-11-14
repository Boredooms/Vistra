"""Dev helper: show the Redis ingestion queue and recent ingestion_jobs (privileged read, counts only)."""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "apps" / "api"))
from sqlalchemy import text  # noqa: E402

from app.core.db import dispose_engine, privileged_conn  # noqa: E402
from app.core.redis import INGEST_PROCESSING, INGEST_QUEUE, close_redis, get_redis  # noqa: E402


async def main() -> None:
    r = get_redis()
    print("queue", await r.llen(INGEST_QUEUE), "processing", await r.llen(INGEST_PROCESSING))
    async with privileged_conn() as conn:
        rows = (await conn.execute(text(
            "select status, stage, attempt, error, created_at from ingestion_jobs order by created_at desc limit 5"))).all()
    for row in rows:
        print(row.status, row.stage, row.attempt, (row.error or "")[:120], row.created_at)
    await close_redis()
    await dispose_engine()


if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
asyncio.run(main())
