from __future__ import annotations

import time

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.core.config import get_settings
from app.core.db import privileged_conn

router = APIRouter(tags=["health"])


async def _db_ok() -> tuple[bool, float]:
    t0 = time.perf_counter()
    try:
        async with privileged_conn() as conn:
            await conn.execute(text("select 1"))
        return True, round((time.perf_counter() - t0) * 1000, 1)
    except Exception:  # noqa: BLE001
        return False, round((time.perf_counter() - t0) * 1000, 1)


@router.get("/healthz")
async def healthz() -> JSONResponse:
    s = get_settings()
    ok, ms = await _db_ok()
    body = {
        "status": "ok" if ok else "degraded",
        "db": "ok" if ok else "unreachable",
        "db_ms": ms,
        "ai_mode": s.ai_provider_mode,
        "agent": "langgraph",
        "env": s.app_env,
        "version": "0.1.0",
    }
    return JSONResponse(body, status_code=200 if ok else 503)


@router.get("/readyz")
async def readyz() -> JSONResponse:
    """DB readiness (Redis is optional and not used on the request path in this sprint)."""
    from app.core.redis import ping

    ok, ms = await _db_ok()
    redis = await ping()
    # Redis is ephemeral (rate limits, locks, queue); its loss degrades but does not take the API down.
    return JSONResponse({"ready": ok, "db": "ok" if ok else "unreachable", "db_ms": ms, "redis": redis},
                        status_code=200 if ok else 503)
