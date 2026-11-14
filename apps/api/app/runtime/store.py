"""SQL for sessions, messages, events, runs and steps. Every function is tenant scoped (RLS + explicit org)."""
from __future__ import annotations

import json
from typing import Any

from sqlalchemy import text

from app.core.db import tenant_conn


def _j(v: Any) -> str:
    return json.dumps(v, default=str)


async def create_conversation(org: str, app_id: str, app_session_id: str) -> str:
    async with tenant_conn(org) as conn:
        sid = (await conn.execute(text(
            "insert into sessions (organization_id, application_id, application_session_id) "
            "values (:o, :a, cast(:s as uuid)) returning id"), {"o": org, "a": app_id, "s": app_session_id})).scalar_one()
    return str(sid)


async def conversation_for(org: str, app_session_id: str) -> str | None:
    async with tenant_conn(org) as conn:
        r = (await conn.execute(text(
            "select id from sessions where application_session_id = cast(:s as uuid) and organization_id = :o"),
            {"s": app_session_id, "o": org})).scalar()
    return str(r) if r else None


async def insert_message(org: str, session_id: str, run_id: str | None, role: str, content: str,
                         citations: list | None = None, metadata: dict | None = None) -> str:
    async with tenant_conn(org) as conn:
        mid = (await conn.execute(text(
            "insert into session_messages (organization_id, session_id, run_id, role, content, citations, metadata) "
            "values (:o, cast(:s as uuid), cast(:r as uuid), :ro, :c, cast(:ci as jsonb), cast(:m as jsonb)) returning id"),
            {"o": org, "s": session_id, "r": run_id, "ro": role, "c": content, "ci": _j(citations or []),
             "m": _j(metadata or {})})).scalar_one()
    return str(mid)


async def create_run(org: str, session_id: str, user_text: str) -> str:
    async with tenant_conn(org) as conn:
        rid = (await conn.execute(text(
            "insert into agent_runs (organization_id, session_id, input) values (:o, cast(:s as uuid), :i) returning id"),
            {"o": org, "s": session_id, "i": user_text})).scalar_one()
    return str(rid)


async def update_run(org: str, run_id: str, status: str | None = None, intent: str | None = None,
                     output: str | None = None, error_code: str | None = None, served_by: dict | None = None) -> None:
    async with tenant_conn(org) as conn:
        await conn.execute(text(
            "update agent_runs set status = coalesce(cast(:st as text), status), intent = coalesce(cast(:in as text), intent), "
            "output = coalesce(cast(:ou as text), output), error_code = coalesce(cast(:ec as text), error_code), "
            "served_by = case when cast(:sb as text) is null then served_by else cast(:sb as jsonb) end, "
            "finished_at = case when cast(:st as text) in ('completed','failed','cancelled') then now() else finished_at end "
            "where id = cast(:r as uuid) and organization_id = :o"),
            {"st": status, "in": intent, "ou": output, "ec": error_code, "sb": _j(served_by) if served_by else None,
             "r": run_id, "o": org})


async def run_status(org: str, run_id: str) -> str | None:
    async with tenant_conn(org) as conn:
        return (await conn.execute(text("select status from agent_runs where id = cast(:r as uuid) and organization_id = :o"),
                                   {"r": run_id, "o": org})).scalar()


async def add_step(org: str, run_id: str, kind: str, summary: str, detail: dict | None = None,
                   latency_ms: int | None = None, status: str = "completed") -> int:
    async with tenant_conn(org) as conn:
        idx = (await conn.execute(text(
            "insert into agent_run_steps (organization_id, run_id, step_index, kind, status, summary, detail, latency_ms) "
            "select :o, cast(:r as uuid), coalesce(max(step_index), -1) + 1, :k, :st, :s, cast(:d as jsonb), :l "
            "from agent_run_steps where run_id = cast(:r as uuid) returning step_index"),
            {"o": org, "r": run_id, "k": kind, "st": status, "s": summary, "d": _j(detail or {}), "l": latency_ms})).scalar_one()
    return int(idx)


async def insert_events(org: str, session_id: str, run_id: str | None, events: list[tuple[str, dict]]) -> None:
    if not events:
        return
    async with tenant_conn(org) as conn:
        await conn.execute(text(
            "insert into session_events (organization_id, session_id, run_id, event_type, payload) "
            "values (:o, cast(:s as uuid), cast(:r as uuid), :t, cast(:p as jsonb))"),
            [{"o": org, "s": session_id, "r": run_id, "t": t, "p": _j(p)} for t, p in events])


async def latest_context(org: str, session_id: str) -> dict | None:
    async with tenant_conn(org) as conn:
        r = (await conn.execute(text(
            "select payload from session_events where session_id = cast(:s as uuid) and organization_id = :o "
            "and event_type = 'context.snapshot' order by seq desc limit 1"), {"s": session_id, "o": org})).scalar()
    return r
