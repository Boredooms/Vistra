"""Live check: configurable agent versions change real run behaviour, then roll back. Prints results only."""
import json
import os
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
    if "=" in line and not line.startswith("#"):
        k, v = line.split("=", 1)
        os.environ[k] = v
API, ORIGIN = os.environ.get("API", "http://localhost:8000"), "http://localhost:3001"
A = {"Authorization": "Bearer " + os.environ["VISTRA_ADMIN_KEY"]}
c = httpx.Client(base_url=API, headers=A, timeout=180)


def ask(msg: str) -> list[tuple[str, dict]]:
    s = httpx.post(f"{API}/v1/sdk/sessions", headers={"Authorization": "Bearer " + os.environ["VISTRA_API_KEY"], "Origin": ORIGIN},
                   json={"end_user": {"id": "u1", "role": "admin"}}, timeout=60).json()
    out, ev = [], ""
    with httpx.stream("POST", f"{API}/v1/sdk/messages", headers={"Authorization": f"Bearer {s['token']}", "Origin": ORIGIN},
                      json={"message": msg}, timeout=180) as r:
        for line in r.iter_lines():
            if line.startswith("event:"):
                ev = line[6:].strip()
            elif line.startswith("data:") and ev != "token":
                out.append((ev, json.loads(line[5:])))
    return out


agents = c.get("/v1/applications/app_demo/agents").json()
ag = agents[0]
print("agent", ag["name"], "status", ag["status"], "current version", ag["current_version"])
v = c.post(f"/v1/agents/{ag['id']}/versions?publish=true", json={
    "instructions": "Answer in at most two sentences.", "tool_config": {"create_project": {"enabled": True, "policy": "deny"}},
    "retrieval_config": {"top_k": 6, "strictness": "strict"}, "notes": "check: deny create_project"}).json()
print("published version", v["version"])
evs = ask("Create a project called Should Be Denied")
pol = next((d for e, d in evs if e == "policy.decision"), None)
print("policy:", pol and (pol["decision"], pol["reason"]), "| final:", evs[-1][0], evs[-1][1].get("code"))
started = next(d for e, d in evs if e == "run.started")
print("run used agent version", started["agent"]["version"])
bad = c.post(f"/v1/agents/{ag['id']}/versions", json={"tool_config": {"drop_database": {"policy": "allow"}}})
print("unknown tool rejected:", bad.status_code, bad.json().get("code"))
r = c.post(f"/v1/agents/{ag['id']}/versions/1/publish").json()
print("rolled back to version", r["version"])
detail = c.get(f"/v1/agents/{ag['id']}").json()
print("versions:", [(x["version"], x["runs"]) for x in detail["versions"]][:4])
logs = c.get("/v1/audit-events?limit=5").json()
print("audit:", [x["action"] for x in logs])
ev = c.get("/v1/events?limit=5").json()
print("events:", [x["event_type"] for x in ev])
print("breakdown keys:", list(c.get("/v1/usage/breakdown?days=7").json().keys()))
