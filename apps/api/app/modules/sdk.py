from __future__ import annotations

import asyncio
import json
import re
import time
import uuid
from datetime import UTC, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import text

from app.agent import graph as agent
from app.ai.base import Capability
from app.ai.router import get_router
from app.core.config import get_settings
from app.core.db import tenant_conn
from app.core.errors import (
    ProblemError,
    approval_expired,
    not_found,
    origin_not_allowed,
    session_expired,
    validation_error,
)
from app.core.redis import lock, rate_limit
from app.core.security import (
    SDK_TOKEN_TTL,
    ApiKeyPrincipal,
    SdkPrincipal,
    args_hash,
    current_api_key,
    current_sdk,
    mint_sdk_token,
)
from app.runtime import orchestrator as orch
from app.runtime import screenshots, store, tools

router = APIRouter(prefix="/v1/sdk", tags=["sdk"])
SESSION_TTL = timedelta(hours=8)
MAX_SNAPSHOT_BYTES = 8192


# ---- schemas -------------------------------------------------------------------------------------
class EndUser(BaseModel):
    id: str | None = Field(default=None, max_length=200)
    role: str = Field(default="member", pattern=r"^(owner|admin|member|viewer)$")


class SessionIn(BaseModel):
    end_user: EndUser = Field(default_factory=EndUser)
    origin: str | None = Field(default=None, max_length=300)  # forwarded by the host server when no Origin header


class MessageOptions(BaseModel):
    force_primary_failure: bool = False


