from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import text

from app.core.db import tenant_conn
from app.core.errors import not_found
from app.core.security import Principal, current_principal
from app.runtime import store

router = APIRouter(prefix="/v1", tags=["runs"])


def _visible_sql(p: Principal) -> tuple[str, dict]:
    """Org scope always (RLS + explicit). An SDK session additionally sees only its own conversation's runs."""
    if p.sdk is not None:
        return ("and r.session_id in (select id from sessions where application_session_id = cast(:ses as uuid))",
                {"ses": p.sdk.session_id})
    return "", {}


def _ser(r: dict) -> dict:
    return {k: (str(v) if isinstance(v, uuid.UUID) else v) for k, v in r.items()}


async def _load_run(p: Principal, run_id: uuid.UUID) -> dict:
    extra, params = _visible_sql(p)
    async with tenant_conn(p.organization_id) as conn:
        r = (await conn.execute(text(
            "select r.id, r.session_id, r.intent, r.status, r.input, r.output, r.error_code, r.prompt_version, r.served_by, "
            f"r.started_at, r.finished_at from agent_runs r where r.id = :r and r.organization_id = :o {extra}"),
            {"r": run_id, "o": p.organization_id, **params})).mappings().first()
    if r is None:
        raise not_found("Run")  # cross-tenant and unknown ids are indistinguishable
    return dict(r)


@router.get("/runs/{run_id}")
async def get_run(run_id: uuid.UUID, p: Principal = Depends(current_principal)) -> dict:
    run = await _load_run(p, run_id)
    async with tenant_conn(p.organization_id) as conn:
        tools_ = (await conn.execute(text(
            "select id, tool, args, args_hash, policy_decision, policy_reason, status, result, error, executed_at, verified_at, verification "
            "from tool_invocations where run_id = :r and organization_id = :o order by created_at"),
            {"r": run_id, "o": p.organization_id})).mappings().all()
        approvals = (await conn.execute(text(
            "select id, status, args_hash, decided_by, decided_at, expires_at from approvals where run_id = :r and organization_id = :o"),
            {"r": run_id, "o": p.organization_id})).mappings().all()
        usage = (await conn.execute(text(
            "select provider, model, capability, status, error_class, fallback_used, input_tokens, output_tokens, latency_ms, attempt, created_at "
            "from model_usage where run_id = :r and organization_id = :o order by created_at"),
            {"r": run_id, "o": p.organization_id})).mappings().all()
        guides = (await conn.execute(text(
            "select id, goal, status, steps, step_outcomes from guide_flows where run_id = :r and organization_id = :o"),
            {"r": run_id, "o": p.organization_id})).mappings().all()
    return {**_ser(run), "tool_invocations": [_ser(dict(t)) for t in tools_], "approvals": [_ser(dict(a)) for a in approvals],
            "model_usage": [dict(u) for u in usage], "guide_flows": [_ser(dict(g)) for g in guides]}


@router.get("/runs/{run_id}/steps")
async def get_steps(run_id: uuid.UUID, p: Principal = Depends(current_principal)) -> list[dict]:
    await _load_run(p, run_id)
    async with tenant_conn(p.organization_id) as conn:
        rows = (await conn.execute(text(
            "select id, step_index, kind, status, summary, detail, latency_ms, started_at from agent_run_steps "
            "where run_id = :r and organization_id = :o order by step_index"), {"r": run_id, "o": p.organization_id})).mappings().all()
    return [_ser(dict(r)) for r in rows]


@router.post("/runs/{run_id}/cancel")
async def cancel_run(run_id: uuid.UUID, p: Principal = Depends(current_principal)) -> dict:
    run = await _load_run(p, run_id)
    if run["status"] in ("completed", "failed", "cancelled"):
        return {"id": str(run_id), "status": run["status"], "cancelled": False}
    await store.update_run(p.organization_id, str(run_id), status="cancelled")
    return {"id": str(run_id), "status": "cancelled", "cancelled": True}


