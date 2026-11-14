"""API-key auth, SDK session tokens, tool-call signing."""
from __future__ import annotations

import hashlib
import hmac
import json
import secrets
import time
from dataclasses import dataclass, field

import jwt
from fastapi import Header, Request
from sqlalchemy import text

from app.core.config import get_settings
from app.core.db import privileged_conn, tenant_conn
from app.core.errors import ProblemError, auth_invalid, forbidden, session_expired, session_revoked
from app.core.logging import actor_var, org_id_var

SDK_TOKEN_TTL = 900
KEY_PREFIX = "vsk_live_"


def hash_key(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def new_api_key() -> tuple[str, str, str]:
    raw = KEY_PREFIX + secrets.token_urlsafe(32)
    return raw, raw[:16], hash_key(raw)


def _sdk_key() -> bytes:
    secret = get_settings().tool_signing_secret
    if not secret:
        raise ProblemError("INTERNAL_ERROR", 500, "Server misconfigured", "TOOL_SIGNING_SECRET is not set")
    # Derived sub-key: the SDK-token key is never the raw tool-signing secret.
    return hmac.new(secret.encode(), b"vistra-sdk-token-v1", hashlib.sha256).digest()


def mint_sdk_token(app_id: str, org_id: str, session_id: str, now: int | None = None, ttl: int = SDK_TOKEN_TTL) -> str:
    now = now if now is not None else int(time.time())
    return jwt.encode(
        {"aud": "sdk", "app_id": app_id, "org_id": org_id, "session_id": session_id, "iat": now, "exp": now + ttl},
        _sdk_key(), algorithm="HS256",
    )


def decode_sdk_token(token: str) -> dict:
    try:
        return jwt.decode(token, _sdk_key(), algorithms=["HS256"], audience="sdk",
                          options={"require": ["exp", "aud", "session_id", "org_id", "app_id"]})
    except jwt.ExpiredSignatureError as e:
        raise session_expired() from e
    except jwt.InvalidAudienceError as e:
        raise auth_invalid("Token audience is not 'sdk'") from e
    except jwt.PyJWTError as e:
        raise auth_invalid("Invalid token") from e


@dataclass
class ApiKeyPrincipal:
    organization_id: str
    application_id: str
    key_id: str
    scopes: list[str] = field(default_factory=list)

    def require(self, scope: str) -> None:
        if scope not in self.scopes and "*" not in self.scopes:
            raise forbidden(f"API key lacks scope '{scope}'")


@dataclass
class SdkPrincipal:
    organization_id: str
    application_id: str
    session_id: str  # application_sessions.id
    end_user_id: str | None
    end_user_role: str
    origin: str | None


@dataclass
class Principal:
    """Either an API key or an SDK session, both resolved to an organization scope."""
    organization_id: str
    application_id: str
    api_key: ApiKeyPrincipal | None = None
    sdk: SdkPrincipal | None = None


def _bearer(authorization: str | None) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise auth_invalid("Missing bearer credential")
    return authorization[7:].strip()


async def authenticate_api_key(raw: str) -> ApiKeyPrincipal:
    digest = hash_key(raw)
    async with privileged_conn() as conn:  # pre-auth lookup, justified in doc 19
        row = (await conn.execute(
            text("select id, organization_id, application_id, scopes, key_hash, revoked_at from api_keys where key_hash = :h"),
            {"h": digest})).mappings().first()
        if row is not None:
            await conn.execute(text("update api_keys set last_used_at = now() where id = :i"), {"i": row["id"]})
    # constant-time compare even though the lookup is by hash (defense in depth)
    if row is None or not hmac.compare_digest(row["key_hash"], digest) or row["revoked_at"] is not None:
        raise auth_invalid("Unknown or revoked API key")
    return ApiKeyPrincipal(row["organization_id"], row["application_id"], str(row["id"]), list(row["scopes"]))


async def load_sdk_principal(claims: dict) -> SdkPrincipal:
    async with tenant_conn(claims["org_id"]) as conn:
        row = (await conn.execute(
            text("select id, application_id, end_user_id, end_user_role, origin, expires_at, revoked_at "
                 "from application_sessions where id = cast(:i as uuid) and application_id = :a"),
            {"i": claims["session_id"], "a": claims["app_id"]})).mappings().first()
    if row is None:
        raise auth_invalid("Unknown session")
    if row["revoked_at"] is not None:
        raise session_revoked()
    return SdkPrincipal(claims["org_id"], row["application_id"], str(row["id"]), row["end_user_id"],
                        row["end_user_role"], row["origin"])


async def current_api_key(
    authorization: str | None = Header(default=None),
    x_vistra_application: str | None = Header(default=None),
) -> ApiKeyPrincipal:
    """Management auth: a VISTRA API key, or a Clerk session token (dashboard users, full scope on their own org)."""
    raw = _bearer(authorization)
    if raw.startswith(KEY_PREFIX):
        p = await authenticate_api_key(raw)
        org_id_var.set(p.organization_id)
        actor_var.set(f"api_key:{p.key_id}")
        return p
    import asyncio

    from app.core.clerk import ensure_tenant, verify_clerk_token

    claims = await asyncio.to_thread(verify_clerk_token, raw)  # JWKS fetch is blocking I/O
    org, app_id = await ensure_tenant(claims["sub"])
    if x_vistra_application and x_vistra_application != app_id:
        async with tenant_conn(org) as conn:
            ok = (await conn.execute(text("select 1 from applications where id = :a and organization_id = :o"),
                                     {"a": x_vistra_application, "o": org})).first()
        if ok is None:
            raise ProblemError("NOT_FOUND", 404, "Not found", "Application not found")
        app_id = x_vistra_application
    org_id_var.set(org)
    actor_var.set(f"user:{claims['sub']}")
    return ApiKeyPrincipal(org, app_id, f"user:{claims['sub']}", ["*"])

async def current_sdk(request: Request, authorization: str | None = Header(default=None)) -> SdkPrincipal:
    raw = _bearer(authorization)
    if raw.startswith(KEY_PREFIX):
        raise auth_invalid("API keys must not be used from the browser; use an SDK session token")
    claims = decode_sdk_token(raw)
    p = await load_sdk_principal(claims)
    origin = request.headers.get("origin")
    if origin and p.origin and origin.rstrip("/") != p.origin.rstrip("/"):
        from app.core.errors import origin_not_allowed
        raise origin_not_allowed("Origin does not match the session origin")
    org_id_var.set(p.organization_id)
    actor_var.set(f"sdk_session:{p.session_id}")
    return p


def _is_clerk_jwt(raw: str) -> bool:
    """SDK tokens are HS256 (ours); Clerk session tokens are RS256 with a kid."""
    try:
        h = jwt.get_unverified_header(raw)
    except jwt.PyJWTError:
        return False
    return h.get("alg") == "RS256"


async def current_principal(request: Request, authorization: str | None = Header(default=None),
                            x_vistra_application: str | None = Header(default=None)) -> Principal:
    """API key, Clerk dashboard session, or SDK session token."""
    raw = _bearer(authorization)
    if raw.startswith(KEY_PREFIX) or _is_clerk_jwt(raw):
        k = await current_api_key(authorization, x_vistra_application)
        return Principal(k.organization_id, k.application_id, api_key=k)
    s = await current_sdk(request, authorization)
    return Principal(s.organization_id, s.application_id, sdk=s)


# ---- tool-call signing (host application verifies with the same secret) -----------------------------
def canonical(payload: dict) -> bytes:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def sign_tool_call(tool: str, args: dict, run_id: str, ts: int, secret: str | None = None) -> str:
    key = (secret or get_settings().tool_signing_secret).encode()
    return hmac.new(key, canonical({"tool": tool, "args": args, "run_id": run_id, "ts": ts}), hashlib.sha256).hexdigest()


def args_hash(args: dict) -> str:
    return hashlib.sha256(canonical(args)).hexdigest()
