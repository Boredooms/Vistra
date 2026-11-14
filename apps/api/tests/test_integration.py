from __future__ import annotations

import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from app.core.db import tenant_conn
from app.runtime import tools
from tests.conftest import ORIGIN, mint, parse_sse

pytestmark = pytest.mark.asyncio

CTX = {"route": "/dashboard", "title": "Dash", "known_targets": [
    {"id": "nav.team", "role": "link", "name": "Team", "route": "*"},
    {"id": "team.invite", "role": "button", "name": "Invite member", "route": "/team"},
    {"id": "invite.name", "role": "textbox", "name": "Name", "route": "/team"}]}


async def ask(client, t, session, message, ctx=CTX):
    h = {"Authorization": f"Bearer {session['token']}", "Origin": ORIGIN}
    await client.post("/v1/sdk/context", headers=h, json=ctx)
    r = await client.post("/v1/sdk/messages", headers=h, json={"message": message})
    assert r.status_code == 200, r.text
    return h, parse_sse(r.text), r


# ---- origin / auth ---------------------------------------------------------------------------------
async def test_unlisted_origin_is_rejected(client, tenants):
    a, _ = tenants
    r = await client.post("/v1/sdk/sessions", headers={**a.sdk, "Origin": "https://evil.example.com"}, json={})
    assert r.status_code == 403 and r.json()["code"] == "ORIGIN_NOT_ALLOWED"
    assert r.headers["content-type"].startswith("application/problem+json")
    r = await client.post("/v1/sdk/sessions", headers={"Authorization": a.sdk["Authorization"]}, json={})
    assert r.json()["code"] == "ORIGIN_NOT_ALLOWED"  # no Origin at all


async def test_api_key_required_and_never_valid_as_sdk_token(client, tenants):
    a, _ = tenants
    assert (await client.get("/v1/applications")).status_code == 401
    r = await client.post("/v1/sdk/messages", headers=a.sdk, json={"message": "hi"})
    assert r.status_code == 401  # an API key must not be accepted where an SDK token is required


async def test_scope_enforced(client, tenants):
    a, _ = tenants
    r = await client.get("/v1/knowledge-bases", headers=a.sdk)  # sdk-only key lacks knowledge:read
    assert r.status_code == 403


async def test_expired_session_token(client, tenants):
    import time

    from app.core.security import mint_sdk_token
    a, _ = tenants
    s = await mint(client, a)
    old = mint_sdk_token(a.app_id, a.org, s["session_id"], now=int(time.time()) - 5000)
    r = await client.post("/v1/sdk/context", headers={"Authorization": f"Bearer {old}", "Origin": ORIGIN}, json={"route": "/"})
    assert r.status_code == 401 and r.json()["code"] == "SESSION_EXPIRED"


async def test_session_refresh(client, tenants):
    a, _ = tenants
    s = await mint(client, a)
    r = await client.post(f"/v1/sdk/sessions/{s['session_id']}/refresh", headers=a.sdk)
    assert r.status_code == 200 and r.json()["session_id"] == s["session_id"]


# ---- tenant isolation ------------------------------------------------------------------------------
async def test_rls_blocks_other_tenant_rows(tenants):
    a, b = tenants
    async with tenant_conn(a.org) as conn:
        own = (await conn.execute(text("select count(*) from document_chunks"))).scalar_one()
        assert own > 0
    async with tenant_conn(b.org) as conn:
        for table in ("document_chunks", "embeddings", "documents", "knowledge_bases", "api_keys", "applications", "agent_runs",
                      "session_events", "model_usage", "tool_invocations", "approvals"):
            n = (await conn.execute(text(f"select count(*) from {table} where organization_id = :o"), {"o": a.org})).scalar_one()
            assert n == 0, f"{table} leaked to another tenant"
        # even without an explicit org filter, RLS hides org A
        assert (await conn.execute(text("select count(*) from document_chunks"))).scalar_one() == 0


async def test_rls_blocks_cross_tenant_write(tenants):
    a, b = tenants
    with pytest.raises(DBAPIError):
        async with tenant_conn(b.org) as conn:
            await conn.execute(text("insert into knowledge_bases (organization_id, name) values (:o, 'x')"), {"o": a.org})
    async with tenant_conn(b.org) as conn:
        res = await conn.execute(text("update knowledge_bases set name = 'hacked' where organization_id = :o"), {"o": a.org})
        assert res.rowcount == 0


