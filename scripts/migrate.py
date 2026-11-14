"""Apply supabase/migrations/*.sql in order, once each (tracked in public.schema_migrations).

Run from apps/api so the virtualenv is used:  uv run python ../../scripts/migrate.py
Migrations are forward-only; a changed checksum of an applied file is an error.
"""
from __future__ import annotations

import asyncio
import hashlib
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api" if (ROOT / "apps" / "api").exists() else ROOT))  # repo vs container layout

from sqlalchemy import text  # noqa: E402

from app.core.db import dispose_engine, get_engine  # noqa: E402


async def main() -> int:
    files = sorted((ROOT / "supabase" / "migrations").glob("*.sql"))
    engine = get_engine()
    async with engine.connect() as conn:
        await conn.execute(text(
            "create table if not exists public.schema_migrations ("
            "name text primary key, checksum text not null, applied_at timestamptz not null default now())"))
        await conn.commit()
        applied = {r[0]: r[1] for r in (await conn.execute(text("select name, checksum from public.schema_migrations")))}
        await conn.commit()
        for f in files:
            sql = f.read_text(encoding="utf-8")
            digest = hashlib.sha256(sql.encode()).hexdigest()
            if f.name in applied:
                if applied[f.name] != digest:
                    print(f"ERROR {f.name}: applied migration was edited", file=sys.stderr)
                    return 1
                print(f"skip  {f.name}")
                continue
            async with conn.begin():
                raw = await conn.get_raw_connection()
                await raw.driver_connection.execute(sql)  # multi-statement script
                await conn.execute(text("insert into public.schema_migrations(name, checksum) values (:n, :c)"),
                                   {"n": f.name, "c": digest})
            print(f"apply {f.name}")
    await dispose_engine()
    from app.agent.graph import setup_checkpointer

    await setup_checkpointer()
    print("langgraph checkpointer tables ready (schema agent_state)")
    return 0


if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    sys.exit(asyncio.run(main()))
