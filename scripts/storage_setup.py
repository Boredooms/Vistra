"""Create the private Supabase Storage bucket (idempotent) and exercise presign -> upload -> complete -> index.
Prints statuses only."""
import os
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
    if "=" in line and not line.startswith("#"):
        k, v = line.split("=", 1)
        os.environ[k] = v
SB, KEY = os.environ["SUPABASE_URL"], os.environ["SUPABASE_SECRET_KEY"]
H = {"Authorization": f"Bearer {KEY}", "apikey": KEY}
r = httpx.post(f"{SB}/storage/v1/bucket", headers=H, json={"id": "documents-original", "name": "documents-original", "public": False,
                                                           "file_size_limit": 10 * 1024 * 1024}, timeout=30)
print("create bucket", r.status_code, r.json().get("message", r.json().get("name", "")) if r.text else "")
b = httpx.get(f"{SB}/storage/v1/bucket/documents-original", headers=H, timeout=30).json()
print("bucket public =", b.get("public"))

API = os.environ.get("API", "http://localhost:8000")
A = {"Authorization": "Bearer " + os.environ["VISTRA_ADMIN_KEY"]}
apps = httpx.get(f"{API}/v1/applications", headers=A, timeout=60).json()
col = next(a["collection_id"] for a in apps if a["id"] == "app_demo")
p = httpx.post(f"{API}/v1/files/presign", headers=A, json={"collection_id": col, "filename": "security-faq.md"}, timeout=60)
print("presign", p.status_code)
pj = p.json()
body = b"# Security FAQ\n\n## Data residency\n\nAcme stores workspace data in the Tokyo region by default.\n"
u = httpx.put(pj["upload_url"], content=body, headers={"Content-Type": "text/markdown", "x-upsert": "true"}, timeout=60)
print("upload", u.status_code)
c = httpx.post(f"{API}/v1/files/{pj['file_id']}/complete", headers=A, json={"collection_id": col, "filename": "security-faq.md"}, timeout=60)
print("complete", c.status_code, c.json().get("execution"))
for _ in range(60):
    j = httpx.get(f"{API}/v1/ingestion-jobs/{c.json()['ingestion_job_id']}", headers=A, timeout=60).json()
    if j["status"] in ("succeeded", "failed"):
        break
    time.sleep(1)
print("job", j["status"], j.get("stats"), j.get("error"))
anon = httpx.get(f"{SB}/storage/v1/object/public/documents-original/{pj['path']}", timeout=30)
print("anonymous public read", anon.status_code, "(must not be 200)")
