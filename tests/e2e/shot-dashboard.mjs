// Signed-in screenshots of the overview (after data loads) and the agents page.
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(readFileSync(".env", "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const H = { Authorization: `Bearer ${env.CLERK_SECRET_KEY}`, "Content-Type": "application/json" };
const [user] = await (await fetch(`https://api.clerk.com/v1/users?email_address=${encodeURIComponent("vistra-e2e+clerk_test@example.com")}`, { headers: H })).json();
const { token } = await (await fetch("https://api.clerk.com/v1/sign_in_tokens", { method: "POST", headers: H, body: JSON.stringify({ user_id: user.id }) })).json();
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto(`http://localhost:3000/sign-in?__clerk_ticket=${token}`);
await p.waitForURL(/dashboard/, { timeout: 60000 });
await p.getByText("served by primary").waitFor({ timeout: 90000 });
await p.waitForTimeout(1500);
console.log("donut sectors:", await p.locator(".recharts-pie-sector").count());
await p.screenshot({ path: "test-results/dashboard/overview-final.png" });
await p.goto("http://localhost:3000/dashboard/agents");
await p.getByLabel("Agent instructions").waitFor({ timeout: 90000 });
await p.waitForTimeout(800);
await p.screenshot({ path: "test-results/dashboard/agents-final.png" });
await b.close();
