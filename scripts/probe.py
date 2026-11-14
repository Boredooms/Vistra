"""Connectivity probe: prints only OK/FAIL per dependency, never secret values."""
import asyncio
import os
from pathlib import Path
from urllib.parse import urlsplit, unquote

import asyncpg
import httpx


def load_env() -> None:
    p = Path(__file__).resolve().parents[1] / ".env"
    for line in p.read_text(encoding="utf-8").splitlines():
        if line.strip() and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ[k.strip()] = v.strip()


async def main() -> None:
    load_env()
    u = urlsplit(os.environ["SUPABASE_DB_URL"])
    try:
        c = await asyncpg.connect(
            host=u.hostname, port=u.port, user=unquote(u.username), password=unquote(u.password),
            database=u.path.lstrip("/"), statement_cache_size=0, ssl="require", timeout=20,
        )
        v = await c.fetchval("select version()")
        ext = await c.fetch("select name from pg_available_extensions where name in ('vector','pgcrypto')")
        print("DB OK", v[:30], [r["name"] for r in ext])
        await c.close()
    except Exception as e:  # noqa: BLE001
        print("DB FAIL", type(e).__name__, str(e)[:120])
    try:
        r = httpx.post(
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"{os.environ['GEMINI_MODEL_DEFAULT']}:generateContent",
            headers={"x-goog-api-key": os.environ["GEMINI_API_KEY"]},
            json={"contents": [{"parts": [{"text": "say ok"}]}]}, timeout=30,
        )
        print("GEMINI", r.status_code, r.text[:100].replace("\n", " "))
    except Exception as e:  # noqa: BLE001
        print("GEMINI FAIL", type(e).__name__)
    try:
        r = httpx.post(
            os.environ["NVIDIA_BASE_URL"] + "/chat/completions",
            headers={"Authorization": "Bearer " + os.environ["NVIDIA_API_KEY"]},
            json={"model": os.environ["NVIDIA_MODEL_DEFAULT"], "max_tokens": 5,
                  "messages": [{"role": "user", "content": "say ok"}]}, timeout=40,
        )
        print("NVIDIA", r.status_code, r.text[:100].replace("\n", " "))
    except Exception as e:  # noqa: BLE001
        print("NVIDIA FAIL", type(e).__name__)


asyncio.run(main())
