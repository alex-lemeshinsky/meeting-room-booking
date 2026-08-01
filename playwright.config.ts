import { defineConfig } from "@playwright/test";
import { E2E_NOW_ISO } from "./e2e/support/e2e-clock";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  // Every spec uses the same deterministic seed database and may mutate it.
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  projects: [
    {
      name: "default",
      testIgnore: /stage-7-email-verification\.spec\.ts/
    },
    {
      name: "stage-7-email-verification",
      retries: 0,
      testMatch: /stage-7-email-verification\.spec\.ts/
    }
  ],
  reporter: process.env.CI ? [["html", { open: "never" }], ["list"]] : "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-first-failure"
  },
  webServer: [
    {
      command: "pnpm --filter @mrb/api exec tsx scripts/start-e2e.ts",
      url: "http://127.0.0.1:3001/api/v1/health/ready",
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        MRB_SEED_NOW: E2E_NOW_ISO
      }
    },
    {
      command: "pnpm --filter @mrb/web dev",
      url: "http://127.0.0.1:3000",
      reuseExistingServer: false,
      env: {
        API_INTERNAL_URL: "http://127.0.0.1:3001"
      }
    }
  ]
});
