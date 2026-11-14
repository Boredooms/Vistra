// Visual check: node tests/e2e/shots.mjs [baseUrl] -> screenshots in $TEMP/vistra-shots
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

const base = process.argv[2] ?? "http://localhost:3001";
const out = path.join(process.env.TEMP ?? "/tmp", "vistra-shots");
mkdirSync(out, { recursive: true });
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1360, height: 860 } });
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
for (const r of (process.argv[3] ?? "/dashboard,/projects,/team,/setup,/billing").split(",")) {
  await p.goto(base + r, { waitUntil: "networkidle" });
  await p.screenshot({ path: path.join(out, r.replace(/\W+/g, "_") + ".png") });
}
await p.goto(base + "/dashboard", { waitUntil: "networkidle" });
await p.getByRole("button", { name: "Open VISTRA assistant" }).click();
await p.waitForTimeout(500);
await p.screenshot({ path: path.join(out, "widget.png") });
console.log(out, errors.length ? errors : "no page errors");
await b.close();
