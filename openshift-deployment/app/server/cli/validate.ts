/**
 * validate.ts — CLI pour lancer la validation auto du pipeline Compleo.
 *
 * Usage :
 *   npx tsx server/cli/validate.ts [options]
 *
 * Options :
 *   --projects=ALL|REFERENCE|GENERATED|<id>   Projets à valider (défaut: ALL)
 *   --max-retries=N                           Tentatives de build max (défaut: 3)
 *   --stop-on-fail                            Arrêter au premier échec
 *   --no-regression                           Désactiver la comparaison de régressions
 *   --generate                                Générer les projets synthétiques avant validation
 *   --report=<path>                           Chemin du rapport Markdown (défaut: data/validation-report.md)
 *   --json                                    Afficher le rapport en JSON
 *
 * @since v8.7
 */

import { initializeRegistry } from "../engine/validation/init-registry";
import { generateTestProjects } from "../engine/validation/ProjectGenerator";
import { ValidationRunner, generateMarkdownReport } from "../engine/validation/ValidationRunner";
import type { ValidationOptions, ValidationReport } from "../engine/validation/ValidationRunner";
import * as fs from "fs";
import * as path from "path";

// ─── Parsing des arguments ──────────────────────────────────────────────────

function parseArgs(args: string[]): {
  projects: string;
  maxRetries: number;
  stopOnFail: boolean;
  compareWithLast: boolean;
  generateSynthetic: boolean;
  reportPath: string;
  jsonOutput: boolean;
} {
  const result = {
    projects: "ALL",
    maxRetries: 3,
    stopOnFail: false,
    compareWithLast: true,
    generateSynthetic: false,
    reportPath: "data/validation-report.md",
    jsonOutput: false,
  };

  for (const arg of args) {
    if (arg.startsWith("--projects=")) {
      result.projects = arg.split("=")[1];
    } else if (arg.startsWith("--max-retries=")) {
      result.maxRetries = parseInt(arg.split("=")[1], 10);
    } else if (arg === "--stop-on-fail") {
      result.stopOnFail = true;
    } else if (arg === "--no-regression") {
      result.compareWithLast = false;
    } else if (arg === "--generate") {
      result.generateSynthetic = true;
    } else if (arg.startsWith("--report=")) {
      result.reportPath = arg.split("=")[1];
    } else if (arg === "--json") {
      result.jsonOutput = true;
    }
  }

  return result;
}

// ─── Formatage console ──────────────────────────────────────────────────────

function printBanner(): void {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║       COMPLEO — Auto-Validation Pipeline        ║");
  console.log("║                   v8.7                          ║");
  console.log("╚══════════════════════════════════════════════════╝");
  console.log();
}

function printSummary(report: ValidationReport): void {
  const s = report.summary;
  console.log("┌──────────────────────────────────────────────────┐");
  console.log("│                  RÉSUMÉ                          │");
  console.log("├──────────────────────────────────────────────────┤");
  console.log(`│  Projets testés    : ${String(s.total).padEnd(28)}│`);
  console.log(`│  Réussis           : ${String(s.passed).padEnd(28)}│`);
  console.log(`│  Échoués           : ${String(s.failed).padEnd(28)}│`);
  console.log(`│  Score moyen       : ${String(s.avgScore + "/100").padEnd(28)}│`);
  console.log(`│  Erreurs build     : ${String(s.totalBuildErrors).padEnd(28)}│`);
  console.log(`│  Auto-corrigées    : ${String(s.totalAutoFixed).padEnd(28)}│`);
  console.log(`│  Régressions       : ${String(s.totalRegressions).padEnd(28)}│`);
  console.log(`│  Durée             : ${String((s.durationMs / 1000).toFixed(1) + "s").padEnd(28)}│`);
  console.log("└──────────────────────────────────────────────────┘");
  console.log();

  // Détails par projet
  for (const r of report.results) {
    const icon = r.score >= 80 ? "✓" : r.score >= 50 ? "~" : "✗";
    const status = r.score >= 80 ? "PASS" : r.score >= 50 ? "WARN" : "FAIL";
    console.log(`  ${icon} [${status}] ${r.projectName} — ${r.score}/100 (${r.filesGenerated} fichiers, ${(r.durationMs / 1000).toFixed(1)}s)`);
    if (r.error) {
      console.log(`      ERREUR: ${r.error}`);
    }
    for (const a of r.assertionResults.filter((a) => !a.passed)) {
      console.log(`      FAIL: ${a.message}`);
    }
    for (const reg of r.regressions) {
      console.log(`      REGRESSION: ${reg}`);
    }
  }
  console.log();
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  printBanner();

  // 1. Initialiser le registre
  console.log("[1/4] Initialisation du registre...");
  const registry = initializeRegistry();

  // 2. Générer les projets synthétiques si demandé
  if (args.generateSynthetic) {
    console.log("[2/4] Génération des projets synthétiques...");
    const { projects, filesWritten } = generateTestProjects("./data/generated-projects");
    for (const project of projects) {
      registry.register(project);
    }
    console.log(`      ${projects.length} projets générés (${filesWritten} fichiers)`);
  } else {
    console.log("[2/4] Projets synthétiques : skip (utiliser --generate pour activer)");
  }

  // 3. Lancer la validation
  console.log(`[3/4] Validation en cours (${args.projects})...`);
  const runner = new ValidationRunner(registry);
  const options: ValidationOptions = {
    projects: args.projects,
    maxBuildRetries: args.maxRetries,
    stopOnFirstFail: args.stopOnFail,
    compareWithLast: args.compareWithLast,
  };
  const report = await runner.runValidation(options);

  // 4. Rapport
  console.log("[4/4] Génération du rapport...");
  if (args.jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printSummary(report);
  }

  // Sauvegarder le rapport Markdown
  const reportDir = path.dirname(args.reportPath);
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }
  const markdown = generateMarkdownReport(report);
  fs.writeFileSync(args.reportPath, markdown, "utf-8");
  console.log(`Rapport sauvegardé : ${args.reportPath}`);

  // Sauvegarder le registre
  registry.save();

  // Exit code
  const exitCode = report.summary.failed > 0 ? 1 : 0;
  process.exit(exitCode);
}

main().catch((err) => {
  console.error("Erreur fatale:", err);
  process.exit(2);
});