async def test_retrieval_never_crosses_tenants(client, tenants):
    a, b = tenants
    q = {"query": "Starter plan price"}
    ra = await client.post("/v1/knowledge/search", headers=a.admin, json=q)
    rb = await client.post("/v1/knowledge/search", headers=b.admin, json=q)
    assert ra.status_code == 200 and len(ra.json()["results"]) > 0
    assert rb.status_code == 200 and rb.json()["results"] == []


async def test_other_orgs_run_is_404(client, tenants):
    a, b = tenants
    s = await mint(client, a)
    _, events, _ = await ask(client, a, s, "What is included in the Starter plan?")
    run_id = events[0][1]["run_id"]
    assert (await client.get(f"/v1/runs/{run_id}", headers=a.admin)).status_code == 200
    r = await client.get(f"/v1/runs/{run_id}", headers=b.admin)
    assert r.status_code == 404
    assert (await client.get(f"/v1/runs/{run_id}/steps", headers=b.admin)).status_code == 404
    assert (await client.post(f"/v1/runs/{run_id}/cancel", headers=b.admin)).status_code == 404
    # another SDK session of the same org cannot read it either
    s2 = await mint(client, a)
    r = await client.get(f"/v1/runs/{run_id}", headers={"Authorization": f"Bearer {s2['token']}", "Origin": ORIGIN})
    assert r.status_code == 404


# ---- SSE + citations -------------------------------------------------------------------------------
async def test_sse_happy_path_with_citations_and_persistence(client, tenants):
    a, _ = tenants
    s = await mint(client, a)
    _, events, r = await ask(client, a, s, "What is included in the Starter plan?")
    assert r.headers["content-type"].startswith("text/event-stream")
    assert r.headers["x-accel-buffering"] == "no"
    names = [e for e, _ in events]
    assert names[0] == "run.started" and "token" in names and "citation" in names and names[-1] == "run.completed"
    done = events[-1][1]
    assert done["insufficient_evidence"] is False and done["citations"]
    cit = done["citations"][0]
    assert cit["title"] == "Test Pricing" and "Starter" in cit["section"]
    run_id = done["run_id"]
    async with tenant_conn(a.org) as conn:
        types = [x[0] for x in (await conn.execute(text("select event_type from session_events where run_id = cast(:r as uuid) order by seq"),
                                                   {"r": run_id})).all()]
        usage = (await conn.execute(text("select count(*) from model_usage where run_id = cast(:r as uuid)"), {"r": run_id})).scalar_one()
    assert "run.started" in types and "run.completed" in types and types.count("token") == names.count("token")
    assert usage >= 2  # plan + embed + answer recorded
    steps = (await client.get(f"/v1/runs/{run_id}/steps", headers=a.admin)).json()
    assert [x["kind"] for x in steps][:2] == ["intent", "retrieval"]


async def test_absent_topic_returns_insufficient_evidence(client, tenants):
    a, _ = tenants
    s = await mint(client, a)
    _, events, _ = await ask(client, a, s, "Who won the football world cup in 1998?")
    done = events[-1][1]
    assert events[-1][0] == "run.completed" and done["insufficient_evidence"] is True and done["citations"] == []


async def test_context_redacts_password_and_card_fields(client, tenants):
    a, _ = tenants
    s = await mint(client, a)
    h = {"Authorization": f"Bearer {s['token']}", "Origin": ORIGIN}
    r = await client.post("/v1/sdk/context", headers=h, json={"route": "/s", "selection": {"role": "textbox", "name": "Password", "input_type": "password", "text": "hunter2"}})
    assert r.json()["redacted"] is True
    r = await client.post("/v1/sdk/context", headers=h, json={"route": "/s", "selection": {"role": "textbox", "autocomplete": "cc-number", "text": "4242"}})
    assert r.json()["redacted"] is True
    async with tenant_conn(a.org) as conn:
        rows = (await conn.execute(text("select payload::text from session_events where event_type='context.snapshot' "
                                        "and session_id = (select id from sessions where application_session_id = cast(:s as uuid))"),
                                   {"s": s["session_id"]})).scalars().all()
    assert rows and not any("hunter2" in x or "4242" in x for x in rows)


async def test_context_is_bounded(client, tenants):
    a, _ = tenants
    s = await mint(client, a)
    h = {"Authorization": f"Bearer {s['token']}", "Origin": ORIGIN}
    r = await client.post("/v1/sdk/context", headers=h, json={"route": "/s", "a11y_summary": "x" * 9000})
    assert r.status_code == 422 and r.json()["code"] == "VALIDATION_ERROR"


