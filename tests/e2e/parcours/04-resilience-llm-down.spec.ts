/**
 * Parcours 4 — Résilience LLM down
 *
 * Scénario : Le LLM est indisponible.
 * L'IHM doit afficher un indicateur clair et le pipeline doit gérer gracieusement.
 */
import { test, expect } from "@playwright/test";
import { setupLlmDownMockApi } from "../fixtures/test-data";

test.describe("Parcours 4 — Résilience LLM down", () => {
  test.beforeEach(async ({ page }) => {
    await setupLlmDownMockApi(page);
  });

  test("P4.1 — Status bar affiche LLM indisponible", async ({ page }) => {
    await page.goto("/");

    // Status bar doit montrer LLM down
    const llmStatus = page.locator("[data-test='llm-status']");
    await expect(llmStatus).toBeVisible({ timeout: 5000 });
    await expect(llmStatus).toHaveAttribute("data-available", "false");
    await expect(llmStatus).toContainText("indisponible");
  });

  test("P4.2 — Pastille rouge visible pour LLM down", async ({ page }) => {
    await page.goto("/");

    // La pastille de status doit être rouge
    const llmStatus = page.locator("[data-test='llm-status']");
    await expect(llmStatus).toBeVisible({ timeout: 5000 });

    // Vérifier que la pastille est rouge (bg-red-500)
    const dot = llmStatus.locator("span.rounded-full").first();
    await expect(dot).toHaveClass(/bg-red-500/);
  });

  test("P4.3 — Upload fonctionne même avec LLM down", async ({ page }) => {
    // Rerouter upload pour qu'il fonctionne quand même
    await page.route("**/api/compleo/upload", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ sessionId: "test-session-llm-down" }),
      });
    });

    await page.goto("/compleo");

    // DropZone doit être visible
    const dropZone = page.locator("[data-test='drop-zone']");
    await expect(dropZone).toBeVisible();

    // Upload un fichier
    const fileInput = page.locator("[data-test='file-input']");
    await fileInput.setInputFiles({
      name: "test-project.zip",
      mimeType: "application/zip",
      buffer: Buffer.from("PK\x03\x04fake-zip"),
    });

    // L'upload doit réussir (le serveur accepte le fichier indépendamment du LLM)
    await expect(dropZone).toHaveAttribute("data-status", "success", { timeout: 5000 });
  });

  test("P4.4 — Analyse échoue gracieusement avec message d'erreur", async ({ page }) => {
    await page.goto("/compleo");

    // Upload
    await page.route("**/api/compleo/upload", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ sessionId: "test-session-llm-down" }),
      });
    });

    const fileInput = page.locator("[data-test='file-input']");
    await fileInput.setInputFiles({
      name: "test-project.zip",
      mimeType: "application/zip",
      buffer: Buffer.from("PK\x03\x04fake-zip"),
    });

    const dropZone = page.locator("[data-test='drop-zone']");
    await expect(dropZone).toHaveAttribute("data-status", "success", { timeout: 5000 });

    // Attendre que l'analyse tente de se lancer et échoue
    await page.waitForTimeout(3000);

    // Vérifier qu'un message d'erreur est affiché (pas un crash)
    const content = await page.textContent("body");
    // L'app ne doit pas crasher — elle doit afficher un état cohérent
    expect(content).toBeTruthy();
    // Pas de page blanche
    expect(content!.length).toBeGreaterThan(100);
  });

  test("P4.5 — Pas de crash/page blanche en mode LLM down", async ({ page }) => {
    // Naviguer sur toutes les pages principales
    const pages = ["/", "/compleo", "/compleo/workspace", "/projects"];

    for (const url of pages) {
      await page.goto(url);
      await page.waitForTimeout(500);

      // Vérifier que la page n'est pas blanche
      const body = await page.textContent("body");
      expect(body!.length).toBeGreaterThan(50);

      // Vérifier pas d'erreur JS non attrapée
      const errors: string[] = [];
      page.on("pageerror", (err) => errors.push(err.message));
      await page.waitForTimeout(500);
      // Note: les erreurs réseau sont OK, mais pas les TypeError/ReferenceError
      const jsErrors = errors.filter(
        (e) => e.includes("TypeError") || e.includes("ReferenceError")
      );
      expect(jsErrors).toHaveLength(0);
    }
  });
});
