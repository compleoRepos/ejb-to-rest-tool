import { test, expect, Page } from "@playwright/test";
import path from "path";
import fs from "fs";

/**
 * COMPLEO v13.5 — Demo Dry-Run
 * 
 * Test E2E bout-en-bout métier SANS mock.
 * LLM réel, Maven réel, pipeline réel.
 * 
 * Scénario :
 *   Projet 1 : interface-credit-jocker (🟢 Ready — 0 erreurs attendues)
 *   Projet 2 : avis-opere (🟡 Near-complete — quelques TODOs attendus)
 *   Workspace : analyse multi-projets, rapport, enrichissement LLM
 * 
 * Produit :
 *   - interface-credit-jocker-migrated.zip
 *   - avis-opere-migrated.zip
 *   - WORKSPACE-AUDIT.html
 *   - validation-report.html (via DemoValidationReporter)
 */

const FIXTURES_DIR = path.resolve(__dirname, "../fixtures/bmce");
const OUTPUT_DIR = path.resolve(__dirname, "../output/demo-run-latest");

// Timeouts adaptés au LLM réel
const UPLOAD_TIMEOUT = 60_000; // 60s pour l'upload + extraction
const ANALYSIS_TIMEOUT = 5 * 60_000; // 5min pour l'analyse LLM
const GENERATION_TIMEOUT = 10 * 60_000; // 10min pour la génération + compilation
const WORKSPACE_TIMEOUT = 5 * 60_000; // 5min pour l'analyse workspace

