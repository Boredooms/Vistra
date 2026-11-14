// Real end-to-end browser pass over the website + Clerk-authenticated dashboard. No mocks.
// Signs in with a Clerk sign-in token (backend API, dev instance), then drives every dashboard page.
// Usage: node tests/e2e/dashboard-flow.mjs   (API :8000 and web :3000 running)
import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";

const env = Object.fromEntries(readFileSync(".env", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const BASE = process.env.BASE ?? "http://localhost:3000";
const API = process.env.API ?? "http://localhost:8000";
const OUT = "test-results/dashboard";
mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -- " + detail : ""}`); };

async function clerk(path, body) {
  const r = await fetch(`https://api.clerk.com/v1${path}`, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${env.CLERK_SECRET_KEY}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return r.json();
}

const [user] = await clerk(`/users?email_address=${encodeURIComponent("vistra-e2e+clerk_test@example.com")}`);
const ticket = (await clerk("/sign_in_tokens", { user_id: user.id, expires_in_seconds: 600 })).token;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`${page.url()} pageerror ${e.message.slice(0, 160)}`));
page.on("console", (m) => { if (m.type() === "error" && !/clerk\.com|protect\.clerk|ERR_NAME_NOT_RESOLVED|favicon/.test(m.text())) errors.push(`${page.url()} console ${m.text().slice(0, 160)}`); });

// ---- marketing pages ------------------------------------------------------------------------------
for (const path of ["/", "/features", "/packages", "/security", "/docs"]) {
  const t0 = Date.now();
  const res = await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForTimeout(800);
  const h1 = (await page.locator("h1").first().getAttribute("aria-label")) ?? (await page.locator("h1").first().textContent());
  check(`page ${path}`, res?.status() === 200 && !!h1, `${res?.status()} "${(h1 ?? "").trim().slice(0, 50)}" ${Date.now() - t0}ms`);
  await page.screenshot({ path: `${OUT}/site${path === "/" ? "-home" : path.replace(/\//g, "-")}.png` });
}

// ---- sign in --------------------------------------------------------------------------------------
await page.goto(`${BASE}/sign-in?__clerk_ticket=${ticket}`, { waitUntil: "domcontentloaded" });
await page.waitForURL(/\/dashboard/, { timeout: 60000 }).catch(() => undefined);
if (!page.url().includes("/dashboard")) await page.goto(`${BASE}/dashboard`);
check("clerk sign-in via ticket lands on dashboard", page.url().includes("/dashboard"), page.url());
await page.locator("h1", { hasText: "Overview" }).waitFor({ timeout: 60000 });
await page.getByText("Runs over time").waitFor({ timeout: 60000 }).catch(() => undefined);
check("overview renders charts", await page.getByText("Runs over time").isVisible().catch(() => false));
await page.screenshot({ path: `${OUT}/overview.png` });

// ---- every page renders its title ----------------------------------------------------------------
for (const [path, title] of [["/dashboard/analytics", "Analytics"], ["/dashboard/agents", "Agents"], ["/dashboard/knowledge", "Knowledge"], ["/dashboard/applications", "Applications"], ["/dashboard/runs", "Runs"], ["/dashboard/logs", "Logs"], ["/dashboard/keys", "API keys"], ["/dashboard/install", "Install"]]) {
  await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
  const ok = await page.locator("h1", { hasText: title }).waitFor({ timeout: 60000 }).then(() => true).catch(() => false);
  await page.waitForTimeout(1500);
  check(`dashboard ${path}`, ok);
  await page.screenshot({ path: `${OUT}${path.replace("/dashboard", "").replace(/\//g, "-") || "-root"}.png`, fullPage: true });
}

// ---- applications: make sure the dashboard origin is allowed (needed for the key test) -----------
await page.goto(`${BASE}/dashboard/applications`);
await page.getByLabel("Add origin").waitFor({ timeout: 60000 });
if (!(await page.getByText("http://localhost:3000", { exact: true }).count())) {
  await page.getByLabel("Add origin").fill("http://localhost:3000");
  await page.getByRole("button", { name: "Add" }).click();
  await page.getByText("http://localhost:3000", { exact: true }).waitFor({ timeout: 30000 });
}
check("origin listed for app", (await page.getByText("http://localhost:3000", { exact: true }).count()) > 0);
const appId = (await page.locator("code").first().textContent())?.trim();

// ---- keys: create, read once, use against the real API -----------------------------------------
await page.goto(`${BASE}/dashboard/keys`);
await page.getByRole("button", { name: "Create key" }).first().click();
await page.getByLabel("Name").fill(`e2e ${Date.now() % 100000}`);
await page.getByRole("dialog").getByRole("button", { name: "Create key" }).click();
const keyText = (await page.getByLabel("API key value").textContent({ timeout: 30000 }).catch(async (e) => {
  await page.screenshot({ path: `${OUT}/keys-failure.png` });
  console.log("dialog text:", (await page.getByRole("dialog").innerText().catch(() => "no dialog")).slice(0, 300));
  throw e;
}))?.trim();
check("key shown once", !!keyText && keyText.startsWith("vsk_live_"), keyText ? keyText.slice(0, 16) + "..." : "none");
await page.getByRole("button", { name: "Done" }).click();
const mint = await fetch(`${API}/v1/sdk/sessions`, { method: "POST", headers: { Authorization: `Bearer ${keyText}`, "Content-Type": "application/json", Origin: "http://localhost:3000" }, body: "{}" });
check("new key mints an SDK session", mint.status === 201, `HTTP ${mint.status}`);

// ---- knowledge: add a source through the UI and wait for the worker ------------------------------
await page.goto(`${BASE}/dashboard/knowledge`);
await page.getByRole("button", { name: "Add source" }).first().click();
await page.getByLabel("Title").fill("E2E Refund policy");
await page.getByLabel("Content").fill("# Refund policy\n\n## Annual plans\n\nAnnual plans can be refunded in full within 30 days of purchase.\n");
await page.getByRole("button", { name: "Index" }).click();
const indexed = await page.getByText("succeeded").first().waitFor({ timeout: 90000 }).then(() => true).catch(() => false);
check("knowledge source indexed via Redis worker", indexed);

// ---- agents: publish a new version, then talk to it --------------------------------------------
await page.goto(`${BASE}/dashboard/agents`);
await page.getByLabel("Agent instructions").waitFor({ timeout: 60000 });
await page.getByLabel("Agent instructions").fill(`Answer in at most two sentences. (e2e ${Date.now() % 100000})`);
await page.getByLabel("Evidence strictness").getByRole("radio", { name: "Lenient" }).click();
await page.getByRole("button", { name: "Save and publish" }).click();
const published = await page.getByText(/Version \d+ is live/).waitFor({ timeout: 30000 }).then(() => true).catch(() => false);
check("agent version published from editor", published);
await page.getByLabel("Message the agent").fill("How long do I have to get a refund on an annual plan?");
await page.getByRole("button", { name: "Send" }).click();
const answered = await page.waitForFunction(() => {
  const t = document.querySelector("[aria-live=polite]")?.textContent ?? "";
  return /agent v\d+/.test(t) && !t.includes("Working...");
}, null, { timeout: 240000 }).then(() => true).catch(() => false);
const pgText = await page.locator("[aria-live=polite]").first().innerText();
check("playground answer from published version", answered && /30 days|refund/i.test(pgText), pgText.replace(/\s+/g, " ").slice(0, 160));
await page.screenshot({ path: `${OUT}/agents-after.png`, fullPage: true });

// ---- logs show the run's events ------------------------------------------------------------------
await page.goto(`${BASE}/dashboard/logs`);
const ev = await page.getByText("run.completed").first().waitFor({ timeout: 60000 }).then(() => true).catch(() => false);
check("logs stream contains run.completed", ev);
await page.getByRole("radio", { name: "Audit trail" }).click();
check("audit trail shows agent.published", await page.getByText("agent.published").first().waitFor({ timeout: 30000 }).then(() => true).catch(() => false));

// ---- export + sidebar collapse + mobile drawer ---------------------------------------------------
await page.goto(`${BASE}/dashboard`);
await page.getByRole("button", { name: "Export" }).and(page.locator(":not([disabled])")).waitFor({ timeout: 60000 });
const [download] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }).catch(() => null), page.getByRole("button", { name: "Export" }).click()]);
check("export downloads runs CSV", !!download, download?.suggestedFilename() ?? "");
await page.getByRole("button", { name: "Collapse sidebar" }).click();
await page.waitForTimeout(400);
const railW = await page.locator("aside").first().evaluate((el) => el.getBoundingClientRect().width);
check("sidebar collapses to icon rail", railW < 90, `${Math.round(railW)}px`);
await page.getByRole("button", { name: "Expand sidebar" }).click();
await page.getByRole("button", { name: "Build" }).click();
await page.waitForTimeout(350);
check("nav section collapses", (await page.getByRole("button", { name: "Build" }).getAttribute("aria-expanded")) === "false");
await page.getByRole("button", { name: "Build" }).click();
await page.setViewportSize({ width: 390, height: 844 });
await page.getByRole("button", { name: "Open navigation" }).click();
check("mobile drawer opens", await page.getByRole("dialog", { name: "Navigation" }).isVisible());
await page.screenshot({ path: `${OUT}/mobile-drawer.png` });
await page.getByRole("dialog", { name: "Navigation" }).getByRole("link", { name: "Runs" }).click();
await page.locator("h1", { hasText: "Runs" }).waitFor({ timeout: 30000 });
check("mobile nav navigates and closes drawer", !(await page.getByRole("dialog", { name: "Navigation" }).count()));
await page.screenshot({ path: `${OUT}/mobile-runs.png` });

check("no page/console errors", errors.length === 0, errors.slice(0, 5).join(" | "));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed (app ${appId})`);
process.exit(failed.length ? 1 : 0);
