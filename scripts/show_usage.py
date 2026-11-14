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
r = httpx.get(os.environ.get("API", "http://localhost:8000") + f"/v1/runs/{sys.argv[1]}",
              headers={"Authorization": "Bearer " + os.environ["VISTRA_ADMIN_KEY"]}, timeout=60).json()
print(r["status"], r["error_code"], r["output"])
for u in r["model_usage"]:
    print(u["provider"], u["model"], u["capability"], u["status"], u["error_class"], u["latency_ms"], "try", u["attempt"], "fb", u["fallback_used"])