# ---- guide -----------------------------------------------------------------------------------------
async def test_guide_only_uses_known_targets_and_records_outcomes(client, tenants):
    a, _ = tenants
    s = await mint(client, a)
    h, events, _ = await ask(client, a, s, "Show me how to invite a teammate")
    g = next(d for e, d in events if e == "guide.proposed")
    assert [x["target"]["id"] for x in g["steps"]] == ["nav.team", "team.invite", "invite.name"]
    done = events[-1][1]
    assert done["mode"] == "guide"  # Guide Mode: no tool ran
    for i in range(3):
        r = await client.post(f"/v1/sdk/guides/{g['flow_id']}/steps/{i}", headers=h,
                              json={"outcome": "completed", "events": [{"type": "step.completed", "detail": {}}]})
        assert r.status_code == 200
    assert r.json()["status"] == "completed"
    # unknown targets are dropped
    r = await client.post("/v1/sdk/guides", headers=h, json={"goal": "x", "steps": [{"target_id": "does.not.exist", "instruction": "x"}]})
    assert r.status_code == 422


# ---- actions: policy, approval, verification --------------------------------------------------------
class FakeHost:
    """In-memory customer app. `drop_writes` simulates a tool that claims success without persisting."""

    def __init__(self, drop_writes: bool = False) -> None:
        self.projects: list[dict] = []
        self.drop_writes = drop_writes
        self.calls: list[str] = []

    async def call(self, base, tool, args, run_id, idem):
        self.calls.append(tool)
        if tool == "create_project":
            rec = {"id": str(uuid.uuid4()), "name": args["name"]}
            if not self.drop_writes:
                self.projects.append(rec)
            return tools.HostResult(True, 200, {"ok": True, "result": rec}, None, 5)
        if tool == "list_projects":
            return tools.HostResult(True, 200, {"ok": True, "result": {"projects": list(self.projects)}}, None, 5)
        return tools.HostResult(False, 404, {}, "unknown tool", 1)


async def test_action_requires_approval_then_executes_and_verifies(client, tenants, monkeypatch):
    a, _ = tenants
    host = FakeHost()
    monkeypatch.setattr(tools, "call_host", host.call)
    s = await mint(client, a)
    h, events, _ = await ask(client, a, s, "Create a project called Website Redesign")
    names = [e for e, _ in events]
    assert "approval.required" in names and "tool.executing" not in names and host.calls == []  # nothing ran yet
    appr = next(d for e, d in events if e == "approval.required")
    assert appr["args"] == {"name": "Website Redesign"} and len(appr["args_hash"]) == 64

    r = await client.post(f"/v1/sdk/approvals/{appr['approval_id']}", headers=h, json={"decision": "approve", "args_hash": appr["args_hash"]})
    ev2 = parse_sse(r.text)
    n2 = [e for e, _ in ev2]
    assert n2.index("tool.executed") < n2.index("verification.succeeded") < n2.index("run.completed")
    assert host.calls == ["create_project", "list_projects"]
    assert len(host.projects) == 1
    async with tenant_conn(a.org) as conn:
        inv = (await conn.execute(text("select status, verified_at, policy_decision from tool_invocations where run_id = cast(:r as uuid)"),
                                  {"r": appr["run_id"]})).mappings().one()
    assert inv["status"] == "verified" and inv["verified_at"] is not None and inv["policy_decision"] == "require_approval"
    # a decided approval cannot be replayed
    again = await client.post(f"/v1/sdk/approvals/{appr['approval_id']}", headers=h, json={"decision": "approve", "args_hash": appr["args_hash"]})
    assert again.status_code == 409 and again.json()["code"] == "APPROVAL_EXPIRED"
    assert host.calls == ["create_project", "list_projects"]  # no second execution


async def test_verification_failure_is_reported_not_hidden(client, tenants, monkeypatch):
    a, _ = tenants
    host = FakeHost(drop_writes=True)
    monkeypatch.setattr(tools, "call_host", host.call)
    s = await mint(client, a)
    h, events, _ = await ask(client, a, s, "Create a project called Ghost Project")
    appr = next(d for e, d in events if e == "approval.required")
    r = await client.post(f"/v1/sdk/approvals/{appr['approval_id']}", headers=h, json={"decision": "approve", "args_hash": appr["args_hash"]})
    ev = parse_sse(r.text)
    names = [e for e, _ in ev]
    assert "verification.failed" in names and "verification.succeeded" not in names and names[-1] == "run.failed"
    assert ev[-1][1]["code"] == "VERIFICATION_FAILED"
    async with tenant_conn(a.org) as conn:
        inv = (await conn.execute(text("select status, verified_at from tool_invocations where run_id = cast(:r as uuid)"),
                                  {"r": appr["run_id"]})).mappings().one()
    assert inv["status"] == "verification_failed" and inv["verified_at"] is None


