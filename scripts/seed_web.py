"""Idempotent seed for the VISTRA website's own embedded assistant (org_vistra_web / app_vistra_web).

Usage (from apps/api):  uv run python ../../scripts/seed_web.py [--origin https://vistra.example.com]
Writes WEB_VISTRA_API_KEY to the repo-root .env when a key is created (never printed in full).
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))

from sqlalchemy import text  # noqa: E402

from app.core.db import dispose_engine, privileged_conn, tenant_conn  # noqa: E402
from app.core.security import new_api_key  # noqa: E402
from app.knowledge import ingestion  # noqa: E402

ORG, APP = "org_vistra_web", "app_vistra_web"
DOCS = ROOT / "apps" / "web" / "content" / "docs"
TITLES = {"quickstart.md": "Quickstart", "guides-and-cursor.md": "Guides and the Ghost Cursor",
          "actions-and-security.md": "Actions and security", "sdk-reference.md": "SDK reference"}


def set_env(name: str, value: str) -> None:
    p = ROOT / ".env"
    lines = p.read_text(encoding="utf-8").splitlines()
    for i, ln in enumerate(lines):
        if ln.startswith(name + "="):
            lines[i] = f"{name}={value}"
            break
    else:
        lines.append(f"{name}={value}")
    p.write_text("\n".join(lines) + "\n", encoding="utf-8")


async def main(origins: list[str]) -> None:
    async with privileged_conn() as conn:
        await conn.execute(text("insert into organizations (id, name) values (:o, 'VISTRA (website)') on conflict do nothing"), {"o": ORG})
        await conn.execute(text("insert into applications (id, organization_id, name) values (:a, :o, 'VISTRA website') on conflict do nothing"),
                           {"a": APP, "o": ORG})
        for o in origins:
            await conn.execute(text("insert into application_domains (organization_id, application_id, origin) values (:o, :a, :g) on conflict do nothing"),
                               {"o": ORG, "a": APP, "g": o.rstrip("/").lower()})
        if not (await conn.execute(text("select 1 from api_keys where application_id = :a and revoked_at is null"), {"a": APP})).first():
            raw, prefix, digest = new_api_key()
            await conn.execute(text("insert into api_keys (organization_id, application_id, name, key_prefix, key_hash, scopes) "
                                    "values (:o, :a, 'web-server', :p, :h, '{sdk:session}')"), {"o": ORG, "a": APP, "p": prefix, "h": digest})
            set_env("WEB_VISTRA_API_KEY", raw)
            print(f"key created -> WEB_VISTRA_API_KEY in .env (prefix {prefix})")
    async with tenant_conn(ORG) as conn:
        kb = (await conn.execute(text("select id from knowledge_bases where application_id = :a"), {"a": APP})).scalar()
        if kb is None:
            kb = (await conn.execute(text("insert into knowledge_bases (organization_id, application_id, name) values (:o, :a, 'Docs') returning id"),
                                     {"o": ORG, "a": APP})).scalar_one()
        col = (await conn.execute(text("select id from knowledge_collections where knowledge_base_id = :k"), {"k": kb})).scalar()
        if col is None:
            col = (await conn.execute(text("insert into knowledge_collections (organization_id, knowledge_base_id, name) values (:o, :k, 'Default') returning id"),
                                      {"o": ORG, "k": kb})).scalar_one()
    for fname, title in TITLES.items():
        body = (DOCS / fname).read_text(encoding="utf-8")
        _, jid = await ingestion.create_source_and_job(ORG, str(col), "markdown", title, None, body)
        await ingestion.run_job(ORG, jid)
        async with tenant_conn(ORG) as conn:
            row = (await conn.execute(text("select status, error, stats from ingestion_jobs where id = cast(:j as uuid)"), {"j": jid})).mappings().first()
        print(f"ingest {fname}: {row['status']} {dict(row['stats'])} {row['error'] or ''}")
    await dispose_engine()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--origin", action="append", default=[])
    a = ap.parse_args()
    asyncio.run(main(list(dict.fromkeys(["http://localhost:3000", *a.origin]))))
