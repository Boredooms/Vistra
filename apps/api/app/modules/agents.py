"""Agent management (doc 23: /v1/applications/{app}/agents, /v1/agents/{id}, versions, publish) + playground sessions."""
from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import text

from app.agent import config as agents
from app.core.config import get_settings
from app.core.db import tenant_conn
from app.core.errors import origin_not_allowed
from app.core.security import SDK_TOKEN_TTL, ApiKeyPrincipal, current_api_key, mint_sdk_token
from app.runtime import store

router = APIRouter(prefix="/v1", tags=["agents"])


class StatusIn(BaseModel):
    status: Literal["published", "paused"]


@router.get("/applications/{application_id}/agents")
async def list_agents(application_id: str, p: ApiKeyPrincipal = Depends(current_api_key)) -> list[dict]:
    p.require("applications:read")
    await agents.ensure_default_agent(p.organization_id, application_id, p.key_id)
    async with tenant_conn(p.organization_id) as conn:
        rows = (await conn.execute(text(
            "select a.id, a.name, a.slug, a.kind, a.status, a.description, a.current_version_id, v.version as current_version, "
            "a.updated_at from agents a left join agent_versions v on v.id = a.current_version_id "
            "where a.application_id = :a and a.organization_id = :o and a.deleted_at is null order by a.created_at"),
            {"a": application_id, "o": p.organization_id})).mappings().all()
    return [{k: (str(v) if k.endswith("id") and v is not None else v) for k, v in dict(r).items()} for r in rows]


@router.get("/agents/{agent_id}")
async def get_agent(agent_id: uuid.UUID, p: ApiKeyPrincipal = Depends(current_api_key)) -> dict:
    return await agents.get_agent(p.organization_id, str(agent_id))


@router.post("/agents/{agent_id}/versions", status_code=201)
async def create_version(agent_id: uuid.UUID, body: agents.AgentVersionIn, publish: bool = False,
                         p: ApiKeyPrincipal = Depends(current_api_key)) -> dict:
    p.require("applications:write")
    return await agents.create_version(p.organization_id, str(agent_id), body, p.key_id, publish)


@router.post("/agents/{agent_id}/versions/{version}/publish")
async def publish(agent_id: uuid.UUID, version: int, p: ApiKeyPrincipal = Depends(current_api_key)) -> dict:
    p.require("applications:write")
    return await agents.publish_version(p.organization_id, str(agent_id), version, p.key_id)


@router.patch("/agents/{agent_id}")
async def patch_agent(agent_id: uuid.UUID, body: StatusIn, p: ApiKeyPrincipal = Depends(current_api_key)) -> dict:
    """Pause/resume. A paused agent falls back to platform defaults (runs keep working, config is not applied)."""
    p.require("applications:write")
    await agents.set_status(p.organization_id, str(agent_id), body.status, p.key_id)
    return await agents.get_agent(p.organization_id, str(agent_id))


@router.post("/applications/{application_id}/playground-session", status_code=201)
async def playground_session(application_id: str, request: Request, p: ApiKeyPrincipal = Depends(current_api_key)) -> dict:
    """Short-lived SDK session so an operator can talk to their own agent from the dashboard.
    Allowed only from the dashboard origin (CORS allowlist), never from arbitrary sites."""
    p.require("applications:write")
    origin = (request.headers.get("origin") or "").rstrip("/").lower()
    if not origin or origin not in [o.lower() for o in get_settings().cors_origins]:
        raise origin_not_allowed("Playground sessions can only be started from the VISTRA dashboard")
    await agents.ensure_default_agent(p.organization_id, application_id, p.key_id)
    async with tenant_conn(p.organization_id) as conn:
        sid = (await conn.execute(text(
            "insert into application_sessions (organization_id, application_id, end_user_id, end_user_role, origin, expires_at) "
            "values (:o, :a, :u, 'admin', :g, :e) returning id"),
            {"o": p.organization_id, "a": application_id, "u": p.key_id, "g": origin, "e": datetime.now(UTC) + timedelta(hours=2)})).scalar_one()
    await store.create_conversation(p.organization_id, application_id, str(sid))
    return {"session_id": str(sid), "token": mint_sdk_token(application_id, p.organization_id, str(sid)), "token_ttl": SDK_TOKEN_TTL}
