import { defineConfig, devices } from "@playwright/test";

/**
 * COMPLEO v13.4 — Playwright E2E Configuration
 * 3 projets : chromium-desktop, firefox-desktop, mobile-safari (375×667)
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  timeout: 90_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.001, // 0.1% default
    },
  },
  reporter: process.env.CI
    ? [["html", { open: "never" }], ["junit", { outputFile: "test-results/e2e-results.xml" }]]
    : [["html", { open: "on-failure" }]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "chromium-desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "firefox-desktop",
      use: {
        ...devices["Desktop Firefox"],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "mobile-safari",
      use: {
        ...devices["iPhone 13"],
        viewport: { width: 375, height: 667 },
      },
    },
  ],
  webServer: {
    command: "pnpm dev",
    port: 3000,
    timeout: 30_000,
    reuseExistingServer: !process.env.CI,
  },
});
