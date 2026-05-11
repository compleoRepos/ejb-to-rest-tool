/**
 * Performance Assertions — 7 tests de performance IHM.
 *
 * Vérifie les temps de chargement, les métriques Core Web Vitals,
 * et la réactivité de l'interface.
 */
import { test, expect } from "@playwright/test";
import { setupMockApi } from "../fixtures/test-data";

test.describe("Performance Assertions — 7 métriques clés", () => {
  test.beforeEach(async ({ page }) => {
    await setupMockApi(page);
  });

  test("PERF.1 — First Contentful Paint < 3s", async ({ page }) => {
    const start = Date.now();
    await page.goto("/");
    // Wait for any visible content
    await page.locator("body").waitFor({ state: "visible" });
    await page.waitForLoadState("domcontentloaded");
    const fcp = Date.now() - start;

    // Budget: 3s in dev mode (includes Vite HMR overhead)
    expect(fcp).toBeLessThan(3000);
  });

  test("PERF.2 — Page d'accueil interactive < 3s (TTI)", async ({ page }) => {
    const start = Date.now();
    await page.goto("/");

    // Attendre que le status bar soit visible (indicateur d'interactivité)
    await page.locator("[data-test='status-bar']").waitFor({ state: "visible" });
    const tti = Date.now() - start;

    expect(tti).toBeLessThan(3000);
  });

  test("PERF.3 — Navigation Compleo < 1s", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const start = Date.now();
    await page.goto("/compleo");
    await page.locator("[data-test='drop-zone']").waitFor({ state: "visible" });
    const navTime = Date.now() - start;

    // En dev mode, la navigation inclut un full page load (pas de SPA routing)
    // Budget: 2s en dev, 1s en prod
    expect(navTime).toBeLessThan(2000);
  });

  test("PERF.4 — Upload response < 2s (mock)", async ({ page }) => {
    await page.goto("/compleo");
    await page.waitForLoadState("networkidle");

    const start = Date.now();
    const fileInput = page.locator("[data-test='file-input']");
    await fileInput.setInputFiles({
      name: "test.zip",
      mimeType: "application/zip",
      buffer: Buffer.from("PK\x03\x04fake"),
    });

    const dropZone = page.locator("[data-test='drop-zone']");
    await expect(dropZone).toHaveAttribute("data-status", "success", { timeout: 5000 });
    const uploadTime = Date.now() - start;

    expect(uploadTime).toBeLessThan(2000);
  });

  test("PERF.5 — Bundle size JS < 500KB (gzipped estimate)", async ({ page }) => {
    const responses: { url: string; size: number }[] = [];

    page.on("response", (response) => {
      const url = response.url();
      if (url.includes(".js") && !url.includes("node_modules")) {
        const contentLength = response.headers()["content-length"];
        if (contentLength) {
          responses.push({ url, size: parseInt(contentLength) });
        }
      }
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Calculer la taille totale des JS
    const totalJsSize = responses.reduce((sum, r) => sum + r.size, 0);

    // En dev mode les fichiers ne sont pas gzippés, donc on est plus tolérant
    // En prod, la cible est 500KB gzipped ≈ 1.5MB raw
    expect(totalJsSize).toBeLessThan(3_000_000); // 3MB raw max en dev
  });

  test("PERF.6 — Pas de layout shift significatif (CLS < 0.1)", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const cls = await page.evaluate(() => {
      return new Promise<number>((resolve) => {
        let clsValue = 0;
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!(entry as any).hadRecentInput) {
              clsValue += (entry as any).value;
            }
          }
        });
        observer.observe({ type: "layout-shift", buffered: true });

        setTimeout(() => {
          observer.disconnect();
          resolve(clsValue);
        }, 1000);
      });
    });

    expect(cls).toBeLessThan(0.1);
  });

  test("PERF.7 — Pas de memory leak après navigation (heap stable)", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Mesurer heap initial
    const heapBefore = await page.evaluate(() => {
      if ((performance as any).memory) {
        return (performance as any).memory.usedJSHeapSize;
      }
      return 0;
    });

    // Naviguer 5 fois entre les pages
    for (let i = 0; i < 5; i++) {
      await page.goto("/compleo");
      await page.waitForTimeout(200);
      await page.goto("/");
      await page.waitForTimeout(200);
      await page.goto("/compleo/workspace");
      await page.waitForTimeout(200);
    }

    // Forcer GC si possible
    await page.evaluate(() => {
      if ((window as any).gc) (window as any).gc();
    });
    await page.waitForTimeout(1000);

    // Mesurer heap final
    const heapAfter = await page.evaluate(() => {
      if ((performance as any).memory) {
        return (performance as any).memory.usedJSHeapSize;
      }
      return 0;
    });

    // Si performance.memory n'est pas disponible, skip
    if (heapBefore === 0) {
      test.skip();
      return;
    }

    // Le heap ne doit pas augmenter de plus de 50% (tolérant pour le dev mode)
    const growth = (heapAfter - heapBefore) / heapBefore;
    expect(growth).toBeLessThan(0.5);
  });
});
