"""Durability check for the LangGraph approval interrupt.

  phase 1:  python durable_approval.py propose "Create a project called X"   -> saves approval to .durable.json
  (restart the API process)
  phase 2:  python durable_approval.py approve                              -> resumes from the Postgres checkpoint
"""
import json
import os
import sys
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
    if "=" in line and not line.startswith("#"):
        k, v = line.split("=", 1)
        os.environ[k] = v
API, ORIGIN, STATE = os.environ.get("API", "http://localhost:8000"), "http://localhost:3001", ROOT / ".durable.json"


def stream(path: str, token: str, body: dict) -> list[tuple[str, dict]]:
    out, ev = [], ""
    with httpx.stream("POST", f"{API}{path}", headers={"Authorization": f"Bearer {token}", "Origin": ORIGIN}, json=body, timeout=180) as r:
        print(path, r.status_code)
        if r.status_code >= 400:
            print(r.read().decode()[:300])
            return out
        for line in r.iter_lines():
            if line.startswith("event:"):
                ev = line[6:].strip()
            elif line.startswith("data:") and ev != "token":
                d = json.loads(line[5:])
                out.append((ev, d))
                print("  ", ev, json.dumps({k: v for k, v in d.items() if k not in ("served_by", "traces", "run_id")})[:200])
    return out


if sys.argv[1] == "propose":
    s = httpx.post(f"{API}/v1/sdk/sessions", headers={"Authorization": "Bearer " + os.environ["VISTRA_API_KEY"], "Origin": ORIGIN},
                   json={"end_user": {"id": "u1", "role": "admin"}}, timeout=60).json()
    evs = stream("/v1/sdk/messages", s["token"], {"message": sys.argv[2]})
    a = next(d for e, d in evs if e == "approval.required")
    STATE.write_text(json.dumps({"token": s["token"], "approval": a}))
    print("saved approval", a["approval_id"], "run", a["run_id"])
else:
    st = json.loads(STATE.read_text())
    a = st["approval"]
    evs = stream(f"/v1/sdk/approvals/{a['approval_id']}", st["token"], {"decision": "approve", "args_hash": a["args_hash"]})
    steps = httpx.get(f"{API}/v1/runs/{a['run_id']}/steps", headers={"Authorization": f"Bearer {st['token']}", "Origin": ORIGIN}, timeout=60).json()
    print("steps:", [(x["kind"], x["status"]) for x in steps])
    if any(e == "run.completed" for e, _ in evs):
        STATE.unlink()