async def test_changed_arguments_invalidate_approval(client, tenants, monkeypatch):
    a, _ = tenants
    host = FakeHost()
    monkeypatch.setattr(tools, "call_host", host.call)
    s = await mint(client, a)
    h, events, _ = await ask(client, a, s, "Create a project called Original")
    appr = next(d for e, d in events if e == "approval.required")
    # client presents a hash for different arguments
    r = await client.post(f"/v1/sdk/approvals/{appr['approval_id']}", headers=h, json={"decision": "approve", "args_hash": "0" * 64})
    assert r.status_code == 409 and r.json()["code"] == "APPROVAL_EXPIRED"
    # tampering with the stored arguments after approval was requested also invalidates it
    async with tenant_conn(a.org) as conn:
        await conn.execute(text("update tool_invocations set args = cast(:x as jsonb) where run_id = cast(:r as uuid)"),
                           {"x": '{"name": "Tampered"}', "r": appr["run_id"]})
    r = await client.post(f"/v1/sdk/approvals/{appr['approval_id']}", headers=h, json={"decision": "approve", "args_hash": appr["args_hash"]})
    assert r.status_code == 409
    assert host.calls == []


async def test_rejected_approval_does_nothing(client, tenants, monkeypatch):
    a, _ = tenants
    host = FakeHost()
    monkeypatch.setattr(tools, "call_host", host.call)
    s = await mint(client, a)
    h, events, _ = await ask(client, a, s, "Create a project called Nope")
    appr = next(d for e, d in events if e == "approval.required")
    r = await client.post(f"/v1/sdk/approvals/{appr['approval_id']}", headers=h, json={"decision": "reject", "args_hash": appr["args_hash"]})
    assert "approval.rejected" in [e for e, _ in parse_sse(r.text)]
    assert host.calls == [] and host.projects == []


async def test_viewer_cannot_invite_policy_denied(client, tenants, monkeypatch):
    a, _ = tenants
    host = FakeHost()
    monkeypatch.setattr(tools, "call_host", host.call)
    s = await mint(client, a, role="viewer")
    _, events, _ = await ask(client, a, s, "invite Zed zed@acme.test")
    assert events[-1][0] == "run.failed" and events[-1][1]["code"] == "POLICY_DENIED"
    assert host.calls == []


async def test_cancelled_run_never_reaches_side_effect(client, tenants, monkeypatch):
    a, _ = tenants
    host = FakeHost()
    monkeypatch.setattr(tools, "call_host", host.call)
    s = await mint(client, a)
    h, events, _ = await ask(client, a, s, "Create a project called Cancel Me")
    appr = next(d for e, d in events if e == "approval.required")
    assert (await client.post(f"/v1/runs/{appr['run_id']}/cancel", headers=h)).json()["cancelled"] is True
    r = await client.post(f"/v1/sdk/approvals/{appr['approval_id']}", headers=h, json={"decision": "approve", "args_hash": appr["args_hash"]})
    assert "run.cancelled" in [e for e, _ in parse_sse(r.text)]
    assert host.calls == []


# ---- fallback --------------------------------------------------------------------------------------
async def test_forced_primary_failure_is_served_by_fallback_and_recorded(client, tenants):
    a, _ = tenants
    s = await mint(client, a)
    h = {"Authorization": f"Bearer {s['token']}", "Origin": ORIGIN}
    await client.post("/v1/sdk/context", headers=h, json=CTX)
    r = await client.post("/v1/sdk/messages", headers=h, json={"message": "What is included in the Starter plan?", "options": {"force_primary_failure": True}})
    done = parse_sse(r.text)[-1][1]
    assert done["served_by"]["fallback_used"] is True and done["served_by"]["provider"] == "fake-secondary"
    assert done["citations"]
    async with tenant_conn(a.org) as conn:
        rows = (await conn.execute(text("select provider, status, error_class, fallback_used from model_usage where run_id = cast(:r as uuid) "
                                        "and capability = 'structured.json' order by created_at"), {"r": done["run_id"]})).mappings().all()
    assert any(x["provider"] == "fake" and x["status"] == "failed" and x["error_class"] == "injected_fault" for x in rows)
    assert any(x["provider"] == "fake-secondary" and x["status"] == "ok" and x["fallback_used"] for x in rows)