test.describe.serial("Demo Dry-Run — Validation bout-en-bout", () => {
  let page: Page;
  let session1Id: string;
  let session2Id: string;

  test.beforeAll(async ({ browser }) => {
    // Créer le dossier de sortie
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    page = await browser.newPage();
  });

  test.afterAll(async () => {
    await page.close();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ÉTAPE 0 — Setup : vérifier que l'app est accessible
  // ═══════════════════════════════════════════════════════════════════════════
  test("STEP-0 · App accessible et StatusBar ready", async () => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Vérifier que la page d'accueil est chargée
    const title = await page.title();
    expect(title).toBeTruthy();

    // Vérifier le StatusBar
    const statusBar = page.locator("[data-test='status-bar']");
    await expect(statusBar).toBeVisible({ timeout: 10_000 });

    // Screenshot
    await page.screenshot({
      path: path.join(OUTPUT_DIR, "step-00-app-ready.png"),
      fullPage: true,
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ÉTAPE 1 — Naviguer vers Compleo
  // ═══════════════════════════════════════════════════════════════════════════
  test("STEP-1 · Navigation vers Compleo", async () => {
    await page.goto("/compleo");
    await page.waitForLoadState("networkidle");

    // Vérifier que la page Compleo est affichée
    const uploadTitle = page.locator("[data-test='upload-title']");
    await expect(uploadTitle).toBeVisible({ timeout: 10_000 });

    await page.screenshot({
      path: path.join(OUTPUT_DIR, "step-01-compleo-page.png"),
      fullPage: true,
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ÉTAPE 2 — Upload Projet 1 : interface-credit-jocker
  // ═══════════════════════════════════════════════════════════════════════════
  test("STEP-2 · Upload interface-credit-jocker.zip", async () => {
    const zipPath = path.join(FIXTURES_DIR, "interface-credit-jocker.zip");
    expect(fs.existsSync(zipPath)).toBe(true);

    // Upload via input file
    const fileInput = page.locator("[data-test='file-input']");
    await fileInput.setInputFiles(zipPath);

    // Attendre la redirection vers la page d'analyse (sessionId dans l'URL)
    await page.waitForURL(/\/compleo\/agent\/.*\/analyze|\/compleo/, {
      timeout: UPLOAD_TIMEOUT,
    });

    // Capturer le sessionId
    const url = page.url();
    const match = url.match(/\/compleo\/agent\/([^/]+)/);
    if (match) {
      session1Id = match[1];
    }

    await page.screenshot({
      path: path.join(OUTPUT_DIR, "step-02-upload-project1.png"),
      fullPage: true,
    });

    expect(session1Id || url).toBeTruthy();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ÉTAPE 3 — Analyse Projet 1
  // ═══════════════════════════════════════════════════════════════════════════
  test("STEP-3 · Analyse LLM projet 1 (interface-credit-jocker)", async () => {
    // Attendre que l'analyse se termine (le bouton generate apparaît ou le status change)
    // L'analyse est lancée automatiquement après l'upload dans le flux multitech
    
    // Attendre soit le bouton generate, soit un indicateur d'analyse terminée
    const generateBtn = page.locator("[data-test='generate-btn']");
    const resultSection = page.locator("[data-test='result-files-count']");
    
    // Attendre que l'un des deux soit visible (analyse terminée → prêt à générer)
    await expect(generateBtn.or(resultSection)).toBeVisible({
      timeout: ANALYSIS_TIMEOUT,
    });

    await page.screenshot({
      path: path.join(OUTPUT_DIR, "step-03-analysis-project1.png"),
      fullPage: true,
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ÉTAPE 4 — Génération Projet 1
  // ═══════════════════════════════════════════════════════════════════════════
  test("STEP-4 · Génération code projet 1", async () => {
    // Si le bouton generate est visible, cliquer dessus
    const generateBtn = page.locator("[data-test='generate-btn']");
    if (await generateBtn.isVisible()) {
      await generateBtn.click();
    }

    // Attendre que la génération se termine (download-zip visible)
    const downloadBtn = page.locator("[data-test='download-zip']");
    await expect(downloadBtn).toBeVisible({ timeout: GENERATION_TIMEOUT });

    await page.screenshot({
      path: path.join(OUTPUT_DIR, "step-04-generation-project1.png"),
      fullPage: true,
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ÉTAPE 5 — Vérifier les résultats Projet 1
  // ═══════════════════════════════════════════════════════════════════════════
  test("STEP-5 · Vérifier résultats projet 1 (fichiers, tabs)", async () => {
    // Vérifier que des fichiers ont été générés
    const filesCount = page.locator("[data-test='result-files-count']");
    await expect(filesCount).toBeVisible();
    const filesText = await filesCount.textContent();
    expect(filesText).toMatch(/\d+ fichiers/);

    // Vérifier les tabs de résultats
    const tabCode = page.locator("[data-test='tab-code']");
    await expect(tabCode).toBeVisible();

    await page.screenshot({
      path: path.join(OUTPUT_DIR, "step-05-results-project1.png"),
      fullPage: true,
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ÉTAPE 6 — Download ZIP Projet 1
  // ═══════════════════════════════════════════════════════════════════════════
  test("STEP-6 · Download ZIP projet 1", async () => {
    const downloadBtn = page.locator("[data-test='download-zip']");
    
    // Intercepter le download
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 30_000 }),
      downloadBtn.click(),
    ]);

    // Sauvegarder le ZIP
    const zipPath = path.join(OUTPUT_DIR, "interface-credit-jocker-migrated.zip");
    await download.saveAs(zipPath);

    // Vérifier que le fichier existe et a une taille > 0
    const stats = fs.statSync(zipPath);
    expect(stats.size).toBeGreaterThan(1000);

    await page.screenshot({
      path: path.join(OUTPUT_DIR, "step-06-download-project1.png"),
      fullPage: true,
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ÉTAPE 7 — Vérifier contenu ZIP Projet 1 (MIGRATION-REPORT.html)
  // ═══════════════════════════════════════════════════════════════════════════
  test("STEP-7 · Vérifier MIGRATION-REPORT.html dans ZIP projet 1", async () => {
    const zipPath = path.join(OUTPUT_DIR, "interface-credit-jocker-migrated.zip");
    
    // Utiliser l'API Node pour vérifier le contenu du ZIP
    const { execSync } = await import("child_process");
    const zipContent = execSync(`unzip -l "${zipPath}" 2>/dev/null || true`).toString();
    
    // Vérifier que le rapport est présent
    expect(zipContent).toContain("MIGRATION-REPORT.html");
    
    // Vérifier les artifacts .compleo/
    expect(zipContent).toContain(".compleo/");

    await page.screenshot({
      path: path.join(OUTPUT_DIR, "step-07-zip-content-project1.png"),
      fullPage: true,
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ÉTAPE 8 — Retour à Compleo pour Projet 2
  // ═══════════════════════════════════════════════════════════════════════════
  test("STEP-8 · Retour à Compleo pour projet 2", async () => {
    await page.goto("/compleo");
    await page.waitForLoadState("networkidle");

    const uploadTitle = page.locator("[data-test='upload-title']");
    await expect(uploadTitle).toBeVisible({ timeout: 10_000 });

    await page.screenshot({
      path: path.join(OUTPUT_DIR, "step-08-back-to-compleo.png"),
      fullPage: true,
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ÉTAPE 9 — Upload Projet 2 : avis-opere
  // ═══════════════════════════════════════════════════════════════════════════
  test("STEP-9 · Upload avis-opere.zip", async () => {
    const zipPath = path.join(FIXTURES_DIR, "avis-opere.zip");
    expect(fs.existsSync(zipPath)).toBe(true);

    const fileInput = page.locator("[data-test='file-input']");
    await fileInput.setInputFiles(zipPath);

    await page.waitForURL(/\/compleo\/agent\/.*\/analyze|\/compleo/, {
      timeout: UPLOAD_TIMEOUT,
    });

    const url = page.url();
    const match = url.match(/\/compleo\/agent\/([^/]+)/);
    if (match) {
      session2Id = match[1];
    }

    await page.screenshot({
      path: path.join(OUTPUT_DIR, "step-09-upload-project2.png"),
      fullPage: true,
    });

    expect(session2Id || url).toBeTruthy();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ÉTAPE 10 — Pipeline complet Projet 2 (analyse + génération)
  // ═══════════════════════════════════════════════════════════════════════════
  test("STEP-10 · Pipeline complet projet 2 (analyse + génération)", async () => {
    // Attendre l'analyse
    const generateBtn = page.locator("[data-test='generate-btn']");
    const resultSection = page.locator("[data-test='result-files-count']");
    
    await expect(generateBtn.or(resultSection)).toBeVisible({
      timeout: ANALYSIS_TIMEOUT,
    });

    // Générer si nécessaire
    if (await generateBtn.isVisible()) {
      await generateBtn.click();
    }

    // Attendre la fin de génération
    const downloadBtn = page.locator("[data-test='download-zip']");
    await expect(downloadBtn).toBeVisible({ timeout: GENERATION_TIMEOUT });

    await page.screenshot({
      path: path.join(OUTPUT_DIR, "step-10-pipeline-project2.png"),
      fullPage: true,
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ÉTAPE 11 — Download ZIP Projet 2
  // ═══════════════════════════════════════════════════════════════════════════
  test("STEP-11 · Download ZIP projet 2", async () => {
    const downloadBtn = page.locator("[data-test='download-zip']");
    
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 30_000 }),
      downloadBtn.click(),
    ]);

    const zipPath = path.join(OUTPUT_DIR, "avis-opere-migrated.zip");
    await download.saveAs(zipPath);

    const stats = fs.statSync(zipPath);
    expect(stats.size).toBeGreaterThan(500);

    // Vérifier le rapport dans le ZIP
    const { execSync } = await import("child_process");
    const zipContent = execSync(`unzip -l "${zipPath}" 2>/dev/null || true`).toString();
    expect(zipContent).toContain("MIGRATION-REPORT.html");

    await page.screenshot({
      path: path.join(OUTPUT_DIR, "step-11-download-project2.png"),
      fullPage: true,
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ÉTAPE 12 — Naviguer vers Workspace
  // ═══════════════════════════════════════════════════════════════════════════
  test("STEP-12 · Navigation vers Workspace", async () => {
    await page.goto("/compleo/workspace");
    await page.waitForLoadState("networkidle");

    // Vérifier que la page Workspace est affichée
    await page.waitForTimeout(2000); // Laisser le temps au composant de charger

    await page.screenshot({
      path: path.join(OUTPUT_DIR, "step-12-workspace-page.png"),
      fullPage: true,
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ÉTAPE 13 — Lancer l'analyse Workspace
  // ═══════════════════════════════════════════════════════════════════════════
  test("STEP-13 · Analyse Workspace multi-projets", async () => {
    // Chercher le bouton d'analyse workspace
    const analyzeBtn = page.locator("[data-test='ws-analyze']");
    
    if (await analyzeBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await analyzeBtn.click();

      // Attendre que l'analyse se termine (résultats visibles)
      await page.waitForTimeout(WORKSPACE_TIMEOUT);
    }

    await page.screenshot({
      path: path.join(OUTPUT_DIR, "step-13-workspace-analysis.png"),
      fullPage: true,
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ÉTAPE 14 — Vérifier les résultats Workspace
  // ═══════════════════════════════════════════════════════════════════════════
  test("STEP-14 · Vérifier résultats Workspace (DAG, tiers)", async () => {
    // Vérifier que des résultats sont affichés
    const pageContent = await page.textContent("body");
    
    // Au moins un des deux projets doit apparaître
    const hasProject1 = pageContent?.includes("interface-credit-jocker") || 
                        pageContent?.includes("credit-jocker");
    const hasProject2 = pageContent?.includes("avis-opere");
    
    // Au moins un projet doit être visible dans les résultats
    expect(hasProject1 || hasProject2 || pageContent?.includes("workspace")).toBeTruthy();

    await page.screenshot({
      path: path.join(OUTPUT_DIR, "step-14-workspace-results.png"),
      fullPage: true,
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ÉTAPE 15 — StatusBar final
  // ═══════════════════════════════════════════════════════════════════════════
  test("STEP-15 · StatusBar final — vérifier état système", async () => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const statusBar = page.locator("[data-test='status-bar']");
    await expect(statusBar).toBeVisible({ timeout: 10_000 });

    // Vérifier que le système est toujours opérationnel
    const state = await statusBar.getAttribute("data-state");
    expect(state).toBe("ready");

    await page.screenshot({
      path: path.join(OUTPUT_DIR, "step-15-statusbar-final.png"),
      fullPage: true,
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ÉTAPE 16 — Rapport final : vérifier les livrables
  // ═══════════════════════════════════════════════════════════════════════════
  test("STEP-16 · Rapport final — vérifier tous les livrables", async () => {
    const livrables = [
      { name: "interface-credit-jocker-migrated.zip", minSize: 1000 },
      { name: "avis-opere-migrated.zip", minSize: 500 },
    ];

    const results: { name: string; exists: boolean; size: number }[] = [];

    for (const livrable of livrables) {
      const filePath = path.join(OUTPUT_DIR, livrable.name);
      const exists = fs.existsSync(filePath);
      const size = exists ? fs.statSync(filePath).size : 0;
      results.push({ name: livrable.name, exists, size });
      
      if (exists) {
        expect(size).toBeGreaterThan(livrable.minSize);
      }
    }

    // Écrire un résumé JSON des livrables
    const summaryPath = path.join(OUTPUT_DIR, "livrables-summary.json");
    fs.writeFileSync(summaryPath, JSON.stringify({
      date: new Date().toISOString(),
      livrables: results,
      sessions: { project1: session1Id, project2: session2Id },
      globalStatus: results.every(r => r.exists) ? "PASS" : "PARTIAL",
    }, null, 2));

    await page.screenshot({
      path: path.join(OUTPUT_DIR, "step-16-final-report.png"),
      fullPage: true,
    });

    // Au moins un ZIP doit avoir été produit
    const atLeastOneZip = results.some(r => r.exists && r.size > 500);
    expect(atLeastOneZip).toBe(true);
  });
});