@router.get("/usage")
async def usage(p: Principal = Depends(current_principal)) -> dict:
    async with tenant_conn(p.organization_id) as conn:
        by_provider = (await conn.execute(text(
            "select provider, model, capability, status, count(*) as calls, coalesce(sum(input_tokens),0) as input_tokens, "
            "coalesce(sum(output_tokens),0) as output_tokens, round(avg(latency_ms)) as avg_latency_ms "
            "from model_usage where organization_id = :o group by provider, model, capability, status order by provider"),
            {"o": p.organization_id})).mappings().all()
        runs = (await conn.execute(text(
            "select status, count(*) as n from agent_runs where organization_id = :o group by status"),
            {"o": p.organization_id})).mappings().all()
    return {"organization_id": p.organization_id, "model_usage": [dict(r) for r in by_provider],
            "runs_by_status": {r["status"]: r["n"] for r in runs}}


@router.get("/runs")
async def list_runs(limit: int = 50, application_id: str | None = None, p: Principal = Depends(current_principal)) -> list[dict]:
    limit = max(1, min(limit, 200))
    extra, params = _visible_sql(p)
    async with tenant_conn(p.organization_id) as conn:
        rows = (await conn.execute(text(
            "select r.id, r.intent, r.status, r.input, r.error_code, r.served_by, r.started_at, r.finished_at, "
            "(select count(*) from tool_invocations t where t.run_id = r.id) as tool_calls, "
            "(select coalesce(sum(latency_ms),0) from model_usage m where m.run_id = r.id) as model_ms "
            "from agent_runs r join sessions s on s.id = r.session_id "
            "where r.organization_id = :o and (cast(:app as text) is null or s.application_id = :app) "
            f"{extra} order by r.started_at desc limit :l"),
            {"o": p.organization_id, "app": application_id, "l": limit, **params})).mappings().all()
    return [_ser(dict(r)) for r in rows]


@router.get("/usage/timeseries")
async def usage_timeseries(days: int = 14, p: Principal = Depends(current_principal)) -> dict:
    days = max(1, min(days, 90))
    async with tenant_conn(p.organization_id) as conn:
        runs = (await conn.execute(text(
            "select d::date as day, "
            "count(r.id) as runs, count(r.id) filter (where r.status = 'completed') as completed, "
            "count(r.id) filter (where r.status = 'failed') as failed, "
            "count(r.id) filter (where r.intent = 'action') as actions "
            "from generate_series(current_date - (:n - 1) * interval '1 day', current_date, interval '1 day') d "
            "left join agent_runs r on r.started_at::date = d::date and r.organization_id = :o "
            "group by d order by d"), {"n": days, "o": p.organization_id})).mappings().all()
        models = (await conn.execute(text(
            "select d::date as day, count(m.id) as calls, count(m.id) filter (where m.status = 'failed') as failed_calls, "
            "count(m.id) filter (where m.fallback_used and m.status = 'ok') as fallback_calls, "
            "coalesce(round(avg(m.latency_ms) filter (where m.status = 'ok')), 0) as avg_latency_ms, "
            "coalesce(sum(m.input_tokens), 0) as input_tokens, coalesce(sum(m.output_tokens), 0) as output_tokens "
            "from generate_series(current_date - (:n - 1) * interval '1 day', current_date, interval '1 day') d "
            "left join model_usage m on m.created_at::date = d::date and m.organization_id = :o "
            "group by d order by d"), {"n": days, "o": p.organization_id})).mappings().all()
        providers = (await conn.execute(text(
            "select provider, model, count(*) as calls, count(*) filter (where status = 'failed') as failed "
            "from model_usage where organization_id = :o and created_at > now() - (:n * interval '1 day') "
            "group by provider, model order by calls desc"), {"n": days, "o": p.organization_id})).mappings().all()
        tools_ = (await conn.execute(text(
            "select count(*) as total, count(*) filter (where status = 'verified') as verified, "
            "count(*) filter (where status = 'verification_failed') as verification_failed, "
            "count(*) filter (where policy_decision = 'deny') as denied, "
            "count(*) filter (where policy_decision = 'require_approval') as needed_approval "
            "from tool_invocations where organization_id = :o and created_at > now() - (:n * interval '1 day')"),
            {"n": days, "o": p.organization_id})).mappings().one()
    merged = [{"day": r["day"].isoformat(), **{k: int(v) for k, v in r.items() if k != "day"},
               **{k: int(v) for k, v in m.items() if k != "day"}} for r, m in zip(runs, models, strict=True)]
    return {"days": days, "series": merged, "providers": [dict(x) for x in providers], "tools": {k: int(v) for k, v in tools_.items()}}


