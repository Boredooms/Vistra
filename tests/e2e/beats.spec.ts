import { expect, test, type Page } from "@playwright/test";

async function openWidget(page: Page) {
  await page.getByRole("button", { name: "Open VISTRA assistant" }).click();
  await expect(page.getByRole("region", { name: "VISTRA assistant" })).toBeVisible();
}

async function ask(page: Page, text: string) {
  await page.getByLabel("Message").fill(text);
  await page.getByRole("button", { name: "Send" }).click();
}

const panel = (page: Page) => page.getByRole("region", { name: "VISTRA assistant" });

test("beat 1: cited answer, chip opens docs at the section", async ({ page }) => {
  await page.goto("/dashboard");
  await openWidget(page);
  await ask(page, "What's included in the Starter plan?");
  const chip = panel(page).locator('a[href^="/docs#acme-workspace-pricing--starter-plan"]').first();
  await expect(chip).toBeVisible();
  await expect(panel(page)).toContainText(/Starter/);
  await chip.click();
  await expect(page).toHaveURL(/\/docs#acme-workspace-pricing--starter-plan/);
  await expect(page.locator("#acme-workspace-pricing--starter-plan")).toBeInViewport();
});

test("beat 2: select the Overdue badge and ask what it means", async ({ page }) => {
  await page.goto("/projects");
  await openWidget(page);
  await panel(page).getByRole("button", { name: "Select element" }).click();
  await page.locator('[role="status"][aria-label="Status: Overdue"]').first().click();
  await expect(panel(page)).toContainText("status");
  await ask(page, "what does this mean?");
  await expect(panel(page)).toContainText(/overdue/i);
  await expect(panel(page)).toContainText(/status/i);
});

test("beat 3: ghost cursor walks Team -> Invite member -> Name", async ({ page }) => {
  await page.goto("/dashboard");
  await openWidget(page);
  await ask(page, "Show me how to invite a teammate");
  const tip = page.locator("[data-vistra-cursor-root] .tip.on");
  await expect(tip).toContainText("Step 1 of");
  await expect(tip).toContainText(/team/i);
  await page.getByRole("link", { name: "Team" }).click();
  // either the original flow's next step, or a re-plan on /team when the planner continued on the next page
  await expect(tip).toContainText(/invite/i);
  await page.getByRole("button", { name: "Invite member" }).click();
  await expect(tip).toContainText(/name/i);
  await page.getByLabel("Name").fill("E2E Person");
  // remaining steps (if the planner added more) are completed with Next; the cursor never submits anything itself
  for (let i = 0; i < 4; i++) {
    const next = page.locator("[data-vistra-cursor-root] .tip.on button[data-act=next]");
    if (await next.count()) await next.click();
  }
  await expect(page.locator("[data-vistra-cursor-root] .tip.on")).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Invite member" })).toBeVisible(); // nothing was submitted by the cursor
});

test("beat 4: approval card, execute, verify, row appears", async ({ page }) => {
  const name = `E2E Project ${Date.now() % 100000}`;
  await page.goto("/projects");
  await openWidget(page);
  await ask(page, `Create a project called ${name}`);
  const card = panel(page).getByRole("group", { name: "Approval required" });
  await expect(card).toBeVisible();
  await expect(card).toContainText(name);
  await card.getByRole("button", { name: "Approve" }).click();
  await expect(panel(page)).toContainText("Verified in the app");
  await expect(page.getByRole("link", { name })).toBeVisible(); // router.refresh() shows the real row
});

test("beat 5: forced primary failure is served by the fallback", async ({ page }) => {
  await page.goto("/dashboard");
  await openWidget(page);
  await panel(page).getByLabel("force primary failure").check();
  await ask(page, "What's included in the Starter plan?");
  await expect(panel(page).getByText("fallback", { exact: true })).toBeVisible();
  await expect(panel(page)).toContainText(/\$12|Starter/);
});

test("beat 6: run page shows the timeline", async ({ page }) => {
  await page.goto("/dashboard");
  await openWidget(page);
  await ask(page, "What's included in the Starter plan?");
  await expect(panel(page).locator("summary").first()).toBeVisible();
  await panel(page).locator("summary").first().click();
  await panel(page).getByRole("link", { name: "View run" }).first().click();
  await expect(page.getByRole("heading", { name: /^Run / })).toBeVisible();
  await expect(page.getByText(/\d\. retrieval/).first()).toBeVisible();
});
