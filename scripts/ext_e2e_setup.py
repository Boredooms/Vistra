"""Prepare app_demo for the extension e2e: allow chrome-extension://<id> and create a Browser-extension key.

Usage: uv run python ../../scripts/ext_e2e_setup.py <extension-id> [--revoke <key-id>] [--remove-origin]
Prints E2E_EXT_APP and E2E_EXT_KEY lines for $env: export. Reads the admin key from .env; never prints it.
"""
import os
import sys
from pathlib import Path

import httpx

for line in (Path(__file__).resolve().parents[1] / ".env").read_text(encoding="utf-8").splitlines():
    if "=" in line and not line.startswith("#"):
        k, v = line.split("=", 1)
        os.environ.setdefault(k, v)
API = os.environ.get("API", "http://localhost:8000")
H = {"Authorization": "Bearer " + os.environ["VISTRA_ADMIN_KEY"]}
APP = "app_demo"
ext_id = sys.argv[1]
origin = f"chrome-extension://{ext_id}"

if "--remove-origin" in sys.argv:
    r = httpx.delete(f"{API}/v1/applications/{APP}/domains", params={"origin": origin}, headers=H, timeout=30)
    print("origin removed", r.status_code)
if "--revoke" in sys.argv:
    kid = sys.argv[sys.argv.index("--revoke") + 1]
    r = httpx.delete(f"{API}/v1/applications/{APP}/keys/{kid}", headers=H, timeout=30)
    print("key revoked", r.status_code)
if "--remove-origin" in sys.argv or "--revoke" in sys.argv:
    sys.exit(0)

r = httpx.post(f"{API}/v1/applications/{APP}/domains", json={"origin": origin}, headers=H, timeout=30)
print("# origin", origin, r.status_code if r.status_code != 409 else "already allowed")
k = httpx.post(f"{API}/v1/applications/{APP}/keys", json={"name": "extension e2e", "scopes": ["sdk:session"]}, headers=H, timeout=30)
k.raise_for_status()
body = k.json()
print(f"# key id {body.get('id')}")
print(f"$env:E2E_EXT_APP='{APP}'; $env:E2E_EXT_KEY='{body['key']}'")
