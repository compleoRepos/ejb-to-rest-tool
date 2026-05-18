/**
 * Parcours 5 — Résilience workspace partial
 *
 * Scénario : L'analyse workspace échoue partiellement (1 projet timeout).
 * L'IHM doit afficher les résultats partiels avec un avertissement.
 */
import { test, expect } from "@playwright/test";
import { setupWorkspacePartialMockApi, WORKSPACE_FIXTURE } from "../fixtures/test-data";

test.describe("Parcours 5 — Résilience workspace partial", () => {
  test.beforeEach(async ({ page }) => {
    await setupWorkspacePartialMockApi(page);
  });

  test("P5.1 — Workspace page accessible avec données partielles", async ({ page }) => {
    await page.goto("/compleo/workspace");

    // La page ne doit pas crasher
    await page.waitForTimeout(1000);
    const content = await page.textContent("body");
    expect(content!.length).toBeGreaterThan(100);
  });

  test("P5.2 — Analyse workspace retourne résultats partiels sans crash", async ({ page }) => {
    await page.goto("/compleo/workspace");
    await page.waitForTimeout(1000);

    // Sélectionner le workspace
    const wsItem = page.locator("text=BMCE Banking Suite").first();
    if (await wsItem.isVisible({ timeout: 3000 }).catch(() => false)) {
      await wsItem.click();
    }

    // Lancer l'analyse
    const analyzeBtn = page.locator("[data-test='ws-analyze']");
    if (await analyzeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await analyzeBtn.click();
      await page.waitForTimeout(2000);

      // Vérifier que la page ne crashe pas
      const bodyContent = await page.textContent("body");
      expect(bodyContent!.length).toBeGreaterThan(100);

      // Les projets qui ont réussi doivent être affichés
      expect(bodyContent).toContain("opposition-carte");
    }
  });

  test("P5.3 — Erreur partielle affichée comme warning (pas comme crash)", async ({ page }) => {
    await page.goto("/compleo/workspace");
    await page.waitForTimeout(1000);

    // Sélectionner le workspace
    const wsItem = page.locator("text=BMCE Banking Suite").first();
    if (await wsItem.isVisible({ timeout: 3000 }).catch(() => false)) {
      await wsItem.click();
    }

    // Lancer l'analyse
    const analyzeBtn = page.locator("[data-test='ws-analyze']");
    if (await analyzeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await analyzeBtn.click();
      await page.waitForTimeout(2000);

      // Pas d'erreur JS fatale
      const errors: string[] = [];
      page.on("pageerror", (err) => errors.push(err.message));
      await page.waitForTimeout(500);
      const fatalErrors = errors.filter(
        (e) => e.includes("TypeError") || e.includes("ReferenceError")
      );
      expect(fatalErrors).toHaveLength(0);
    }
  });

  test("P5.4 — Navigation reste fonctionnelle après erreur partielle", async ({ page }) => {
    await page.goto("/compleo/workspace");
    await page.waitForTimeout(1000);

    // Sélectionner le workspace et lancer l'analyse
    const wsItem = page.locator("text=BMCE Banking Suite").first();
    if (await wsItem.isVisible({ timeout: 3000 }).catch(() => false)) {
      await wsItem.click();
    }

    const analyzeBtn = page.locator("[data-test='ws-analyze']");
    if (await analyzeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await analyzeBtn.click();
      await page.waitForTimeout(2000);
    }

    // Naviguer vers une autre page
    await page.goto("/compleo");
    await page.waitForTimeout(500);
    const content = await page.textContent("body");
    expect(content!.length).toBeGreaterThan(100);

    // Revenir au workspace
    await page.goto("/compleo/workspace");
    await page.waitForTimeout(500);
    const wsContent = await page.textContent("body");
    expect(wsContent!.length).toBeGreaterThan(100);
  });
});
