"""Release check: every public tenant table has RLS enabled AND forced; private schemas are closed to the tenant role.
Exits non-zero on any violation."""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "apps" / "api"))
from sqlalchemy import text  # noqa: E402

from app.core.db import dispose_engine, privileged_conn  # noqa: E402

ALLOW = {"schema_migrations", "users"}  # global tables allowlisted in doc 16


async def main() -> int:
    async with privileged_conn() as c:
        rows = (await c.execute(text(
            "select c.relname, c.relrowsecurity, c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace "
            "where n.nspname = 'public' and c.relkind = 'r'"))).all()
        bad = [r[0] for r in rows if r[0] not in ALLOW and not (r[1] and r[2])]
        cp = (await c.execute(text("select count(*) from information_schema.tables where table_schema = 'agent_state'"))).scalar()
        g = (await c.execute(text("select has_schema_privilege('vistra_app','agent_state','USAGE'), "
                                  "has_schema_privilege('vistra_app','demo','USAGE')"))).one()
    await dispose_engine()
    print("public tables", len(rows), "| missing/unforced RLS:", bad or "none")
    print("langgraph checkpoint tables in agent_state:", cp)
    print("tenant role usage on agent_state / demo:", tuple(g))
    return 1 if bad or any(g) else 0


if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
sys.exit(asyncio.run(main()))
