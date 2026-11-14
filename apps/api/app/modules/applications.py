from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import text

from app.core.db import tenant_conn
from app.core.errors import not_found
from app.core.security import ApiKeyPrincipal, current_api_key, new_api_key

router = APIRouter(prefix="/v1", tags=["applications"])


class ApplicationOut(BaseModel):
    id: str
    name: str
    status: str
    domains: list[str]
    tool_base_url: str | None = None
    has_tool_secret: bool = False
    knowledge_base_id: str | None = None
    collection_id: str | None = None


class CreateKeyIn(BaseModel):
    name: str = Field(default="default", min_length=1, max_length=80)
    scopes: list[str] = Field(default_factory=lambda: ["sdk:session"])


class CreateKeyOut(BaseModel):
    id: str
    key: str  # shown once
    key_prefix: str
    scopes: list[str]


@router.get("/applications", response_model=list[ApplicationOut])
async def list_applications(p: ApiKeyPrincipal = Depends(current_api_key)) -> list[ApplicationOut]:
    async with tenant_conn(p.organization_id) as conn:
        return await _load_apps(conn, p.organization_id, None)


@router.post("/applications/{application_id}/keys", response_model=CreateKeyOut, status_code=201)
async def create_key(application_id: str, body: CreateKeyIn, p: ApiKeyPrincipal = Depends(current_api_key)) -> CreateKeyOut:
    p.require("keys:write")
    raw, prefix, digest = new_api_key()
    async with tenant_conn(p.organization_id) as conn:
        app_row = (await conn.execute(text("select 1 from applications where id = :a and organization_id = :o"),
                                      {"a": application_id, "o": p.organization_id})).first()
        if app_row is None:
            raise not_found("Application")
        kid = (await conn.execute(text(
            "insert into api_keys (organization_id, application_id, name, key_prefix, key_hash, scopes) "
            "values (:o, :a, :n, :p, :h, :s) returning id"),
            {"o": p.organization_id, "a": application_id, "n": body.name, "p": prefix, "h": digest, "s": body.scopes})).scalar_one()
        await conn.execute(text(
            "insert into audit_events (organization_id, actor_type, actor_id, action, resource_type, resource_id) "
            "values (:o, 'api_key', :k, 'api_key.created', 'api_key', :r)"),
            {"o": p.organization_id, "k": p.key_id, "r": str(kid)})
    return CreateKeyOut(id=str(kid), key=raw, key_prefix=prefix, scopes=body.scopes)


# ---- dashboard management --------------------------------------------------------------------------
import re  # noqa: E402
import secrets as _secrets  # noqa: E402
import uuid  # noqa: E402

from app.core.crypto import encrypt  # noqa: E402
from app.core.errors import validation_error  # noqa: E402


async def _load_apps(conn, org: str, app_id: str | None) -> list[ApplicationOut]:
    rows = (await conn.execute(text(
        "select a.id, a.name, a.status, a.tool_base_url, (a.tool_secret_enc is not null) as has_secret, "
        "coalesce((select array_agg(d.origin order by d.created_at) from application_domains d where d.application_id = a.id), '{}') as domains, "
        "(select kb.id from knowledge_bases kb where kb.application_id = a.id order by kb.created_at limit 1) as kb, "
        "(select kc.id from knowledge_collections kc join knowledge_bases kb on kb.id = kc.knowledge_base_id "
        " where kb.application_id = a.id order by kc.created_at limit 1) as col "
        "from applications a where a.organization_id = :o and (cast(:a as text) is null or a.id = :a) order by a.created_at"),
        {"o": org, "a": app_id})).mappings().all()
    return [ApplicationOut(id=r["id"], name=r["name"], status=r["status"], domains=list(r["domains"]), tool_base_url=r["tool_base_url"],
                           has_tool_secret=r["has_secret"], knowledge_base_id=str(r["kb"]) if r["kb"] else None,
                           collection_id=str(r["col"]) if r["col"] else None) for r in rows]


