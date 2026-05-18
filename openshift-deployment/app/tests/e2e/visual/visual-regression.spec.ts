/**
 * Visual Regression Tests — 9 captures d'écran de référence.
 *
 * Compare les screenshots actuels aux golden files dans tests/e2e/visual/golden/.
 * Threshold : 0.2% de pixels différents max.
 */
import { test, expect } from "@playwright/test";
import { setupMockApi } from "../fixtures/test-data";

test.describe("Visual Regression — 9 captures de référence", () => {
  test.beforeEach(async ({ page }) => {
    await setupMockApi(page);
    // Attendre que les fonts soient chargées
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
  });

  test("VR.1 — Dashboard / Page d'accueil", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(800);

    await expect(page).toHaveScreenshot("01-dashboard.png", {
      maxDiffPixelRatio: 0.002,
      fullPage: false,
    });
  });

  test("VR.2 — Compleo — DropZone idle", async ({ page }) => {
    await page.goto("/compleo");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(800);

    await expect(page).toHaveScreenshot("02-compleo-dropzone.png", {
      maxDiffPixelRatio: 0.002,
      fullPage: false,
    });
  });

  test.skip("VR.3 — Compleo — Résultats génération", async ({ page }) => {
    // SKIP: Requires full pipeline mock (upload → SSE analysis → generate)
    await page.goto("/compleo");
    await page.waitForLoadState("networkidle");

    // Upload + Generate
    const fileInput = page.locator("[data-test='file-input']");
    await fileInput.setInputFiles({
      name: "avis-opere.zip",
      mimeType: "application/zip",
      buffer: Buffer.from("PK\x03\x04fake-zip-content"),
    });

    const dropZone = page.locator("[data-test='drop-zone']");
    await expect(dropZone).toHaveAttribute("data-status", "success", { timeout: 5000 });

    const generateBtn = page.locator("[data-test='generate-btn']");
    await expect(generateBtn).toBeVisible({ timeout: 10000 });
    await generateBtn.click();

    // Attendre les résultats
    const filesCount = page.locator("[data-test='result-files-count']");
    await expect(filesCount).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(800);

    await expect(page).toHaveScreenshot("03-compleo-results.png", {
      maxDiffPixelRatio: 0.005, // Plus tolérant car contenu dynamique
      fullPage: false,
    });
  });

  test("VR.4 — Agent IA — Page initiale", async ({ page }) => {
    await page.goto("/compleo/agent");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(800);

    await expect(page).toHaveScreenshot("04-agent-initial.png", {
      maxDiffPixelRatio: 0.002,
      fullPage: false,
    });
  });

  test("VR.5 — Workspace — Liste vide", async ({ page }) => {
    // Override workspace list to empty
    await page.route("**/api/workspace", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([]),
        });
      }
    });

    await page.goto("/compleo/workspace");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(800);

    await expect(page).toHaveScreenshot("05-workspace-empty.png", {
      maxDiffPixelRatio: 0.002,
      fullPage: false,
    });
  });

  test("VR.6 — Workspace — Avec données", async ({ page }) => {
    await page.goto("/compleo/workspace");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(800);

    await expect(page).toHaveScreenshot("06-workspace-data.png", {
      maxDiffPixelRatio: 0.002,
      fullPage: false,
    });
  });

  test("VR.7 — Projets — Liste", async ({ page }) => {
    // Mock projects list
    await page.route("**/api/trpc/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([{ result: { data: [] } }]),
      });
    });

    await page.goto("/projects");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(800);

    await expect(page).toHaveScreenshot("07-projects-list.png", {
      maxDiffPixelRatio: 0.002,
      fullPage: false,
    });
  });

  test("VR.8 — Status bar — LLM OK", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(800);

    const statusBar = page.locator("[data-test='status-bar']");
    await expect(statusBar).toHaveScreenshot("08-statusbar-ok.png", {
      maxDiffPixelRatio: 0.002,
    });
  });

  test("VR.9 — Status bar — LLM down", async ({ page }) => {
    // Override status to LLM down
    await page.route("**/api/status", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          version: "13.4.0",
          uptime: 3600,
          llm: { available: false },
          memory: { heapUsed: 128, heapTotal: 512 },
          activeSessions: 0,
          rulesCount: 47,
        }),
      });
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(800);

    const statusBar = page.locator("[data-test='status-bar']");
    await expect(statusBar).toHaveScreenshot("09-statusbar-down.png", {
      maxDiffPixelRatio: 0.002,
    });
  });
});
