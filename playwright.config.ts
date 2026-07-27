import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["html", { open: "never" }], ["list"]] : "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-first-failure"
  },
  webServer: [
    {
      command: "pnpm --filter @mrb/api dev",
      url: "http://127.0.0.1:3001/api/v1/health/live",
      reuseExistingServer: !process.env.CI
    },
    {
      command: "pnpm --filter @mrb/web dev",
      url: "http://127.0.0.1:3000",
      reuseExistingServer: !process.env.CI
    }
  ]
});
