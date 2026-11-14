/**
 * Loads the real MV3 extension (apps/extension/dist-e2e, built with `node build.mjs --e2e`) into Chromium and drives
 * it on live third-party sites. Needs the local API on :8000 and E2E_EXT_KEY / E2E_EXT_APP (an sdk:session key for an
 * app that allows this extension's origin; scripts/ext_e2e_setup.py prints both).
 */
import { chromium, expect, test, type BrowserContext, type Page, type Worker } from "@playwright/test";
import path from "node:path";

const EXT = path.resolve(__dirname, "../../apps/extension/dist-e2e");
let ctx: BrowserContext;
let sw: Worker;

test.beforeAll(async () => {
  ctx = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: true,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
    viewport: { width: 1280, height: 800 },
  });
  sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));
  const id = new URL(sw.url()).host;
  console.log("extension origin", `chrome-extension://${id}`);
  expect(process.env.E2E_EXT_KEY, "set E2E_EXT_KEY").toBeTruthy();
  await sw.evaluate(
    async ([apiKey, appId]) => {
      await chrome.storage.local.set({ config: { apiUrl: "http://localhost:8000", appId, apiKey, role: "viewer" } });
    },
    [process.env.E2E_EXT_KEY!, process.env.E2E_EXT_APP ?? "app_demo"],
  );
});

test.afterAll(async () => ctx?.close());

/** What the popup's "Enable on this site" does once the user grants the origin. */
async function enable(origin: string) {
  await sw.evaluate(async (o) => {
    const id = `vistra_${o.replace(/[^a-z0-9]/gi, "_")}`;
    await chrome.storage.local.set({ enabled: [o] });
    const ex = await chrome.scripting.getRegisteredContentScripts({ ids: [id] });
    if (!ex.length) await chrome.scripting.registerContentScripts([{ id, matches: [`${o}/*`], js: ["content.js"], runAt: "document_idle" }]);
  }, origin);
}

const panel = (p: Page) => p.getByRole("region", { name: "VISTRA assistant" });
async function ask(p: Page, text: string) {
  await panel(p).getByLabel("Message").fill(text);
  await panel(p).getByRole("button", { name: "Send" }).click();
}

test("example.com: extension mounts, explains the page from a real screenshot", async () => {
  await enable("https://example.com");
  const p = await ctx.newPage();
  await p.goto("https://example.com/");
  await p.getByRole("button", { name: "Open VISTRA assistant" }).click();
  await ask(p, "What am I looking at on this page?");
  await expect(panel(p)).toContainText(/Understood from a screenshot|Text-only understanding/, { timeout: 90_000 });
  await expect(panel(p)).toContainText(/example/i);
  console.log("understanding:", (await panel(p).innerText()).match(/Understood from a screenshot|Text-only understanding[^\n]*/)?.[0]);
});

test("quotes.toscrape.com: multi-page guide continues after a full page load", async () => {
  await enable("https://quotes.toscrape.com");
  const p = await ctx.newPage();
  await p.goto("https://quotes.toscrape.com/");
  await p.getByRole("button", { name: "Open VISTRA assistant" }).click();
  await ask(p, "Show me how to log in to this site");
  const tip = p.locator("[data-vistra-cursor-root] .tip.on");
  await expect(tip).toContainText(/login/i, { timeout: 90_000 });
  await p.getByRole("link", { name: "Login" }).click();
  await expect(p).toHaveURL(/\/login/);
  // after the full page load the stored guide resumes and the planner continues on the login page
  await expect(tip).toContainText(/user ?name|password|log ?in/i, { timeout: 120_000 });
  await expect(p.locator("#username")).toHaveValue(""); // guide mode: nothing typed or submitted for the user
});

test("sensitive domains are refused even when a script is registered", async () => {
  await enable("https://accounts.google.com");
  const p = await ctx.newPage();
  await p.goto("https://accounts.google.com/");
  await p.waitForTimeout(4000);
  await expect(p.locator("[data-vistra-widget]")).toHaveCount(0);
});
