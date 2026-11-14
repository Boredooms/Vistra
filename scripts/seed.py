"""Idempotent seed: org_demo / app_demo, domains, API keys, knowledge base with the 3 Acme docs, demo app data.

Usage (from apps/api):  uv run python ../../scripts/seed.py [--origin https://demo.vercel.app] [--tool-url https://demo.vercel.app]
New API keys are written to the repo-root .env (VISTRA_API_KEY, VISTRA_ADMIN_KEY) and are NOT printed in full.
"""
from __future__ import annotations

import argparse
import asyncio
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))

from sqlalchemy import text  # noqa: E402

from app.core.db import dispose_engine, privileged_conn, tenant_conn  # noqa: E402
from app.core.security import new_api_key  # noqa: E402
from app.knowledge import ingestion  # noqa: E402

ORG, APP = "org_demo", "app_demo"
CONTENT = ROOT / "apps" / "demo" / "content"
DOCS = [("Acme Workspace Pricing", "markdown", "pricing.md"), ("Acme API Reference", "markdown", "api-reference.md"),
        ("Onboarding Guide", "html", "onboarding.html")]


def set_env(name: str, value: str) -> None:
    p = ROOT / (".env.local" if (ROOT / ".env.local").exists() else ".env")
    lines = p.read_text(encoding="utf-8").splitlines()
    for i, ln in enumerate(lines):
        if ln.startswith(name + "="):
            lines[i] = f"{name}={value}"
            break
    else:
        lines.append(f"{name}={value}")
    p.write_text("\n".join(lines) + "\n", encoding="utf-8")


async def main(origins: list[str], tool_url: str, skip_docs: bool) -> None:
    async with privileged_conn() as conn:
        await conn.execute(text("insert into organizations (id, name) values (:o, 'Acme Inc. (demo)') on conflict do nothing"), {"o": ORG})
        await conn.execute(text(
            "insert into applications (id, organization_id, name, tool_base_url) values (:a, :o, 'Acme Workspace', :u) "
            "on conflict (id) do update set tool_base_url = excluded.tool_base_url"), {"a": APP, "o": ORG, "u": tool_url})
        for o in origins:
            await conn.execute(text(
                "insert into application_domains (organization_id, application_id, origin) values (:o, :a, :g) on conflict do nothing"),
                {"o": ORG, "a": APP, "g": o.rstrip("/").lower()})
        for name, scopes, env in [("demo-server", ["sdk:session"], "VISTRA_API_KEY"),
                                  ("admin", ["*"], "VISTRA_ADMIN_KEY")]:
            exists = (await conn.execute(text("select 1 from api_keys where application_id = :a and name = :n and revoked_at is null"),
                                         {"a": APP, "n": name})).first()
            if exists:
                print(f"key '{name}' exists (not re-issued)")
                continue
            raw, prefix, digest = new_api_key()
            await conn.execute(text(
                "insert into api_keys (organization_id, application_id, name, key_prefix, key_hash, scopes) values (:o, :a, :n, :p, :h, :s)"),
                {"o": ORG, "a": APP, "n": name, "p": prefix, "h": digest, "s": scopes})
            set_env(env, raw)
            print(f"key '{name}' created -> {env} written to .env (prefix {prefix})")

    # --- customer demo-app data (schema demo) -----------------------------------------------------
    async with privileged_conn() as conn:
        n = (await conn.execute(text("select count(*) from demo.projects"))).scalar_one()
        if n == 0:
            await conn.execute(text(
                "insert into demo.projects (name, status, owner) values "
                "('Mobile App Launch','active','Priya Nair'),('Q4 Marketing Campaign','overdue','Marcus Lee'),"
                "('Customer Portal','active','Elena Rossi'),('Legacy Migration','archived','Sam Okafor')"))
        m = (await conn.execute(text("select count(*) from demo.team_members"))).scalar_one()
        if m == 0:
            await conn.execute(text(
                "insert into demo.team_members (name, email, role, status) values "
                "('Dev Owner','owner@acme.test','owner','active'),('Priya Nair','priya@acme.test','admin','active'),"
                "('Marcus Lee','marcus@acme.test','member','active')"))

    # --- knowledge ----------------------------------------------------------------------------------
    async with tenant_conn(ORG) as conn:
        kb = (await conn.execute(text("select id from knowledge_bases where application_id = :a and name = 'Acme Docs'"), {"a": APP})).scalar()
        if kb is None:
            kb = (await conn.execute(text(
                "insert into knowledge_bases (organization_id, application_id, name) values (:o, :a, 'Acme Docs') returning id"),
                {"o": ORG, "a": APP})).scalar_one()
        col = (await conn.execute(text("select id from knowledge_collections where knowledge_base_id = :k and name = 'Product docs'"), {"k": kb})).scalar()
        if col is None:
            col = (await conn.execute(text(
                "insert into knowledge_collections (organization_id, knowledge_base_id, name) values (:o, :k, 'Product docs') returning id"),
                {"o": ORG, "k": kb})).scalar_one()
    if not skip_docs:
        for title, stype, fname in DOCS:
            body = (CONTENT / fname).read_text(encoding="utf-8")
            sid, jid = await ingestion.create_source_and_job(ORG, str(col), stype, title, None, body)
            await ingestion.run_job(ORG, jid)
            async with tenant_conn(ORG) as conn:
                row = (await conn.execute(text("select status, stage, error, stats from ingestion_jobs where id = cast(:j as uuid)"),
                                          {"j": jid})).mappings().first()
            print(f"ingest {fname}: {row['status']} {dict(row['stats'])} {row['error'] or ''}")
    await dispose_engine()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--origin", action="append", default=[])
    ap.add_argument("--tool-url", default="http://localhost:3001")
    ap.add_argument("--skip-docs", action="store_true")
    a = ap.parse_args()
    origins = list(dict.fromkeys(["http://localhost:3001", *a.origin]))
    asyncio.run(main([re.sub(r"/+$", "", o) for o in origins], a.tool_url, a.skip_docs))
