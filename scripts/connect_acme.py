"""Connect the Acme demo to a dashboard application (end to end): origins, tool URL + fresh tool secret, Acme docs.

Usage (from apps/api): uv run python ../../scripts/connect_acme.py <app_id> --tool-url https://vistra-acme-demo.vercel.app
  [--origin http://localhost:3001] [--secret-out <file>]
The new tool secret is written to --secret-out (never printed). It replaces the app's previous tool secret.
"""
import argparse
import asyncio
import secrets
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "apps" / "api"))
from sqlalchemy import text  # noqa: E402

from app.core.crypto import encrypt  # noqa: E402
from app.core.db import privileged_conn, tenant_conn  # noqa: E402
from app.knowledge import ingestion  # noqa: E402

CONTENT = Path(__file__).resolve().parents[1] / "apps" / "demo" / "content"
DOCS = [("Acme Workspace Pricing", "markdown", "pricing.md"), ("Acme API Reference", "markdown", "api-reference.md"),
        ("Onboarding Guide", "html", "onboarding.html")]


async def main(a: argparse.Namespace) -> None:
    async with privileged_conn() as c:
        org = (await c.execute(text("select organization_id from applications where id = :a"), {"a": a.app})).scalar_one()
    print("org", org)
    secret = "vts_" + secrets.token_urlsafe(32)
    async with tenant_conn(org) as c:
        for o in a.origin:
            await c.execute(text("insert into application_domains (organization_id, application_id, origin) values (:o, :a, :g) "
                                 "on conflict do nothing"), {"o": org, "a": a.app, "g": o.rstrip("/").lower()})
        await c.execute(text("update applications set tool_base_url = :u, tool_secret_enc = :s where id = :a"),
                        {"u": a.tool_url.rstrip("/"), "s": encrypt(secret), "a": a.app})
        print("origins", [r[0] for r in (await c.execute(text("select origin from application_domains where application_id = :a"), {"a": a.app})).all()])
        kb = (await c.execute(text("select id from knowledge_bases where application_id = :a order by created_at limit 1"), {"a": a.app})).scalar()
        if kb is None:
            kb = (await c.execute(text("insert into knowledge_bases (organization_id, application_id, name) values (:o, :a, 'Acme Docs') returning id"),
                                  {"o": org, "a": a.app})).scalar_one()
        col = (await c.execute(text("select id from knowledge_collections where knowledge_base_id = :k order by created_at limit 1"), {"k": kb})).scalar()
        if col is None:
            col = (await c.execute(text("insert into knowledge_collections (organization_id, knowledge_base_id, name) values (:o, :k, 'Product docs') returning id"),
                                   {"o": org, "k": kb})).scalar_one()
    Path(a.secret_out).write_text(secret, encoding="utf-8")
    for title, stype, fname in DOCS:
        sid, jid = await ingestion.create_source_and_job(org, str(col), stype, title, None, (CONTENT / fname).read_text(encoding="utf-8"))
        await ingestion.run_job(org, jid)
        async with tenant_conn(org) as c:
            st = (await c.execute(text("select status, stats from ingestion_jobs where id = cast(:j as uuid)"), {"j": jid})).first()
        print("ingest", fname, st[0], st[1])


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("app")
    ap.add_argument("--tool-url", required=True)
    ap.add_argument("--origin", action="append", default=[])
    ap.add_argument("--secret-out", required=True)
    asyncio.run(main(ap.parse_args()))
