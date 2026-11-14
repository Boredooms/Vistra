"""Database access.

Two paths, both explicit:

* ``tenant_conn(org_id)``  -- every normal request. Runs as the non-bypass role ``vistra_app`` with
  ``app.organization_id`` set, so Postgres RLS enforces tenant isolation.
* ``privileged_conn()``    -- pre-authentication lookups only (API-key hash, application + domains by id),
  workers' job claiming and migrations. Enumerated in docs/03-database-and-identity/19.
"""
from __future__ import annotations

import os
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from urllib.parse import unquote, urlsplit

from sqlalchemy import URL, text
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine, create_async_engine

from app.core.config import get_settings

_engine: AsyncEngine | None = None


def build_url(raw: str) -> URL:
    u = urlsplit(raw)
    return URL.create(
        "postgresql+asyncpg",
        username=unquote(u.username or ""),
        password=unquote(u.password or ""),
        host=u.hostname,
        port=u.port or 5432,
        database=(u.path or "/postgres").lstrip("/"),
    )


def get_engine() -> AsyncEngine:
    global _engine
    if _engine is None:
        s = get_settings()
        local = (urlsplit(s.supabase_db_url).hostname or "") in ("localhost", "127.0.0.1")
        _engine = create_async_engine(
            build_url(s.supabase_db_url),
            # Supabase session pooler caps clients at 15 for ALL API instances together (e.g. local + Render):
            # keep each instance at <= 7 (5 here + 2 checkpointer). Tune with DB_POOL_SIZE / DB_MAX_OVERFLOW.
            pool_size=int(os.environ.get("DB_POOL_SIZE", "3")),
            max_overflow=int(os.environ.get("DB_MAX_OVERFLOW", "2")),
            pool_timeout=20,
            pool_pre_ping=True,  # pooler drops idle connections; requires session mode (port 5432), not transaction mode
            pool_recycle=240,
            connect_args={
                "statement_cache_size": 0,  # required behind the Supabase transaction pooler
                "prepared_statement_name_func": lambda: f"__vistra_{uuid.uuid4().hex}__",
                "ssl": False if local else "require",
                "timeout": 20,
            },
        )
    return _engine


async def dispose_engine() -> None:
    global _engine
    if _engine is not None:
        await _engine.dispose()
        _engine = None


@asynccontextmanager
async def tenant_conn(organization_id: str) -> AsyncIterator[AsyncConnection]:
    if not organization_id:
        raise ValueError("organization_id required")
    async with get_engine().connect() as conn:
        async with conn.begin():
            # one round trip: transaction-local role switch (non-bypass role => RLS applies) + tenant GUC
            await conn.execute(text("select set_config('role', 'vistra_app', true), set_config('app.organization_id', :o, true)"),
                               {"o": organization_id})
            yield conn


@asynccontextmanager
async def privileged_conn() -> AsyncIterator[AsyncConnection]:
    async with get_engine().connect() as conn:
        async with conn.begin():
            yield conn
