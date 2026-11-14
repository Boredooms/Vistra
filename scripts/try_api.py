"""Dev helper: exercise the local API. Reads keys from .env, never prints them."""
import json
import os
import sys
from pathlib import Path

import httpx

for fname in (".env", ".env.local"):
    f = Path(__file__).resolve().parents[1] / fname
    for line in (f.read_text(encoding="utf-8").splitlines() if f.exists() else []):
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            os.environ[k] = v
API = os.environ.get("API", "http://localhost:8000")
ADMIN = {"Authorization": "Bearer " + os.environ["VISTRA_ADMIN_KEY"]}

cmd = sys.argv[1]
if cmd == "search":
    r = httpx.post(f"{API}/v1/knowledge/search", headers=ADMIN, json={"query": sys.argv[2]}, timeout=60)
    print(r.status_code)
    for h in r.json().get("results", []):
        print(f"  sim={h['cos_sim'] and round(h['cos_sim'], 3)} v={h['vector_rank']} f={h['fts_rank']} rrf={round(h['rrf'], 4)} "
              f"pass={h['passes_threshold']} | {h['title']} > {h['section']}")
elif cmd == "chat":
    ses = httpx.post(f"{API}/v1/sdk/sessions", headers={**{"Authorization": "Bearer " + os.environ["VISTRA_API_KEY"]},
                     "Origin": "http://localhost:3001"}, json={"end_user": {"id": "u1", "role": "admin"}}, timeout=30)
    print("session", ses.status_code)
    tok = ses.json()["token"]
    H = {"Authorization": f"Bearer {tok}", "Origin": "http://localhost:3001"}
    ctx = json.loads(sys.argv[3]) if len(sys.argv) > 3 else {"route": "/dashboard", "title": "Dashboard", "known_targets": [
        {"id": "nav.team", "role": "link", "name": "Team", "route": "/dashboard"},
        {"id": "team.invite", "role": "button", "name": "Invite member", "route": "/team"},
        {"id": "invite.name", "role": "textbox", "name": "Name", "route": "/team"}]}
    print("ctx", httpx.post(f"{API}/v1/sdk/context", headers=H, json=ctx).status_code)
    with httpx.stream("POST", f"{API}/v1/sdk/messages", headers=H, json={"message": sys.argv[2], "options": {"force_primary_failure": bool(os.environ.get("FORCE"))}}, timeout=120) as r:
        print("stream", r.status_code, r.headers.get("content-type"))
        ev = ""
        for line in r.iter_lines():
            if line.startswith("event:"):
                ev = line[6:].strip()
            elif line.startswith("data:") and ev != "token":
                print(" ", ev, line[5:][:260])
elif cmd == "page":
    # python scripts/try_api.py page "Explain this page" [screenshot.png]
    import base64
    ses = httpx.post(f"{API}/v1/sdk/sessions", headers={"Authorization": "Bearer " + os.environ["VISTRA_API_KEY"],
                     "Origin": "http://localhost:3001"}, json={"end_user": {"id": "u1", "role": "admin"}}, timeout=30)
    H = {"Authorization": f"Bearer {ses.json()['token']}", "Origin": "http://localhost:3001"}
    ctx = {"route": "/", "url": "https://example.com/", "title": "Example Domain",
           "a11y_summary": "heading: Example Domain\nThis domain is for use in illustrative examples in documents. "
                           "You may use this domain in literature without prior coordination or asking for permission.\nlink: More information...",
           "known_targets": [{"id": "auto:link:more-information", "role": "link", "name": "More information...", "route": "/"}],
           "known_routes": ["https://www.iana.org/domains/example"]}
    if len(sys.argv) > 3:
        ctx["screenshot"] = "data:image/png;base64," + base64.b64encode(Path(sys.argv[3]).read_bytes()).decode()
    c = httpx.post(f"{API}/v1/sdk/context", headers=H, json=ctx, timeout=30)
    print("ctx", c.status_code, c.text[:200])
    with httpx.stream("POST", f"{API}/v1/sdk/messages", headers=H, json={"message": sys.argv[2]}, timeout=120) as r:
        ev = ""
        for line in r.iter_lines():
            if line.startswith("event:"):
                ev = line[6:].strip()
            elif line.startswith("data:") and ev not in ("token",):
                print(" ", ev, line[5:][:400])
elif cmd == "crawl":
    # python scripts/try_api.py crawl https://example.com [depth]
    import time
    kbs = httpx.get(f"{API}/v1/knowledge-bases", headers=ADMIN, timeout=30).json()
    kb = kbs[0]["id"]
    cols = httpx.get(f"{API}/v1/knowledge-bases/{kb}/collections", headers=ADMIN, timeout=30).json()
    col = next((c["id"] for c in cols if c["name"] == "Crawl"), None) or httpx.post(
        f"{API}/v1/knowledge-bases/{kb}/collections", headers=ADMIN, json={"name": "Crawl"}, timeout=30).json()["id"]
    r = httpx.post(f"{API}/v1/knowledge-bases/{kb}/collections/{col}/crawl", headers=ADMIN, timeout=30,
                   json={"url": sys.argv[2], "depth": int(sys.argv[3]) if len(sys.argv) > 3 else 1, "max_pages": 5,
                         "includeScreenshots": True})
    print("start", r.status_code, r.text[:300])
    cid = r.json().get("crawl_id")
    for _ in range(40):
        time.sleep(2)
        s = httpx.get(f"{API}/v1/crawls/{cid}", headers=ADMIN, timeout=30).json()
        if s.get("status") != "running":
            break
    print(json.dumps({k: s.get(k) for k in ("status", "pages", "skipped", "screenshots", "error")}, indent=1)[:2000])