@router.get("/audit-events")
async def audit_events(limit: int = 100, p: Principal = Depends(current_principal)) -> list[dict]:
    """Append-only audit trail: key/agent/app changes, approvals, policy denials."""
    if p.sdk is not None:
        raise not_found("Audit log")
    limit = max(1, min(limit, 500))
    async with tenant_conn(p.organization_id) as conn:
        rows = (await conn.execute(text(
            "select id, actor_type, actor_id, action, resource_type, resource_id, detail, created_at from audit_events "
            "where organization_id = :o order by created_at desc limit :l"), {"o": p.organization_id, "l": limit})).mappings().all()
    return [_ser(dict(r)) for r in rows]


@router.get("/events")
async def events(limit: int = 150, run_id: uuid.UUID | None = None, p: Principal = Depends(current_principal)) -> list[dict]:
    """Agent event stream as persisted in session_events (token chunks excluded)."""
    if p.sdk is not None:
        raise not_found("Events")
    limit = max(1, min(limit, 500))
    async with tenant_conn(p.organization_id) as conn:
        rows = (await conn.execute(text(
            "select e.id, e.run_id, e.seq, e.event_type, e.payload, e.created_at from session_events e "
            "where e.organization_id = :o and e.event_type <> 'token' and (cast(:r as uuid) is null or e.run_id = cast(:r as uuid)) "
            "order by e.seq desc limit :l"), {"o": p.organization_id, "r": str(run_id) if run_id else None, "l": limit})).mappings().all()
    out = []
    for r in rows:
        d = _ser(dict(r))
        payload = dict(d.get("payload") or {})
        payload.pop("served_by", None)  # large; available on the run itself
        d["payload"] = payload
        out.append(d)
    return out


@router.get("/usage/breakdown")
async def usage_breakdown(days: int = 14, p: Principal = Depends(current_principal)) -> dict:
    days = max(1, min(days, 90))
    async with tenant_conn(p.organization_id) as conn:
        intents = (await conn.execute(text(
            "select coalesce(intent, 'unknown') as intent, count(*) as runs, count(*) filter (where status = 'completed') as completed "
            "from agent_runs where organization_id = :o and started_at > now() - (:n * interval '1 day') group by 1 order by 2 desc"),
            {"o": p.organization_id, "n": days})).mappings().all()
        caps = (await conn.execute(text(
            "select capability, count(*) as calls, round(avg(latency_ms) filter (where status = 'ok')) as avg_ms, "
            "percentile_disc(0.95) within group (order by latency_ms) filter (where status = 'ok') as p95_ms "
            "from model_usage where organization_id = :o and created_at > now() - (:n * interval '1 day') group by 1 order by 2 desc"),
            {"o": p.organization_id, "n": days})).mappings().all()
        errors = (await conn.execute(text(
            "select coalesce(error_code, 'none') as code, count(*) as n from agent_runs where organization_id = :o "
            "and status = 'failed' and started_at > now() - (:n * interval '1 day') group by 1 order by 2 desc"),
            {"o": p.organization_id, "n": days})).mappings().all()
    return {"days": days, "intents": [dict(x) for x in intents], "capabilities": [dict(x) for x in caps],
            "errors": [dict(x) for x in errors]}
