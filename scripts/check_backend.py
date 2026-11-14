"""End-to-end backend check with a real Clerk session (dev instance): dashboard APIs, Redis-queued ingestion,
retrieval, SDK session for the new app. Prints results only."""
import os
import subprocess
import sys
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
    if "=" in line and not line.startswith("#"):
        k, v = line.split("=", 1)
        os.environ[k] = v
API = os.environ.get("API", "http://localhost:8000")
SID = subprocess.run([sys.executable, str(ROOT / "scripts" / "clerk_token.py"), "--session"], capture_output=True, text=True).stdout.strip()
assert SID.startswith("sess_"), "no clerk session"
_tok = {"v": "", "at": 0.0}


class ClerkAuth(httpx.Auth):
    """Refresh the 60 s Clerk session token, as the browser SDK does."""

    def auth_flow(self, request):
        if time.time() - _tok["at"] > 40:
            r = httpx.post(f"https://api.clerk.com/v1/sessions/{SID}/tokens",
                           headers={"Authorization": "Bearer " + os.environ["CLERK_SECRET_KEY"]}, json={}, timeout=30)
            _tok.update(v=r.json()["jwt"], at=time.time())
        request.headers["Authorization"] = "Bearer " + _tok["v"]
        yield request


c = httpx.Client(base_url=API, auth=ClerkAuth(), timeout=120)

me = c.get("/v1/me").json()
print("me:", me["organization"]["id"], "apps", len(me["applications"]))
app = c.post("/v1/applications", json={"name": f"Check {int(time.time())}", "origins": ["http://localhost:3000"]}).json()
print("created app", app["id"], "domains", app["domains"], "collection", bool(app["collection_id"]))
HA = {"X-Vistra-Application": app["id"]}
key = c.post(f"/v1/applications/{app['id']}/keys", json={"name": "server", "scopes": ["sdk:session"]}).json()
print("key prefix", key["key_prefix"], "len", len(key["key"]))
sec = c.post(f"/v1/applications/{app['id']}/tool-secret").json()
print("tool secret issued", sec["tool_secret"][:4] + "...")
doc = "# Refunds\n\n## Annual plans\n\nAnnual plans can be refunded in full within 30 days of purchase.\n"
src = c.post(f"/v1/collections/{app['collection_id']}/sources", headers=HA, json={"source_type": "markdown", "title": "Refunds", "content": doc}).json()
print("source", src["status"], "execution", src["execution"])
for _ in range(60):
    j = c.get(f"/v1/ingestion-jobs/{src['ingestion_job_id']}").json()
    if "stats" not in j:
        print("job poll error", j)
        break
    if j["status"] in ("succeeded", "failed"):
        break
    time.sleep(1)
print("job", j["status"], j["stats"], j["error"])
hits = c.post("/v1/knowledge/search", headers=HA, json={"query": "annual refund window"}).json()["results"]
print("search top", hits[0]["section"] if hits else None, "pass", hits[0]["passes_threshold"] if hits else None)
s = httpx.post(f"{API}/v1/sdk/sessions", headers={"Authorization": f"Bearer {key['key']}", "Origin": "http://localhost:3000"}, json={}, timeout=60)
print("sdk session with new key", s.status_code)
bad = httpx.post(f"{API}/v1/sdk/sessions", headers={"Authorization": f"Bearer {key['key']}", "Origin": "https://evil.example"}, json={}, timeout=60)
print("wrong origin", bad.status_code, bad.json().get("code"))
ts = c.get("/v1/usage/timeseries?days=7").json()
print("timeseries days", len(ts["series"]), "providers", len(ts["providers"]))
runs = c.get("/v1/runs?limit=5").json()
print("runs list ok", isinstance(runs, list))
c.delete(f"/v1/applications/{app['id']}/keys/{key['id']}")
r = httpx.post(f"{API}/v1/sdk/sessions", headers={"Authorization": f"Bearer {key['key']}", "Origin": "http://localhost:3000"}, json={}, timeout=60)
print("revoked key", r.status_code)
