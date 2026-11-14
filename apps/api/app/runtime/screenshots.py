"""Ephemeral screenshot store (Redis, 10 minute TTL; in-process fallback). Screenshots never reach Postgres."""
from __future__ import annotations

import base64
import time

from redis.exceptions import RedisError

from app.core.redis import PREFIX, get_redis

TTL_S = 600
MAX_BYTES = 2 * 1024 * 1024
_local: dict[str, tuple[float, str]] = {}


def _key(conversation_id: str) -> str:
    return f"{PREFIX}shot:{conversation_id}"


async def put(conversation_id: str, data_url: str) -> None:
    r = get_redis()
    if r is not None:
        try:
            await r.set(_key(conversation_id), data_url, ex=TTL_S)
            return
        except RedisError:
            pass
    _local[conversation_id] = (time.time() + TTL_S, data_url)


async def get(conversation_id: str) -> tuple[bytes, str] | None:
    """-> (image bytes, mime) or None. Enforces the 2 MB decoded limit."""
    data_url: str | None = None
    r = get_redis()
    if r is not None:
        try:
            data_url = await r.get(_key(conversation_id))
        except RedisError:
            data_url = None
    if data_url is None:
        exp, val = _local.get(conversation_id, (0.0, ""))
        data_url = val if exp > time.time() else None
    if not data_url or "," not in data_url:
        return None
    head, b64 = data_url.split(",", 1)
    mime = head.removeprefix("data:").split(";")[0] or "image/jpeg"
    try:
        raw = base64.b64decode(b64, validate=True)
    except ValueError:
        return None
    return (raw, mime) if len(raw) <= MAX_BYTES else None


async def get_data_url(conversation_id: str) -> str | None:
    """The stored screenshot re-encoded as a validated data URL (what vision providers consume)."""
    got = await get(conversation_id)
    if got is None:
        return None
    raw, mime = got
    return f"data:{mime};base64,{base64.b64encode(raw).decode()}"