class MessageIn(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    options: MessageOptions = Field(default_factory=MessageOptions)


class Selection(BaseModel):
    role: str | None = Field(default=None, max_length=60)
    name: str | None = Field(default=None, max_length=300)
    text: str | None = Field(default=None, max_length=500)
    tag: str | None = Field(default=None, max_length=30)
    target_id: str | None = Field(default=None, max_length=160)
    state: str | None = Field(default=None, max_length=200)
    near: str | None = Field(default=None, max_length=300)
    input_type: str | None = Field(default=None, max_length=30)
    autocomplete: str | None = Field(default=None, max_length=60)
    private: bool = False


class KnownTarget(BaseModel):
    id: str = Field(max_length=160)
    role: str | None = Field(default=None, max_length=60)
    name: str | None = Field(default=None, max_length=200)
    route: str | None = Field(default=None, max_length=300)


class ContextIn(BaseModel):
    route: str = Field(max_length=500)
    title: str = Field(default="", max_length=300)
    a11y_summary: str = Field(default="", max_length=MAX_SNAPSHOT_BYTES)
    selection: Selection | None = None
    known_targets: list[KnownTarget] = Field(default_factory=list, max_length=200)
    known_routes: list[str] = Field(default_factory=list, max_length=60)
    url: str | None = Field(default=None, max_length=1000)
    # data:image/jpeg;base64,... (<= 2 MB decoded). Kept in Redis for 10 minutes, never written to Postgres.
    screenshot: str | None = Field(default=None, max_length=2_900_000)


class GuideStepIn(BaseModel):
    target_id: str
    instruction: str = Field(max_length=300)
    action: Literal["click", "type", "view"] = "view"
    reason: str = Field(default="", max_length=240)


class GuideIn(BaseModel):
    goal: str = Field(min_length=1, max_length=300)
    steps: list[GuideStepIn] = Field(min_length=1, max_length=12)


class CursorEvent(BaseModel):
    type: Literal["guide.started", "target.resolved", "target.missing", "cursor.moving", "cursor.hovering",
                  "step.waiting", "step.completed", "step.failed", "guide.completed", "guide.cancelled"]
    detail: dict = Field(default_factory=dict)


class StepOutcomeIn(BaseModel):
    outcome: Literal["completed", "failed", "skipped", "target_missing", "interrupted", "cancelled"]
    events: list[CursorEvent] = Field(default_factory=list, max_length=20)


class ApprovalDecisionIn(BaseModel):
    decision: Literal["approve", "reject"]
    args_hash: str = Field(min_length=64, max_length=64)


# ---- helpers -------------------------------------------------------------------------------------
def sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n"


async def sse_stream(em: orch.Emitter):
    while True:
        try:
            item = await asyncio.wait_for(em.q.get(), timeout=15)
        except TimeoutError:
            yield ": heartbeat\n\n"
            continue
        if item is None:
            return
        yield sse(item[0], item[1])


def sse_response(em: orch.Emitter) -> StreamingResponse:
    return StreamingResponse(sse_stream(em), media_type="text/event-stream",
                             headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache", "Connection": "keep-alive"})


async def validate_origin(org: str, app_id: str, origin: str | None) -> str:
    if not origin:
        raise origin_not_allowed("An Origin is required to mint an SDK session")
    norm = origin.strip().rstrip("/").lower()
    async with tenant_conn(org) as conn:
        ok = (await conn.execute(text(
            "select 1 from application_domains where application_id = :a and organization_id = :o and lower(origin) = :g"),
            {"a": app_id, "o": org, "g": norm})).first()
    if ok is None:
        raise origin_not_allowed()
    return norm


# ---- sessions ------------------------------------------------------------------------------------
@router.post("/sessions", status_code=201)
async def create_session(body: SessionIn, request: Request, p: ApiKeyPrincipal = Depends(current_api_key)) -> dict:
    p.require("sdk:session")
    await rate_limit(f"mint:{p.key_id}", 120, 60)
    origin = await validate_origin(p.organization_id, p.application_id, request.headers.get("origin") or body.origin)
    expires = datetime.now(UTC) + SESSION_TTL
    async with tenant_conn(p.organization_id) as conn:
        sid = (await conn.execute(text(
            "insert into application_sessions (organization_id, application_id, end_user_id, end_user_role, origin, expires_at) "
            "values (:o, :a, :u, :r, :g, :e) returning id"),
            {"o": p.organization_id, "a": p.application_id, "u": body.end_user.id, "r": body.end_user.role, "g": origin,
             "e": expires})).scalar_one()
    await store.create_conversation(p.organization_id, p.application_id, str(sid))
    token = mint_sdk_token(p.application_id, p.organization_id, str(sid))
    return {"session_id": str(sid), "token": token, "token_ttl": SDK_TOKEN_TTL,
            "token_expires_at": (datetime.now(UTC) + timedelta(seconds=SDK_TOKEN_TTL)).isoformat(),
            "end_user_role": body.end_user.role}


@router.post("/sessions/{session_id}/refresh")
async def refresh_session(session_id: uuid.UUID, p: ApiKeyPrincipal = Depends(current_api_key)) -> dict:
    p.require("sdk:session")
    async with tenant_conn(p.organization_id) as conn:
        row = (await conn.execute(text(
            "select expires_at, revoked_at from application_sessions where id = :i and application_id = :a and organization_id = :o"),
            {"i": session_id, "a": p.application_id, "o": p.organization_id})).mappings().first()
    if row is None:
        raise not_found("Session")
    if row["revoked_at"] is not None:
        from app.core.errors import session_revoked
        raise session_revoked()
    if row["expires_at"] < datetime.now(UTC):
        raise session_expired()
    token = mint_sdk_token(p.application_id, p.organization_id, str(session_id))
    return {"session_id": str(session_id), "token": token, "token_ttl": SDK_TOKEN_TTL,
            "token_expires_at": (datetime.now(UTC) + timedelta(seconds=SDK_TOKEN_TTL)).isoformat()}


@router.get("/config")
async def sdk_config(p: ApiKeyPrincipal = Depends(current_api_key)) -> dict:
    p.require("sdk:session")
    s = get_settings()
    async with tenant_conn(p.organization_id) as conn:
        app_row = (await conn.execute(text("select id, name from applications where id = :a and organization_id = :o"),
                                      {"a": p.application_id, "o": p.organization_id})).mappings().first()
    if app_row is None:
        raise not_found("Application")
    return {
        "application": {"id": app_row["id"], "name": app_row["name"]},
        "capabilities": {"answer": True, "explain_element": True, "explain_page": True, "guide": True, "actions": True,
                         "screenshot_vision": get_router().supports(Capability.VISION),
                         "screenshot_vision_simulated": s.ai_provider_mode == "fake",
                         "voice": False},
        "tools": tools.public_tools(),
        "ai": {"mode": s.ai_provider_mode, "simulated": s.ai_provider_mode == "fake"},
        "token_ttl": SDK_TOKEN_TTL,
    }


# ---- context -------------------------------------------------------------------------------------
@router.post("/context", status_code=201)
async def post_context(body: ContextIn, p: SdkPrincipal = Depends(current_sdk)) -> dict:
    sel = body.selection
    redacted = False
    if sel and (sel.private or (sel.input_type or "").lower() == "password" or (sel.autocomplete or "").lower().startswith("cc-")):
        sel, redacted = None, True  # never persist a password / card field or a data-vistra-private element
    shot_ok = False
    if body.screenshot:
        m = re.match(r"^data:image/(jpeg|png|webp);base64,", body.screenshot)
        payload = body.screenshot[m.end():] if m else ""
        if not m or not re.fullmatch(r"[A-Za-z0-9+/]+={0,2}", payload):
            raise validation_error("screenshot must be a base64 data URL (image/jpeg, png or webp)")
        if len(payload) * 3 // 4 > screenshots.MAX_BYTES:
            raise validation_error("screenshot exceeds 2 MB")
        shot_ok = True
    snapshot = {
        "route": body.route, "title": body.title, "a11y_summary": body.a11y_summary[:MAX_SNAPSHOT_BYTES],
        "known_routes": [r[:300] for r in body.known_routes], "url": body.url, "has_screenshot": shot_ok,
        "selection": sel.model_dump(exclude={"private", "input_type", "autocomplete"}, exclude_none=True) if sel else None,
        "known_targets": [t.model_dump(exclude_none=True) for t in body.known_targets], "redacted": redacted,
    }
    if len(json.dumps(snapshot)) > 64_000:
        raise validation_error("Context snapshot too large")
    conv = await store.conversation_for(p.organization_id, p.session_id)
    if conv is None:
        raise not_found("Conversation")
    await store.insert_events(p.organization_id, conv, None, [("context.snapshot", snapshot)])
    if shot_ok:
        await screenshots.put(conv, body.screenshot or "")
    return {"stored": True, "redacted": redacted, "screenshot": shot_ok}


# ---- messages (SSE) ------------------------------------------------------------------------------
@router.post("/messages")
async def post_message(body: MessageIn, p: SdkPrincipal = Depends(current_sdk)) -> StreamingResponse:
    await rate_limit(f"sdk-msg:{p.session_id}", 20, 60)
    await rate_limit(f"app-msg:{p.application_id}", 600, 60)
    conv = await store.conversation_for(p.organization_id, p.session_id)
    if conv is None:
        raise not_found("Conversation")
    await store.insert_message(p.organization_id, conv, None, "user", body.message)
    run_id = await store.create_run(p.organization_id, conv, body.message)
    em = orch.Emitter(p.organization_id, conv, run_id)
    ctx = orch.RunCtx(p, conv, run_id, em, force_primary_failure=body.options.force_primary_failure)
    _keep(asyncio.create_task(agent.start_run(ctx, body.message)))
    return sse_response(em)


_bg: set[asyncio.Task] = set()


def _keep(t: asyncio.Task) -> None:
    _bg.add(t)
    t.add_done_callback(_bg.discard)


@router.get("/sessions/{session_id}/messages")
async def history(session_id: uuid.UUID, p: SdkPrincipal = Depends(current_sdk)) -> list[dict]:
    if str(session_id) != p.session_id:
        raise not_found("Session")
    conv = await store.conversation_for(p.organization_id, p.session_id)
    async with tenant_conn(p.organization_id) as conn:
        rows = (await conn.execute(text(
            "select id, run_id, role, content, citations, metadata, created_at from session_messages "
            "where session_id = cast(:s as uuid) and organization_id = :o order by created_at"),
            {"s": conv, "o": p.organization_id})).mappings().all()
    return [{**r, "id": str(r["id"]), "run_id": str(r["run_id"]) if r["run_id"] else None} for r in rows]


# ---- guides --------------------------------------------------------------------------------------
@router.post("/guides", status_code=201)
async def create_guide(body: GuideIn, p: SdkPrincipal = Depends(current_sdk)) -> dict:
    conv = await store.conversation_for(p.organization_id, p.session_id)
    ctx_snapshot = await store.latest_context(p.organization_id, conv) or {}
    steps, dropped = await orch.plan_guide_steps(ctx_snapshot, [s.model_dump() for s in body.steps])
    if not steps:
        raise validation_error(f"None of the requested targets exist in the host application: {dropped}")
    fid = await orch.create_flow(p.organization_id, conv, None, body.goal, steps)
    return {"flow_id": fid, "goal": body.goal, "steps": steps, "dropped_unknown_targets": dropped}


@router.post("/guides/{flow_id}/steps/{index}")
async def step_outcome(flow_id: uuid.UUID, index: int, body: StepOutcomeIn, p: SdkPrincipal = Depends(current_sdk)) -> dict:
    conv = await store.conversation_for(p.organization_id, p.session_id)
    async with tenant_conn(p.organization_id) as conn:
        flow = (await conn.execute(text(
            "select id, steps, step_outcomes, status, run_id from guide_flows where id = :f and session_id = cast(:s as uuid) "
            "and organization_id = :o for update"), {"f": flow_id, "s": conv, "o": p.organization_id})).mappings().first()
        if flow is None:
            raise not_found("Guide flow")
        n = len(flow["steps"])
        if not 0 <= index < n:
            raise validation_error("Step index out of range")
        outcomes = list(flow["step_outcomes"]) + [{"index": index, "outcome": body.outcome, "at": time.time()}]
        status = flow["status"]
        if body.outcome == "completed" and index == n - 1:
            status = "completed"
        elif body.outcome in ("failed", "target_missing", "interrupted"):
            status = "failed"
        elif body.outcome == "cancelled":
            status = "cancelled"
        await conn.execute(text("update guide_flows set step_outcomes = cast(:o as jsonb), status = :s where id = :f"),
                           {"o": json.dumps(outcomes), "s": status, "f": flow_id})
    evts = [(e.type, {"flow_id": str(flow_id), "index": index, **e.detail}) for e in body.events]
    if status == "completed":
        evts.append(("guide.completed", {"flow_id": str(flow_id)}))
    await store.insert_events(p.organization_id, conv, str(flow["run_id"]) if flow["run_id"] else None, evts)
    return {"flow_id": str(flow_id), "status": status, "recorded": len(evts)}


# ---- approvals (SSE) -----------------------------------------------------------------------------
@router.post("/approvals/{approval_id}")
async def decide_approval(approval_id: uuid.UUID, body: ApprovalDecisionIn, p: SdkPrincipal = Depends(current_sdk)) -> StreamingResponse:
    conv = await store.conversation_for(p.organization_id, p.session_id)
    async with lock(f"approval:{approval_id}", ttl_s=30, wait_s=5), tenant_conn(p.organization_id) as conn:
        row = (await conn.execute(text(
            "select a.id, a.status, a.args_hash, a.expires_at, a.run_id, a.tool_invocation_id, t.args, t.args_hash as inv_hash "
            "from approvals a join tool_invocations t on t.id = a.tool_invocation_id "
            "join agent_runs r on r.id = a.run_id "
            "where a.id = :a and a.organization_id = :o and r.session_id = cast(:s as uuid)"),
            {"a": approval_id, "o": p.organization_id, "s": conv})).mappings().first()
        if row is None:
            raise not_found("Approval")
        if row["status"] != "pending":
            raise approval_expired("This approval was already decided")
        if row["expires_at"] < datetime.now(UTC):
            await conn.execute(text("update approvals set status = 'expired' where id = :a"), {"a": approval_id})
            raise approval_expired("The approval window has passed")
        # the user must approve exactly the frozen arguments they were shown
        if body.args_hash != row["args_hash"] or args_hash(row["args"]) != row["args_hash"] or row["inv_hash"] != row["args_hash"]:
            raise approval_expired("Arguments changed since the approval was requested")
        new_status = "approved" if body.decision == "approve" else "rejected"
        claimed = (await conn.execute(text(
            "update approvals set status = :s, decided_by = :d, decided_at = now() where id = :a and status = 'pending' returning id"),
            {"s": new_status, "d": p.end_user_id or p.session_id, "a": approval_id})).first()
        if claimed is None:
            raise approval_expired("This approval was already decided")
        await conn.execute(text(
            "insert into audit_events (organization_id, actor_type, actor_id, action, resource_type, resource_id, detail) "
            "values (:o, 'sdk_session', :d, :ac, 'approval', :r, cast(:dt as jsonb))"),
            {"o": p.organization_id, "d": p.end_user_id or p.session_id, "ac": f"approval.{new_status}", "r": str(approval_id),
             "dt": json.dumps({"args_hash": row["args_hash"], "run_id": str(row["run_id"])})})
    run_id = str(row["run_id"])
    em = orch.Emitter(p.organization_id, conv, run_id)
    ctx = orch.RunCtx(p, conv, run_id, em)
    _keep(asyncio.create_task(agent.resume_run(ctx, body.decision == "approve")))
    return sse_response(em)


_ = ProblemError
