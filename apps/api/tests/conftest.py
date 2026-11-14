from __future__ import annotations

import os

# Tests never call a real model provider.
os.environ["AI_PROVIDER_MODE"] = "fake"
os.environ["APP_ENV"] = "test"
os.environ.setdefault("TOOL_SIGNING_SECRET", "test-signing-secret-0123456789abcdef")
os.environ["AI_ALLOW_FAULT_INJECTION"] = "true"
os.environ["RATE_LIMIT_ENABLED"] = "false"
os.environ["REDIS_URL"] = ""  # tests run ingestion inline and never touch the shared Redis

import asyncio  # noqa: E402
import sys  # noqa: E402
import uuid  # noqa: E402

if sys.platform == "win32":  # psycopg (LangGraph checkpointer) needs a selector loop
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

import httpx  # noqa: E402
import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.ai.router import set_router  # noqa: E402
from app.core.config import get_settings  # noqa: E402
from app.core.db import dispose_engine, privileged_conn, tenant_conn  # noqa: E402
from app.core.security import new_api_key  # noqa: E402
from app.knowledge import ingestion  # noqa: E402
from app.main import app  # noqa: E402

ORIGIN = "https://acme-test.example.com"
DOC = """# Test Pricing

## Starter plan

The Starter plan costs $12 per month for up to 5 team members. It includes 10 projects and email support.

## Enterprise plan

The Enterprise plan includes single sign-on and a dedicated success manager.
"""


class Tenant:
    def __init__(self, org: str, app_id: str, admin_key: str, sdk_key: str) -> None:
        self.org, self.app_id, self.admin_key, self.sdk_key = org, app_id, admin_key, sdk_key

    @property
    def admin(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.admin_key}"}

    @property
    def sdk(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.sdk_key}", "Origin": ORIGIN}


async def _make_tenant(tag: str, with_docs: bool) -> Tenant:
    org, app_id = f"org_t_{tag}_{uuid.uuid4().hex[:6]}", f"app_t_{tag}_{uuid.uuid4().hex[:6]}"
    admin_raw, admin_prefix, admin_hash = new_api_key()
    sdk_raw, sdk_prefix, sdk_hash = new_api_key()
    async with privileged_conn() as conn:
        await conn.execute(text("insert into organizations (id, name) values (:o, :o)"), {"o": org})
        await conn.execute(text("insert into applications (id, organization_id, name, tool_base_url) values (:a, :o, 'T', 'http://tool.invalid')"),
                           {"a": app_id, "o": org})
        await conn.execute(text("insert into application_domains (organization_id, application_id, origin) values (:o, :a, :g)"),
                           {"o": org, "a": app_id, "g": ORIGIN})
        for _raw, prefix, h, scopes in ((admin_raw, admin_prefix, admin_hash, ["*"]), (sdk_raw, sdk_prefix, sdk_hash, ["sdk:session"])):
            await conn.execute(text("insert into api_keys (organization_id, application_id, name, key_prefix, key_hash, scopes) "
                                    "values (:o, :a, 'k', :p, :h, :s)"), {"o": org, "a": app_id, "p": prefix, "h": h, "s": scopes})
    if with_docs:
        async with tenant_conn(org) as conn:
            kb = (await conn.execute(text("insert into knowledge_bases (organization_id, application_id, name) values (:o, :a, 'kb') returning id"),
                                     {"o": org, "a": app_id})).scalar_one()
            col = (await conn.execute(text("insert into knowledge_collections (organization_id, knowledge_base_id, name) values (:o, :k, 'c') returning id"),
                                      {"o": org, "k": kb})).scalar_one()
        _, jid = await ingestion.create_source_and_job(org, str(col), "markdown", "Test Pricing", None, DOC)
        await ingestion.run_job(org, jid)
    return Tenant(org, app_id, admin_raw, sdk_raw)


@pytest_asyncio.fixture(scope="session")
async def tenants():
    set_router(None)
    get_settings.cache_clear()
    a = await _make_tenant("a", True)
    b = await _make_tenant("b", False)
    yield a, b
    async with privileged_conn() as conn:
        await conn.execute(text("delete from organizations where id in (:a, :b)"), {"a": a.org, "b": b.org})
    await dispose_engine()


@pytest_asyncio.fixture(scope="session")
async def client():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test", timeout=120) as c:
        yield c


async def mint(client: httpx.AsyncClient, t: Tenant, role: str = "admin") -> dict:
    r = await client.post("/v1/sdk/sessions", headers=t.sdk, json={"end_user": {"id": "u", "role": role}})
    assert r.status_code == 201, r.text
    return r.json()


def parse_sse(body: str) -> list[tuple[str, dict]]:
    import json
    out, ev = [], ""
    for line in body.splitlines():
        if line.startswith("event:"):
            ev = line[6:].strip()
        elif line.startswith("data:"):
            out.append((ev, json.loads(line[5:])))
    return out


@pytest.fixture
def anyio_backend():
    return "asyncio"
