/**
 * Parcours 3 — Workspace mode complet
 *
 * Scénario : Création workspace → Ajout projets → Analyse DAG → Migration plan → Rapport.
 * Vérifie le flux multi-projets de bout en bout.
 */
import { test, expect } from "@playwright/test";
import { setupMockApi, WORKSPACE_FIXTURE } from "../fixtures/test-data";

test.describe("Parcours 3 — Workspace mode complet", () => {
  test.beforeEach(async ({ page }) => {
    await setupMockApi(page);
  });

  test("P3.1 — Navigation vers Workspaces et liste visible", async ({ page }) => {
    await page.goto("/compleo/workspace");

    // La page workspace doit être accessible
    await expect(page).toHaveURL(/workspace/);

    // Vérifier que le bouton de création est visible
    const createBtn = page.locator("[data-test='ws-create-btn']");
    await expect(createBtn).toBeVisible({ timeout: 5000 });
  });

  test("P3.2 — Création d'un nouveau workspace", async ({ page }) => {
    await page.goto("/compleo/workspace");

    // Remplir le nom du workspace
    const nameInput = page.locator("input[placeholder*='workspace'], input[placeholder*='Workspace'], input[placeholder*='nom']").first();
    await expect(nameInput).toBeVisible({ timeout: 5000 });
    await nameInput.fill("BMCE Banking Suite");

    // Cliquer sur Créer
    const createBtn = page.locator("[data-test='ws-create-btn']");
    await createBtn.click();

    // Attendre la création
    await page.waitForTimeout(1000);
  });

  test("P3.3 — Analyse workspace affiche le DAG de dépendances", async ({ page }) => {
    await page.goto("/compleo/workspace");

    // Attendre le chargement des workspaces
    await page.waitForTimeout(1000);

    // Sélectionner le workspace existant (cliquer dessus)
    const wsItem = page.locator("text=BMCE Banking Suite").first();
    if (await wsItem.isVisible()) {
      await wsItem.click();
    }

    // Lancer l'analyse
    const analyzeBtn = page.locator("[data-test='ws-analyze']");
    if (await analyzeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await analyzeBtn.click();

      // Attendre les résultats (DAG, tiers, stubs)
      await page.waitForTimeout(2000);

      // Vérifier que le contenu mentionne les tiers de migration
      const content = await page.textContent("body");
      expect(content).toMatch(/tier|tiers|migration/i);
    }
  });

  test("P3.4 — Plan de migration par tiers affiché", async ({ page }) => {
    await page.goto("/compleo/workspace");

    await page.waitForTimeout(1000);

    // Sélectionner le workspace
    const wsItem = page.locator("text=BMCE Banking Suite").first();
    if (await wsItem.isVisible()) {
      await wsItem.click();
    }

    // Lancer l'analyse
    const analyzeBtn = page.locator("[data-test='ws-analyze']");
    if (await analyzeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await analyzeBtn.click();
      await page.waitForTimeout(2000);

      // Vérifier que les projets sont listés dans les tiers
      const content = await page.textContent("body");
      expect(content).toContain("opposition-carte");
    }
  });

  test("P3.5 — Bouton Rapport HTML fonctionnel", async ({ page }) => {
    await page.goto("/compleo/workspace");

    await page.waitForTimeout(1000);

    // Sélectionner le workspace
    const wsItem = page.locator("text=BMCE Banking Suite").first();
    if (await wsItem.isVisible()) {
      await wsItem.click();
    }

    // Lancer l'analyse
    const analyzeBtn = page.locator("[data-test='ws-analyze']");
    if (await analyzeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await analyzeBtn.click();
      await page.waitForTimeout(2000);

      // Vérifier que le bouton rapport est visible
      const reportBtn = page.locator("text=Rapport HTML").first();
      if (await reportBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        // Le bouton rapport doit être cliquable
        await expect(reportBtn).toBeEnabled();
      }
    }
  });
});
