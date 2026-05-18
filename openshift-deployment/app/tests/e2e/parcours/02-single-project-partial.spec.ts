/**
 * Parcours 2 — Single-project partial (TODOs)
 *
 * Scénario : La compilation échoue avec des erreurs résiduelles.
 * Le ZIP est quand même produit avec des TODO markers.
 * Vérifie la résilience du pipeline et l'affichage des warnings.
 */
import { test, expect } from "@playwright/test";
import { setupMockApi, PARTIAL_RESULT_FIXTURE } from "../fixtures/test-data";

test.describe("Parcours 2 — Single-project partial (TODOs)", () => {
  test.beforeEach(async ({ page }) => {
    await setupMockApi(page);

    // Override generate endpoint to return partial results
    await page.route("**/api/compleo/generate/**", async (route) => {
      await new Promise((r) => setTimeout(r, 200));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(PARTIAL_RESULT_FIXTURE.generationResult),
      });
    });
  });

  test.skip("P2.1 — Compilation partielle affiche les erreurs résiduelles", async ({ page }) => {
    // SKIP: Requires full pipeline mock (upload → SSE analysis → generate with partial results)
    await page.goto("/compleo");

    // Upload
    const fileInput = page.locator("[data-test='file-input']");
    await fileInput.setInputFiles({
      name: "avis-opere.zip",
      mimeType: "application/zip",
      buffer: Buffer.from("PK\x03\x04fake-zip-content"),
    });

    const dropZone = page.locator("[data-test='drop-zone']");
    await expect(dropZone).toHaveAttribute("data-status", "success", { timeout: 5000 });

    // Générer
    const generateBtn = page.locator("[data-test='generate-btn']");
    await expect(generateBtn).toBeVisible({ timeout: 10000 });
    await generateBtn.click();

    // Attendre les résultats — vérifier qu'il y a un warning compilation
    await page.waitForTimeout(3000);
    
    // Le résultat devrait montrer des erreurs
    const pageContent = await page.textContent("body");
    expect(pageContent).toContain("erreur");
  });

  test.skip("P2.2 — Download ZIP reste disponible malgré les erreurs", async ({ page }) => {
    // SKIP: Depends on P2.1 pipeline completion
    await page.goto("/compleo");

    // Upload
    const fileInput = page.locator("[data-test='file-input']");
    await fileInput.setInputFiles({
      name: "avis-opere.zip",
      mimeType: "application/zip",
      buffer: Buffer.from("PK\x03\x04fake-zip-content"),
    });

    const dropZone = page.locator("[data-test='drop-zone']");
    await expect(dropZone).toHaveAttribute("data-status", "success", { timeout: 5000 });

    // Générer
    const generateBtn = page.locator("[data-test='generate-btn']");
    await expect(generateBtn).toBeVisible({ timeout: 10000 });
    await generateBtn.click();

    // Le bouton download doit quand même être disponible (partial success)
    const downloadBtn = page.locator("[data-test='download-zip']");
    await expect(downloadBtn).toBeVisible({ timeout: 15000 });
    await expect(downloadBtn).toBeEnabled();
  });

  test.skip("P2.3 — TODO markers affichés dans les résultats", async ({ page }) => {
    // SKIP: Depends on P2.1 pipeline completion
    await page.goto("/compleo");

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
    await page.waitForTimeout(3000);

    // Vérifier que le contenu mentionne les TODOs
    const content = await page.textContent("body");
    expect(content).toContain("TODO");
  });

  test.skip("P2.4 — Nombre d'itérations de compilation affiché", async ({ page }) => {
    // SKIP: Depends on P2.1 pipeline completion
    await page.goto("/compleo");

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
    await page.waitForTimeout(3000);

    // Le nombre d'itérations (3) devrait être visible quelque part
    const content = await page.textContent("body");
    expect(content).toContain("3");
  });
});
