"""Tool registry, policy engine and signed execution against the host application.

The model proposes; ``decide`` decides; ``call_host`` executes; ``verify_*`` independently re-reads.
"""
from __future__ import annotations

import hashlib
import json
import logging
import time
from dataclasses import dataclass
from typing import Any

import httpx
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import text

from app.core.crypto import decrypt
from app.core.db import tenant_conn
from app.core.errors import ProblemError, tool_args_invalid
from app.core.security import sign_tool_call

log = logging.getLogger("vistra.tools")


class CreateProjectArgs(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class InviteMemberArgs(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    email: str = Field(min_length=3, max_length=200, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    role: str = Field(default="member", pattern=r"^(member|admin)$")


class NoArgs(BaseModel):
    pass


@dataclass(frozen=True)
class ToolDef:
    name: str
    args_model: type[BaseModel]
    side_effect: bool
    policy: str  # allow | require_approval | allow_roles
    roles: frozenset[str] = frozenset()
    verify_with: str | None = None
    description: str = ""


TOOLS: dict[str, ToolDef] = {
    "create_project": ToolDef("create_project", CreateProjectArgs, True, "require_approval", verify_with="list_projects",
                              description="Create a project in the workspace (requires approval)."),
    "invite_member": ToolDef("invite_member", InviteMemberArgs, True, "allow_roles", frozenset({"owner", "admin"}),
                             verify_with="list_members", description="Invite a teammate by email (owner/admin only)."),
    "list_projects": ToolDef("list_projects", NoArgs, False, "allow", description="List workspace projects."),
    "list_members": ToolDef("list_members", NoArgs, False, "allow", description="List workspace members."),
}


def public_tools() -> list[dict[str, Any]]:
    return [{"name": t.name, "side_effect": t.side_effect, "policy": t.policy, "description": t.description} for t in TOOLS.values()]


def validate_args(tool: str, raw: dict[str, Any]) -> dict[str, Any]:
    t = TOOLS[tool]
    try:
        return t.args_model.model_validate(raw).model_dump()
    except ValidationError as e:
        msg = "; ".join(f"{'.'.join(str(p) for p in x['loc'])}: {x['msg']}" for x in e.errors()[:3])
        raise tool_args_invalid(msg) from e


def decide(tool: str, actor_role: str, setting: object | None = None) -> tuple[str, str]:
    """(agent, tool, actor) -> allow | deny | require_approval. Unregistered tools are denied by default.
    `setting` is the agent's per-tool override (enabled + policy); it can tighten or relax registered tools only."""
    t = TOOLS.get(tool)
    if t is None:
        return "deny", f"Tool '{tool}' is not registered"
    if setting is not None:
        if not getattr(setting, "enabled", True):
            return "deny", f"Tool '{tool}' is disabled for this agent"
        pol = getattr(setting, "policy", "default")
        if pol == "deny":
            return "deny", f"Agent policy denies {tool}"
        if pol == "require_approval":
            return "require_approval", "Agent policy requires approval for this tool"
        if pol == "allow" and t.policy != "allow_roles":
            return "allow", "Agent policy allows this tool without approval"
    if t.policy == "require_approval":
        return "require_approval", "Side-effecting tool requires explicit user approval"
    if t.policy == "allow_roles":
        if actor_role in t.roles:
            return "allow", f"Role '{actor_role}' may use {tool}"
        return "deny", f"Role '{actor_role}' may not use {tool}"
    return "allow", "Read-only tool"


def idempotency_key(run_id: str, step: int, tool: str) -> str:
    return hashlib.sha256(f"{run_id}:{step}:{tool}".encode()).hexdigest()


@dataclass(frozen=True)
class HostCfg:
    url: str
    secret: str | None  # per-application signing secret; None => platform secret


async def tool_base_url(org: str, app_id: str) -> HostCfg:
    async with tenant_conn(org) as conn:
        row = (await conn.execute(text("select tool_base_url, tool_secret_enc from applications where id = :a and organization_id = :o"),
                                  {"a": app_id, "o": org})).mappings().first()
    if not row or not row["tool_base_url"]:
        raise ProblemError("CAPABILITY_UNAVAILABLE", 422, "Tools unavailable", "This application has no tool_base_url configured")
    return HostCfg(row["tool_base_url"].rstrip("/"), decrypt(row["tool_secret_enc"]) if row["tool_secret_enc"] else None)


@dataclass
class HostResult:
    ok: bool
    status: int
    data: dict[str, Any]
    error: str | None
    latency_ms: int


async def call_host(base: HostCfg, tool: str, args: dict[str, Any], run_id: str, idem: str) -> HostResult:
    """One signed call. Never retried automatically (side effects)."""
    ts = int(time.time() * 1000)
    sig = sign_tool_call(tool, args, run_id, ts, base.secret)
    body = {"tool": tool, "args": args, "run_id": run_id, "ts": ts, "idempotency_key": idem}
    t0 = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.post(f"{base.url}/api/vistra/tools/{tool}", json=body,
                             headers={"X-Vistra-Signature": sig, "X-Vistra-Timestamp": str(ts), "X-Vistra-Run-Id": run_id,
                                      "Idempotency-Key": idem})
        ms = int((time.perf_counter() - t0) * 1000)
        try:
            data = r.json()
        except json.JSONDecodeError:
            data = {}
        if r.status_code >= 400:
            return HostResult(False, r.status_code, data, str(data.get("error") or f"HTTP {r.status_code}")[:200], ms)
        return HostResult(True, r.status_code, data, None, ms)
    except httpx.HTTPError as e:
        return HostResult(False, 0, {}, f"{type(e).__name__}", int((time.perf_counter() - t0) * 1000))


def verify_present(tool: str, args: dict[str, Any], result: dict[str, Any], listing: dict[str, Any]) -> tuple[bool, str]:
    """Independent state check: the record the tool claims to have created must be in a fresh read."""
    rid = result.get("id")
    if tool == "create_project":
        for p in listing.get("projects", []):
            if p.get("id") == rid and p.get("name") == args["name"]:
                return True, f"project {rid} present in list_projects"
        return False, f"project {rid} not found in list_projects"
    if tool == "invite_member":
        for m in listing.get("members", []):
            if m.get("id") == rid and m.get("email") == args["email"]:
                return True, f"member {rid} present in list_members"
        return False, f"member {rid} not found in list_members"
    return False, "no verifier registered"
