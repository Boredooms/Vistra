"""Load / stress test against the real local stack (Supabase Tokyo, Upstash, Gemini, NVIDIA). No mocks.

  uv run python ../../scripts/stress.py [--messages 12] [--concurrency 6]

Phases: health, SDK session mints, hybrid search, cross-tenant probes under load, concurrent agent runs.
Exits non-zero if any phase has unexpected failures. Prints latency percentiles per phase.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import statistics
import sys
import time
import uuid
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
    if "=" in line and not line.startswith("#"):
        k, v = line.split("=", 1)
        os.environ.setdefault(k, v)
API, ORIGIN = os.environ.get("API", "http://localhost:8000"), "http://localhost:3001"
SDK_KEY, ADMIN = os.environ["VISTRA_API_KEY"], os.environ["VISTRA_ADMIN_KEY"]
QUESTIONS = ["What is included in the Starter plan?", "How much does the Team plan cost?", "When is an invoice marked Overdue?",
             "What are the API rate limits?", "How do I invite a teammate?", "Can annual plans be refunded?"]


def pct(xs: list[float], p: float) -> float:
    if not xs:
        return 0.0
    s = sorted(xs)
    return s[min(len(s) - 1, int(round(p / 100 * (len(s) - 1))))]


class Phase:
    def __init__(self, name: str) -> None:
        self.name, self.lat, self.codes, self.bad, self.notes = name, [], {}, 0, []

    def add(self, ms: float, code: str, ok: bool) -> None:
        self.lat.append(ms)
        self.codes[code] = self.codes.get(code, 0) + 1
        self.bad += 0 if ok else 1

    def report(self) -> bool:
        ok = self.bad == 0
        print(f"{'PASS' if ok else 'FAIL'}  {self.name:<28} n={len(self.lat):<3} p50={pct(self.lat, 50):7.0f}ms p95={pct(self.lat, 95):7.0f}ms "
              f"max={max(self.lat or [0]):7.0f}ms codes={self.codes}" + (f"  {'; '.join(self.notes[:3])}" if self.notes else ""))
        return ok


async def bounded(n: int, conc: int, fn):
    sem = asyncio.Semaphore(conc)

    async def one(i: int):
        async with sem:
            await fn(i)
    await asyncio.gather(*(one(i) for i in range(n)))


async def main(n_msgs: int, conc: int) -> int:
    limits = httpx.Limits(max_connections=50)
    async with httpx.AsyncClient(base_url=API, timeout=300, limits=limits) as c:
        phases: list[Phase] = []

        p = Phase("health + readiness"); phases.append(p)

        async def health(i: int):
            t = time.perf_counter()
            r = await c.get("/readyz" if i % 2 else "/healthz")
            p.add((time.perf_counter() - t) * 1000, str(r.status_code), r.status_code == 200)
        await bounded(30, 15, health)

        p2 = Phase("SDK session mint"); phases.append(p2)
        tokens: list[str] = []

        async def mint(i: int):
            t = time.perf_counter()
            r = await c.post("/v1/sdk/sessions", headers={"Authorization": f"Bearer {SDK_KEY}", "Origin": ORIGIN}, json={"end_user": {"id": f"load-{i}", "role": "admin"}})
            p2.add((time.perf_counter() - t) * 1000, str(r.status_code), r.status_code == 201)
            if r.status_code == 201:
                tokens.append(r.json()["token"])
        await bounded(40, 10, mint)

        p3 = Phase("hybrid search"); phases.append(p3)

        async def search(i: int):
            t = time.perf_counter()
            r = await c.post("/v1/knowledge/search", headers={"Authorization": f"Bearer {ADMIN}"}, json={"query": QUESTIONS[i % len(QUESTIONS)]})
            ok = r.status_code == 200 and len(r.json().get("results", [])) > 0
            p3.add((time.perf_counter() - t) * 1000, str(r.status_code), ok)
        await bounded(30, 10, search)

        p4 = Phase("cross-tenant probes (404)"); phases.append(p4)
        tok0 = tokens[0] if tokens else ""

        async def probe(i: int):
            t = time.perf_counter()
            r = await c.get(f"/v1/runs/{uuid.uuid4()}", headers={"Authorization": f"Bearer {tok0}", "Origin": ORIGIN})
            p4.add((time.perf_counter() - t) * 1000, str(r.status_code), r.status_code == 404)
        await bounded(20, 10, probe)

        p5 = Phase("bad origin rejected (403)"); phases.append(p5)

        async def bad_origin(i: int):
            t = time.perf_counter()
            r = await c.post("/v1/sdk/sessions", headers={"Authorization": f"Bearer {SDK_KEY}", "Origin": f"https://evil-{i}.example"}, json={})
            p5.add((time.perf_counter() - t) * 1000, str(r.status_code), r.status_code == 403 and r.json().get("code") == "ORIGIN_NOT_ALLOWED")
        await bounded(10, 10, bad_origin)

        p6 = Phase("concurrent agent runs"); phases.append(p6)
        first_tok: list[float] = []
        served: dict[str, int] = {}

        async def run(i: int):
            tok = tokens[i % len(tokens)]
            h = {"Authorization": f"Bearer {tok}", "Origin": ORIGIN}
            t = time.perf_counter()
            final, ft = None, None
            async with c.stream("POST", "/v1/sdk/messages", headers=h, json={"message": QUESTIONS[i % len(QUESTIONS)]}) as r:
                if r.status_code != 200:
                    p6.add((time.perf_counter() - t) * 1000, str(r.status_code), False)
                    return
                ev = ""
                async for line in r.aiter_lines():
                    if line.startswith("event:"):
                        ev = line[6:].strip()
                        if ev == "token" and ft is None:
                            ft = (time.perf_counter() - t) * 1000
                    elif line.startswith("data:") and ev in ("run.completed", "run.failed"):
                        final = (ev, json.loads(line[5:]))
            total = (time.perf_counter() - t) * 1000
            if ft:
                first_tok.append(ft)
            if final is None:
                p6.add(total, "no-final-event", False)
                return
            ev, d = final
            prov = (d.get("served_by") or {}).get("provider") or "none"
            served[prov] = served.get(prov, 0) + 1
            ok = ev == "run.completed"
            p6.add(total, ev if ok else d.get("code", "failed"), ok)
            if not ok:
                p6.notes.append(f"{d.get('code')}: {str(d.get('detail'))[:80]}")
        await bounded(n_msgs, conc, run)

        print(f"\nVISTRA stress test against {API}\n")
        results = [ph.report() for ph in phases]
        print(f"\nagent runs: first token p50={pct(first_tok, 50):.0f}ms p95={pct(first_tok, 95):.0f}ms | served by {served}")
        return 0 if all(results) else 1


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--messages", type=int, default=12)
    ap.add_argument("--concurrency", type=int, default=6)
    a = ap.parse_args()
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    sys.exit(asyncio.run(main(a.messages, a.concurrency)))
