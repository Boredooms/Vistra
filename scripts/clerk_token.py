"""Dev helper: create (or reuse) a Clerk test user and mint a session JWT via the Clerk Backend API.
Prints only the token (to stdout) so tests can use it. Dev instances only.
"""
import os
import sys
from pathlib import Path

import httpx

for line in (Path(__file__).resolve().parents[1] / ".env").read_text(encoding="utf-8").splitlines():
    if "=" in line and not line.startswith("#"):
        k, v = line.split("=", 1)
        os.environ[k] = v
H = {"Authorization": "Bearer " + os.environ["CLERK_SECRET_KEY"], "Content-Type": "application/json"}
EMAIL = "vistra-e2e+clerk_test@example.com"
with httpx.Client(base_url="https://api.clerk.com/v1", headers=H, timeout=30) as c:
    r = c.get("/users", params={"email_address": EMAIL})
    users = r.json()
    if not users:
        r = c.post("/users", json={"email_address": [EMAIL], "first_name": "E2E", "last_name": "Tester", "skip_password_requirement": True})
        if r.status_code >= 400:
            print("create user failed", r.status_code, r.text[:300], file=sys.stderr)
            sys.exit(1)
        user = r.json()
    else:
        user = users[0]
    s = c.post("/sessions", json={"user_id": user["id"]})
    if s.status_code >= 400:
        print("create session failed", s.status_code, s.text[:300], file=sys.stderr)
        sys.exit(1)
    sid = s.json()["id"]
    if "--session" in sys.argv:
        print(sid)
        sys.exit(0)
    t = c.post(f"/sessions/{sid}/tokens")
    if t.status_code >= 400:
        print("token failed", t.status_code, t.text[:300], file=sys.stderr)
        sys.exit(1)
    print(t.json()["jwt"])
