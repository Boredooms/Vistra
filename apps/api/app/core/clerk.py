"""Clerk identity: verify session JWTs (JWKS) and project the user into users/organizations/members.

Each Clerk user gets one VISTRA organization on first sign-in (org id derived from the Clerk user id), with a
default application and knowledge base. A client-supplied organization is never trusted.
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from functools import lru_cache

import httpx
import jwt
from jwt import PyJWKClient
from sqlalchemy import text

from app.core.config import get_settings
from app.core.db import privileged_conn
from app.core.errors import ProblemError, auth_invalid

log = logging.getLogger("vistra.clerk")


@lru_cache
def _jwks() -> PyJWKClient:
    s = get_settings()
    if not s.clerk_jwks_url:
        raise ProblemError("AUTH_UNAVAILABLE", 503, "Auth unavailable", "CLERK_JWKS_URL is not configured")
    return PyJWKClient(s.clerk_jwks_url, cache_keys=True, lifespan=3600)


def verify_clerk_token(token: str) -> dict:
    s = get_settings()
    try:
        key = _jwks().get_signing_key_from_jwt(token).key
        claims = jwt.decode(token, key, algorithms=["RS256"], issuer=s.clerk_issuer or None,
                            options={"require": ["exp", "sub", "iss"], "verify_aud": False}, leeway=30)
    except jwt.ExpiredSignatureError as e:
        raise ProblemError("SESSION_EXPIRED", 401, "Session expired", "Sign in again") from e
    except jwt.InvalidIssuerError as e:
        raise auth_invalid("Token issuer is not this Clerk instance") from e
    except (jwt.PyJWTError, jwt.PyJWKClientError) as e:
        raise auth_invalid("Invalid session token") from e
    except Exception as e:  # noqa: BLE001 - JWKS fetch failures
        raise ProblemError("AUTH_UNAVAILABLE", 503, "Auth unavailable", "Could not reach the identity provider") from e
    azp = claims.get("azp")
    allowed = set(s.cors_origins)
    if azp and allowed and azp.rstrip("/") not in allowed:
        raise auth_invalid("Token authorized party is not an allowed origin")
    return claims


async def _clerk_profile(user_id: str) -> tuple[str | None, str | None]:
    s = get_settings()
    if not s.clerk_secret_key:
        return None, None
    try:
        async with httpx.AsyncClient(timeout=8) as c:
            r = await c.get(f"https://api.clerk.com/v1/users/{user_id}", headers={"Authorization": f"Bearer {s.clerk_secret_key}"})
        if r.status_code != 200:
            return None, None
        d = r.json()
        emails = d.get("email_addresses") or []
        primary = next((e["email_address"] for e in emails if e.get("id") == d.get("primary_email_address_id")), None)
        name = " ".join(x for x in (d.get("first_name"), d.get("last_name")) if x) or d.get("username")
        return primary or (emails[0]["email_address"] if emails else None), name
    except httpx.HTTPError:
        return None, None


_locks: dict[str, asyncio.Lock] = {}


async def ensure_tenant(user_id: str) -> tuple[str, str]:
    """-> (organization_id, default_application_id). Idempotent; creates the org/app/KB on first sign-in."""
    org = "org_" + user_id.removeprefix("user_")
    lock = _locks.setdefault(user_id, asyncio.Lock())
    async with lock:
        async with privileged_conn() as conn:  # privileged path: identity projection (documented in doc 19)
            row = (await conn.execute(text("select a.id from applications a where a.organization_id = :o order by a.created_at limit 1"),
                                      {"o": org})).scalar()
        if row:
            return org, row
        email, name = await _clerk_profile(user_id)
        app_id = "app_" + uuid.uuid4().hex[:12]
        async with privileged_conn() as conn:
            await conn.execute(text("insert into organizations (id, name) values (:o, :n) on conflict do nothing"),
                               {"o": org, "n": (name or email or "My organization")})
            await conn.execute(text("insert into users (id, email, name) values (:u, :e, :n) on conflict (id) do update set email = excluded.email, name = excluded.name"),
                               {"u": user_id, "e": email, "n": name})
            await conn.execute(text("insert into organization_members (organization_id, user_id, role) values (:o, :u, 'owner') on conflict do nothing"),
                               {"o": org, "u": user_id})
            await conn.execute(text("insert into applications (id, organization_id, name) values (:a, :o, 'My first app')"), {"a": app_id, "o": org})
            kb = (await conn.execute(text("insert into knowledge_bases (organization_id, application_id, name) values (:o, :a, 'Docs') returning id"),
                                     {"o": org, "a": app_id})).scalar_one()
            await conn.execute(text("insert into knowledge_collections (organization_id, knowledge_base_id, name) values (:o, :k, 'Default')"),
                               {"o": org, "k": kb})
            await conn.execute(text("insert into audit_events (organization_id, actor_type, actor_id, action, resource_type, resource_id) "
                                    "values (:o, 'user', :u, 'organization.provisioned', 'organization', :o)"), {"o": org, "u": user_id})
        log.info("provisioned organization", extra={"ctx": {"org": org}})
        return org, app_id
