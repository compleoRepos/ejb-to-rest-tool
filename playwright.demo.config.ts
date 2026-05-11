import { defineConfig, devices } from "@playwright/test";
import path from "path";

/**
 * COMPLEO v13.5 — Playwright Demo Dry-Run Configuration
 * 
 * Configuration dédiée au test de validation bout-en-bout métier.
 * LLM réel, Maven réel, pipeline réel — aucun mock.
 * Timeout long (30 min), 1 worker séquentiel, captures systématiques.
 */
export default defineConfig({
  testDir: "./tests/e2e/scenarios",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0, // Pas de retry — on veut voir le premier échec
  workers: 1, // Séquentiel — pas de contention LLM
  timeout: 30 * 60 * 1000, // 30 minutes
  expect: {
    timeout: 30_000, // 30s pour les assertions (LLM peut être lent)
  },
  reporter: [
    ["html", { open: "never", outputFolder: "tests/e2e/output/playwright-report" }],
    [path.resolve("tests/e2e/reporters/DemoValidationReporter.ts")],
  ],
  use: {
    baseURL: "http://localhost:3000",
    trace: "on",
    screenshot: "on", // Capture à chaque étape
    video: "retain-on-failure",
    actionTimeout: 60_000, // 60s par action (LLM lent)
    navigationTimeout: 60_000,
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    {
      name: "chromium-desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
  webServer: {
    command: "pnpm dev",
    port: 3000,
    timeout: 60_000,
    reuseExistingServer: true, // Réutiliser le serveur déjà lancé
  },
  outputDir: "tests/e2e/output/test-results",
});
