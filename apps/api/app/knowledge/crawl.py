"""Same-host website crawl into a knowledge collection.

Rules: every URL passes the SSRF check (fetch.assert_public_url on every hop), robots.txt is honoured for our
user agent, pages marked noindex (meta robots or X-Robots-Tag) are skipped, at most 1 request/second per host,
sensitive domains are refused, depth = link hops from the start page (1-3), page budget <= 50.
Each crawled page becomes a ``url`` knowledge source with its fetched HTML, then runs the normal ingestion job.
Crawl status lives in Redis for 24 h (in-process fallback); the knowledge itself lives in Postgres.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
import time
import uuid
from urllib.parse import urldefrag, urljoin, urlsplit
from urllib.robotparser import RobotFileParser

import httpx
from redis.exceptions import RedisError

from app.core.errors import ProblemError, validation_error
from app.core.redis import PREFIX, get_redis
from app.knowledge import ingestion
from app.knowledge.fetch import USER_AGENT, assert_public_url, fetch_page

log = logging.getLogger("vistra.crawl")
STATE_TTL = 24 * 3600
MIN_INTERVAL_S = 1.0
SKIP_EXT = re.compile(r"\.(png|jpe?g|gif|webp|svg|ico|pdf|zip|gz|mp4|mp3|woff2?|ttf|css|js|json|xml)$", re.I)
HREF = re.compile(r"""<a\s[^>]*?href\s*=\s*["']([^"'#][^"']*)["']""", re.I)
NOINDEX_META = re.compile(r"""<meta[^>]+name\s*=\s*["']robots["'][^>]*content\s*=\s*["'][^"']*noindex""", re.I)

# Never crawl (or let the extension run on) sites whose pages are personal or financial by nature.
SENSITIVE_HOSTS = ("mail.google.com", "accounts.google.com", "outlook.live.com", "login.microsoftonline.com",
                   "paypal.com", "stripe.com", "chase.com", "bankofamerica.com", "wellsfargo.com", "icloud.com",
                   "1password.com", "lastpass.com", "bitwarden.com", "web.whatsapp.com", "messenger.com")
_local: dict[str, dict] = {}
_tasks: set[asyncio.Task] = set()


def sensitive(host: str) -> bool:
    h = host.lower().rstrip(".")
    return any(h == s or h.endswith("." + s) for s in SENSITIVE_HOSTS) or bool(re.search(r"(^|\.)bank|banking", h))


async def _save(crawl_id: str, state: dict) -> None:
    r = get_redis()
    if r is not None:
        try:
            await r.set(f"{PREFIX}crawl:{crawl_id}", json.dumps(state), ex=STATE_TTL)
            return
        except RedisError:
            pass
    _local[crawl_id] = state


async def get_state(crawl_id: str) -> dict | None:
    r = get_redis()
    if r is not None:
        try:
            raw = await r.get(f"{PREFIX}crawl:{crawl_id}")
            if raw:
                return json.loads(raw)
        except RedisError:
            pass
    return _local.get(crawl_id)


def _links(html: str, base: str, host: str) -> list[str]:
    out = []
    for href in HREF.findall(html):
        u, _ = urldefrag(urljoin(base, href.strip()))
        p = urlsplit(u)
        if p.scheme in ("http", "https") and p.hostname == host and not SKIP_EXT.search(p.path):
            out.append(u.split("?")[0] if len(u) > 300 else u)
    return list(dict.fromkeys(out))


async def start(org: str, collection_id: str, url: str, depth: int, max_pages: int, respect_robots: bool,
                include_screenshots: bool) -> dict:
    host = urlsplit(url).hostname or ""
    if sensitive(host):
        raise validation_error("This domain is on the sensitive-domain blocklist and cannot be crawled")
    await assert_public_url(url)
    crawl_id = str(uuid.uuid4())
    state = {"crawl_id": crawl_id, "organization_id": org, "collection_id": collection_id, "start_url": url, "depth": depth,
             "max_pages": max_pages, "respect_robots": respect_robots, "status": "running", "pages": [], "skipped": [],
             "screenshots": "not_supported_server_side" if include_screenshots else "not_requested",
             "started_at": time.time(), "finished_at": None, "error": None}
    await _save(crawl_id, state)
    t = asyncio.create_task(_run(state))
    _tasks.add(t)
    t.add_done_callback(_tasks.discard)
    return state


async def _robots(origin: str) -> RobotFileParser | None:
    rp = RobotFileParser()
    try:
        body, ctype, _, _ = await fetch_page(origin + "/robots.txt")
        rp.parse(body.splitlines() if "html" not in ctype else [])
    except (ProblemError, httpx.HTTPError):
        rp.parse([])  # no robots.txt (404 etc.): everything allowed
    return rp


async def _run(state: dict) -> None:
    org, start_url = state["organization_id"], state["start_url"]
    sp = urlsplit(start_url)
    host, origin = sp.hostname or "", f"{sp.scheme}://{sp.netloc}"
    try:
        rp = await _robots(origin) if state["respect_robots"] else None
        seen: set[str] = {start_url}
        frontier: list[tuple[str, int]] = [(start_url, 0)]
        last = 0.0
        while frontier and len(state["pages"]) < state["max_pages"]:
            url, d = frontier.pop(0)
            if rp is not None and not rp.can_fetch(USER_AGENT, url):
                state["skipped"].append({"url": url, "reason": "robots.txt"})
                continue
            wait = MIN_INTERVAL_S - (time.monotonic() - last)
            if wait > 0:
                await asyncio.sleep(wait)
            last = time.monotonic()
            try:
                html, ctype, headers, final = await fetch_page(url)
            except (ProblemError, httpx.HTTPError) as e:
                state["skipped"].append({"url": url, "reason": getattr(e, "detail", None) or type(e).__name__})
                continue
            if "html" not in ctype:
                state["skipped"].append({"url": url, "reason": f"content-type {ctype}"})
                continue
            if "noindex" in headers.get("x-robots-tag", "").lower() or NOINDEX_META.search(html[:20000]):
                state["skipped"].append({"url": url, "reason": "noindex"})
                continue
            sid, jid = await ingestion.create_source_and_job(org, state["collection_id"], "url", None, final, html)
            mode = await ingestion.schedule_job(org, jid)
            state["pages"].append({"url": final, "depth": d, "source_id": sid, "ingestion_job_id": jid, "execution": mode})
            if d < state["depth"]:
                for link in _links(html, final, host):
                    if link not in seen:
                        seen.add(link)
                        frontier.append((link, d + 1))
            await _save(state["crawl_id"], state)
        state["status"] = "completed"
    except Exception as e:  # noqa: BLE001
        log.exception("crawl failed")
        state["status"], state["error"] = "failed", f"{type(e).__name__}: {e}"[:300]
    state["finished_at"] = time.time()
    log.info("crawl finished", extra={"ctx": {"crawl_id": state["crawl_id"], "pages": len(state["pages"]),
                                               "skipped": len(state["skipped"]), "status": state["status"]}})
    await _save(state["crawl_id"], state)
