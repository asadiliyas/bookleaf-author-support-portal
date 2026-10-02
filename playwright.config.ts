import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against a running app (local dev server by default):
 *   npm run dev            # in one terminal
 *   npm run test:e2e       # in another (or set E2E_BASE_URL to test a deployment)
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
});
