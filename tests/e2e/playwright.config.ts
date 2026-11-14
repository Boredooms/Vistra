import { defineConfig } from "@playwright/test";

// Runs against an already-running stack (local: API :8000 + demo :3001, or E2E_BASE_URL for the deployed demo).
export default defineConfig({
  testDir: ".",
  timeout: 240_000,
  expect: { timeout: 90_000 },
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3001",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
