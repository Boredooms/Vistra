"""Dev helper: ask for an action, approve it, print the events. Reads keys from .env, never prints them."""
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
ORIGIN = "http://localhost:3001"
role = sys.argv[2] if len(sys.argv) > 2 else "admin"
decision = sys.argv[3] if len(sys.argv) > 3 else "approve"

ses = httpx.post(f"{API}/v1/sdk/sessions", headers={"Authorization": "Bearer " + os.environ["VISTRA_API_KEY"], "Origin": ORIGIN},
                 json={"end_user": {"id": "u1", "role": role}}, timeout=60).json()
H = {"Authorization": f"Bearer {ses['token']}", "Origin": ORIGIN}


def stream(path: str, body: dict) -> list[tuple[str, dict]]:
    out = []
    with httpx.stream("POST", f"{API}{path}", headers=H, json=body, timeout=180) as r:
        print(path, r.status_code)
        if r.status_code >= 400:
            print(r.read().decode()[:300])
            return out
        ev = ""
        for line in r.iter_lines():
            if line.startswith("event:"):
                ev = line[6:].strip()
            elif line.startswith("data:") and ev != "token":
                d = json.loads(line[5:])
                out.append((ev, d))
                keep = {k: v for k, v in d.items() if k not in ("served_by", "run_id", "traces")}
                print("  ", ev, json.dumps(keep)[:230])
    return out


evs = stream("/v1/sdk/messages", {"message": sys.argv[1]})
appr = next((d for e, d in evs if e == "approval.required"), None)
if appr:
    print(">> decision:", decision)
    stream(f"/v1/sdk/approvals/{appr['approval_id']}", {"decision": decision, "args_hash": appr["args_hash"]})
    run_id = appr["run_id"]
else:
    run_id = next((d["run_id"] for e, d in evs if "run_id" in d), None)
if run_id:
    steps = httpx.get(f"{API}/v1/runs/{run_id}/steps", headers=H, timeout=60).json()
    print("steps:", [(s["kind"], s["status"]) for s in steps])
    print("run:", run_id)
