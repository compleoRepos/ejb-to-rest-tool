/**
 * Parcours 1 — Single-project happy path
 *
 * Scénario complet : Upload ZIP → Analyse → Review → Génération → Download ZIP.
 * Vérifie que le pipeline fonctionne de bout en bout sans erreur.
 */
import { test, expect } from "@playwright/test";
import { setupMockApi, SINGLE_PROJECT_FIXTURE } from "../fixtures/test-data";

test.describe("Parcours 1 — Single-project happy path", () => {
  test.beforeEach(async ({ page }) => {
    await setupMockApi(page);
  });

  test("P1.1 — Page d'accueil affiche le dashboard avec status OK", async ({ page }) => {
    await page.goto("/");
    
    // Status bar visible et LLM disponible
    const statusBar = page.locator("[data-test='status-bar']");
    await expect(statusBar).toBeVisible();
    await expect(statusBar).toHaveAttribute("data-state", "ready");
    
    // LLM status indicator
    const llmStatus = page.locator("[data-test='llm-status']");
    await expect(llmStatus).toHaveAttribute("data-available", "true");
    await expect(llmStatus).toContainText("LLM OK");
    
    // Version affichée
    const version = page.locator("[data-test='app-version']");
    await expect(version).toContainText("v13.4.0");
  });

  test("P1.2 — Navigation vers Compleo et upload d'un ZIP", async ({ page }) => {
    await page.goto("/compleo");
    
    // DropZone visible en état idle
    const dropZone = page.locator("[data-test='drop-zone']");
    await expect(dropZone).toBeVisible();
    await expect(dropZone).toHaveAttribute("data-status", "idle");
    
    // Simuler un upload de fichier via l'input
    const fileInput = page.locator("[data-test='file-input']");
    await fileInput.setInputFiles({
      name: "avis-opere.zip",
      mimeType: "application/zip",
      buffer: Buffer.from("PK\x03\x04fake-zip-content"),
    });
    
    // Attendre le status success
    await expect(dropZone).toHaveAttribute("data-status", "success", { timeout: 5000 });
  });

  test.skip("P1.3 — Pipeline complet : analyse → review → génération", async ({ page }) => {
    // SKIP: Requires full pipeline mock (upload → SSE analysis → ambiguities → choices → generate)
    // This test needs a more complex fixture simulating the SSE stream and state transitions
    await page.goto("/compleo");
    
    // Upload
    const fileInput = page.locator("[data-test='file-input']");
    await fileInput.setInputFiles({
      name: "avis-opere.zip",
      mimeType: "application/zip",
      buffer: Buffer.from("PK\x03\x04fake-zip-content"),
    });
    
    // Attendre la fin de l'upload
    const dropZone = page.locator("[data-test='drop-zone']");
    await expect(dropZone).toHaveAttribute("data-status", "success", { timeout: 5000 });
    
    // Le bouton Générer devrait apparaître après l'analyse
    const generateBtn = page.locator("[data-test='generate-btn']");
    await expect(generateBtn).toBeVisible({ timeout: 10000 });
    
    // Cliquer sur Générer
    await generateBtn.click();
    
    // Attendre les résultats (fichiers générés)
    const filesCount = page.locator("[data-test='result-files-count']");
    await expect(filesCount).toBeVisible({ timeout: 15000 });
    await expect(filesCount).toContainText("18 fichiers");
  });

  test.skip("P1.4 — Download ZIP disponible après génération", async ({ page }) => {
    // SKIP: Depends on P1.3 pipeline completion
    await page.goto("/compleo");
    
    // Setup : upload + generate
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
    
    // Attendre le bouton download
    const downloadBtn = page.locator("[data-test='download-zip']");
    await expect(downloadBtn).toBeVisible({ timeout: 15000 });
    await expect(downloadBtn).toBeEnabled();
  });

  test.skip("P1.5 — Tabs résultats (Code, Diff, Architecture) navigables", async ({ page }) => {
    // SKIP: Depends on P1.3 pipeline completion
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
    
    // Attendre les tabs
    const tabCode = page.locator("[data-test='tab-code']");
    const tabDiff = page.locator("[data-test='tab-diff']");
    const tabArchi = page.locator("[data-test='tab-archi']");
    
    await expect(tabCode).toBeVisible({ timeout: 15000 });
    await expect(tabDiff).toBeVisible();
    await expect(tabArchi).toBeVisible();
    
    // Cliquer sur chaque tab
    await tabDiff.click();
    await page.waitForTimeout(300);
    await tabArchi.click();
    await page.waitForTimeout(300);
    await tabCode.click();
  });
});