# web origins, plus browser-extension origins (32-char a-p extension id) for the VISTRA extension
_ORIGIN = re.compile(r"^(https?://[A-Za-z0-9.-]+(:\d{1,5})?|chrome-extension://[a-p]{32})$")


def _origin(v: str) -> str:
    v = v.strip().rstrip("/").lower()
    if not _ORIGIN.match(v):
        raise validation_error("Origin must look like https://app.example.com or chrome-extension://<id> (no path)")
    return v


def _tool_url(v: str | None) -> str | None:
    if not v:
        return None
    v = v.strip().rstrip("/")
    if not re.match(r"^https?://[A-Za-z0-9.-]+(:\d{1,5})?(/[A-Za-z0-9._~/-]*)?$", v):
        raise validation_error("tool_base_url must be an http(s) URL")
    return v


class AppCreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    origins: list[str] = Field(default_factory=list, max_length=10)
    tool_base_url: str | None = Field(default=None, max_length=300)


class AppPatchIn(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    tool_base_url: str | None = Field(default=None, max_length=300)


class DomainIn(BaseModel):
    origin: str = Field(min_length=8, max_length=200)


@router.get("/me")
async def me(p: ApiKeyPrincipal = Depends(current_api_key)) -> dict:
    async with tenant_conn(p.organization_id) as conn:
        org = (await conn.execute(text("select id, name, created_at from organizations where id = :o"), {"o": p.organization_id})).mappings().first()
        apps = await _load_apps(conn, p.organization_id, None)
    return {"organization": {"id": org["id"], "name": org["name"]} if org else {"id": p.organization_id},
            "current_application_id": p.application_id, "actor": p.key_id, "applications": [a.model_dump() for a in apps]}


@router.post("/applications", response_model=ApplicationOut, status_code=201)
async def create_application(body: AppCreateIn, p: ApiKeyPrincipal = Depends(current_api_key)) -> ApplicationOut:
    p.require("applications:write")
    origins = [_origin(o) for o in body.origins]
    app_id = "app_" + uuid.uuid4().hex[:12]
    async with tenant_conn(p.organization_id) as conn:
        await conn.execute(text("insert into applications (id, organization_id, name, tool_base_url) values (:a, :o, :n, :u)"),
                           {"a": app_id, "o": p.organization_id, "n": body.name, "u": _tool_url(body.tool_base_url)})
        for o in dict.fromkeys(origins):
            await conn.execute(text("insert into application_domains (organization_id, application_id, origin) values (:o, :a, :g)"),
                               {"o": p.organization_id, "a": app_id, "g": o})
        kb = (await conn.execute(text("insert into knowledge_bases (organization_id, application_id, name) values (:o, :a, 'Docs') returning id"),
                                 {"o": p.organization_id, "a": app_id})).scalar_one()
        await conn.execute(text("insert into knowledge_collections (organization_id, knowledge_base_id, name) values (:o, :k, 'Default')"),
                           {"o": p.organization_id, "k": kb})
        await conn.execute(text("insert into audit_events (organization_id, actor_type, actor_id, action, resource_type, resource_id) "
                                "values (:o, 'user', :u, 'application.created', 'application', :a)"),
                           {"o": p.organization_id, "u": p.key_id, "a": app_id})
        out = (await _load_apps(conn, p.organization_id, app_id))[0]
    from app.agent.config import ensure_default_agent

    await ensure_default_agent(p.organization_id, app_id, p.key_id)
    return out


@router.get("/applications/{application_id}", response_model=ApplicationOut)
async def get_application(application_id: str, p: ApiKeyPrincipal = Depends(current_api_key)) -> ApplicationOut:
    async with tenant_conn(p.organization_id) as conn:
        found = await _load_apps(conn, p.organization_id, application_id)
    if not found:
        raise not_found("Application")
    return found[0]


@router.patch("/applications/{application_id}", response_model=ApplicationOut)
async def patch_application(application_id: str, body: AppPatchIn, p: ApiKeyPrincipal = Depends(current_api_key)) -> ApplicationOut:
    p.require("applications:write")
    fields = body.model_fields_set
    async with tenant_conn(p.organization_id) as conn:
        if "name" in fields and body.name:
            await conn.execute(text("update applications set name = :n where id = :a and organization_id = :o"),
                               {"n": body.name, "a": application_id, "o": p.organization_id})
        if "tool_base_url" in fields:
            await conn.execute(text("update applications set tool_base_url = :u where id = :a and organization_id = :o"),
                               {"u": _tool_url(body.tool_base_url), "a": application_id, "o": p.organization_id})
        found = await _load_apps(conn, p.organization_id, application_id)
    if not found:
        raise not_found("Application")
    return found[0]


@router.post("/applications/{application_id}/domains", status_code=201)
async def add_domain(application_id: str, body: DomainIn, p: ApiKeyPrincipal = Depends(current_api_key)) -> dict:
    p.require("applications:write")
    origin = _origin(body.origin)
    async with tenant_conn(p.organization_id) as conn:
        if (await conn.execute(text("select 1 from applications where id = :a and organization_id = :o"),
                               {"a": application_id, "o": p.organization_id})).first() is None:
            raise not_found("Application")
        await conn.execute(text("insert into application_domains (organization_id, application_id, origin) values (:o, :a, :g) on conflict do nothing"),
                           {"o": p.organization_id, "a": application_id, "g": origin})
    return {"origin": origin}


@router.delete("/applications/{application_id}/domains", status_code=204)
async def remove_domain(application_id: str, origin: str, p: ApiKeyPrincipal = Depends(current_api_key)) -> None:
    p.require("applications:write")
    async with tenant_conn(p.organization_id) as conn:
        await conn.execute(text("delete from application_domains where application_id = :a and organization_id = :o and lower(origin) = :g"),
                           {"a": application_id, "o": p.organization_id, "g": origin.strip().rstrip("/").lower()})


@router.get("/applications/{application_id}/keys")
async def list_keys(application_id: str, p: ApiKeyPrincipal = Depends(current_api_key)) -> list[dict]:
    async with tenant_conn(p.organization_id) as conn:
        rows = (await conn.execute(text(
            "select id, name, key_prefix, scopes, revoked_at, last_used_at, created_at from api_keys "
            "where application_id = :a and organization_id = :o order by created_at desc"),
            {"a": application_id, "o": p.organization_id})).mappings().all()
    return [{**r, "id": str(r["id"]), "scopes": list(r["scopes"])} for r in rows]


@router.delete("/applications/{application_id}/keys/{key_id}", status_code=204)
async def revoke_key(application_id: str, key_id: uuid.UUID, p: ApiKeyPrincipal = Depends(current_api_key)) -> None:
    p.require("keys:write")
    async with tenant_conn(p.organization_id) as conn:
        n = (await conn.execute(text("update api_keys set revoked_at = now() where id = :k and application_id = :a "
                                     "and organization_id = :o and revoked_at is null"),
                                {"k": key_id, "a": application_id, "o": p.organization_id})).rowcount
        if n:
            await conn.execute(text("insert into audit_events (organization_id, actor_type, actor_id, action, resource_type, resource_id) "
                                    "values (:o, 'user', :u, 'api_key.revoked', 'api_key', :r)"),
                               {"o": p.organization_id, "u": p.key_id, "r": str(key_id)})
    if not n:
        raise not_found("API key")


@router.post("/applications/{application_id}/tool-secret", status_code=201)
async def rotate_tool_secret(application_id: str, p: ApiKeyPrincipal = Depends(current_api_key)) -> dict:
    """Generates a new per-application HMAC secret for signed tool calls. Returned once; stored encrypted."""
    p.require("applications:write")
    secret = "vts_" + _secrets.token_urlsafe(32)
    async with tenant_conn(p.organization_id) as conn:
        n = (await conn.execute(text("update applications set tool_secret_enc = :s where id = :a and organization_id = :o"),
                                {"s": encrypt(secret), "a": application_id, "o": p.organization_id})).rowcount
    if not n:
        raise not_found("Application")
    return {"tool_secret": secret}
