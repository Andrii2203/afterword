import { defineConfig, devices } from "@playwright/test";
import "./scripts/env";

/**
 * End-to-end layer (ADR-0016): a real browser against a built application and
 * live providers. It only runs with RUN_E2E=1 because every run is billable.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run build && npx next start --port 3100",
    url: "http://127.0.0.1:3100",
    timeout: 240_000,
    reuseExistingServer: false,
  },
});
