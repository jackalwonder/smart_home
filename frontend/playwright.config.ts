import { defineConfig, devices } from "@playwright/test";
import { DEFAULT_SMOKE_BASE_URL } from "./e2e/support/smokeHelpers";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? DEFAULT_SMOKE_BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  workers: 1,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
