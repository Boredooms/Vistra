"""SSRF-safe URL fetch: DNS resolved and checked, redirects re-checked, size/redirect caps."""
from __future__ import annotations

import asyncio
import ipaddress
import socket
from urllib.parse import urljoin, urlsplit

import httpx

from app.core.errors import validation_error

MAX_BYTES = 2_000_000
MAX_REDIRECTS = 3


_NAT64 = ipaddress.ip_network("64:ff9b::/96")


def _blocked(ip: str) -> bool:
    a = ipaddress.ip_address(ip.split("%")[0])
    if isinstance(a, ipaddress.IPv6Address):
        # IPv4 embedded in IPv6 (mapped or NAT64 well-known prefix): the IPv4 address decides
        if a.ipv4_mapped is not None:
            a = a.ipv4_mapped
        elif a in _NAT64:
            a = ipaddress.IPv4Address(int(a) & 0xFFFFFFFF)
    return (a.is_private or a.is_loopback or a.is_link_local or a.is_multicast or a.is_reserved
            or a.is_unspecified or ip.startswith("169.254."))


async def assert_public_url(url: str) -> None:
    u = urlsplit(url)
    if u.scheme not in ("http", "https") or not u.hostname:
        raise validation_error("Only http(s) URLs are allowed")
    loop = asyncio.get_running_loop()
    try:
        infos = await loop.getaddrinfo(u.hostname, u.port or (443 if u.scheme == "https" else 80), type=socket.SOCK_STREAM)
    except socket.gaierror as e:
        raise validation_error("URL host could not be resolved") from e
    for info in infos:
        if _blocked(info[4][0]):
            raise validation_error("URL resolves to a non-public address")


USER_AGENT = "VistraIngest/0.1"


async def fetch_url(url: str) -> tuple[str, str]:
    """-> (body text, content_type). Redirects are followed manually so every hop is re-validated."""
    body, ctype, _, _ = await fetch_page(url)
    return body, ctype


async def fetch_page(url: str) -> tuple[str, str, dict[str, str], str]:
    """-> (body text, content_type, response headers, final URL after validated redirects)."""
    async with httpx.AsyncClient(timeout=15, follow_redirects=False) as c:
        current = url
        for _ in range(MAX_REDIRECTS + 1):
            await assert_public_url(current)
            async with c.stream("GET", current, headers={"User-Agent": USER_AGENT}) as r:
                if r.status_code in (301, 302, 303, 307, 308) and r.headers.get("location"):
                    current = urljoin(current, r.headers["location"])
                    continue
                if r.status_code >= 400:
                    raise validation_error(f"URL returned status {r.status_code}")
                buf = bytearray()
                async for chunk in r.aiter_bytes():
                    buf.extend(chunk)
                    if len(buf) > MAX_BYTES:
                        raise validation_error("URL content too large")
                ctype = r.headers.get("content-type", "text/html").split(";")[0].strip()
                return (buf.decode(r.encoding or "utf-8", errors="replace"), ctype,
                        {k.lower(): v for k, v in r.headers.items()}, current)
    raise validation_error("Too many redirects")
