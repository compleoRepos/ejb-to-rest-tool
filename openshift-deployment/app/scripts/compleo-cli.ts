#!/usr/bin/env tsx
/**
 * Compleo CLI v4.0 — Commande `compleo migrate`
 *
 * Utilise directement CompleoEngine + GitConnector + CompilationLoop
 * sans passer par HTTP. Supporte les modes --dry-run et --verbose.
 *
 * Usage:
 *   npx tsx scripts/compleo-cli.ts migrate --repo <url> [options]
 *   npx tsx scripts/compleo-cli.ts migrate --zip <path> [options]
 *
 * Options:
 *   --repo <url>       URL du repository Git à cloner
 *   --zip <path>       Chemin vers un fichier ZIP local
 *   --token <token>    Token d'authentification Git (optionnel)
 *   --branch <branch>  Branche à cloner (défaut: main)
 *   --output <dir>     Répertoire de sortie (défaut: ./output)
 *   --project <name>   Nom du projet (défaut: déduit du repo/zip)
 *   --auto-resolve     Auto-résoudre les ambiguïtés
 *   --dry-run          Analyse sans génération ni push
 *   --verbose          Logs détaillés
 *   --max-attempts <n> Nombre max de tentatives de compilation (défaut: 5)
 *
 * @author Compleo
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";
import { CompleoEngine, type SourceFile, type AnalysisResult, type GeneratedProject } from "../server/engine/CompleoEngine";
import { CompilationLoop, type LoopResult } from "../server/agent/CompilationLoop";

// ─── ANSI colors ─────────────────────────────────────────────────────────────

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";
const MAGENTA = "\x1b[35m";
const BLUE = "\x1b[34m";

function log(msg: string) { console.log(msg); }
function info(msg: string) { log(`${CYAN}ℹ${RESET} ${msg}`); }
function success(msg: string) { log(`${GREEN}✓${RESET} ${msg}`); }
function warn(msg: string) { log(`${YELLOW}⚠${RESET} ${msg}`); }
function error(msg: string) { log(`${RED}✗${RESET} ${msg}`); }
function phase(msg: string) { log(`\n${BOLD}${MAGENTA}▸ ${msg}${RESET}`); }
function detail(msg: string) { log(`  ${DIM}${msg}${RESET}`); }

// ─── Argument parsing ────────────────────────────────────────────────────────

interface CliArgs {
  command: string;
  repo?: string;
  zip?: string;
  token?: string;
  branch: string;
  output: string;
  project?: string;
  autoResolve: boolean;
  dryRun: boolean;
  verbose: boolean;
  maxAttempts: number;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = {
    command: args[0] || "help",
    branch: "main",
    output: "./output",
    autoResolve: false,
    dryRun: false,
    verbose: false,
    maxAttempts: 5,
  };

  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case "--repo":
        result.repo = args[++i];
        break;
      case "--zip":
        result.zip = args[++i];
        break;
      case "--token":
        result.token = args[++i];
        break;
      case "--branch":
        result.branch = args[++i];
        break;
      case "--output":
        result.output = args[++i];
        break;
      case "--project":
        result.project = args[++i];
        break;
      case "--auto-resolve":
        result.autoResolve = true;
        break;
      case "--dry-run":
        result.dryRun = true;
        break;
      case "--verbose":
        result.verbose = true;
        break;
      case "--max-attempts":
        result.maxAttempts = parseInt(args[++i]) || 5;
        break;
    }
  }

  return result;
}

// ─── File reading ────────────────────────────────────────────────────────────

function readSourceFiles(dir: string): SourceFile[] {
  const files: SourceFile[] = [];
  const extensions = [".java", ".xml", ".properties", ".yml", ".yaml", ".jsp"];
  const skipDirs = ["node_modules", ".git", "target", "build", ".idea"];

  function walk(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (!skipDirs.includes(entry.name)) walk(fullPath);
      } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
        const content = fs.readFileSync(fullPath, "utf-8");
        const relativePath = path.relative(dir, fullPath);
        files.push({ path: relativePath, content });
      }
    }
  }

  walk(dir);
  return files;
}

function readZipFiles(zipPath: string): SourceFile[] {
  // For ZIP, we extract to a temp dir and read
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "compleo-"));
  execSync(`unzip -q -o "${zipPath}" -d "${tmpDir}"`);
  const files = readSourceFiles(tmpDir);
  // Cleanup
  try { execSync(`rm -rf "${tmpDir}"`); } catch { /* ignore */ }
  return files;
}

// ─── Print helpers ───────────────────────────────────────────────────────────

function printAnalysisSummary(analysis: AnalysisResult, verbose: boolean) {
  phase("Résultat de l'analyse");

  log(`  ${BOLD}Use Cases EJB${RESET}     : ${analysis.summary.useCaseCount}`);
  log(`  ${BOLD}DTOs${RESET}              : ${analysis.summary.dtoCount}`);
  log(`  ${BOLD}Enums${RESET}             : ${analysis.summary.enumCount}`);
  log(`  ${BOLD}Exceptions${RESET}        : ${analysis.summary.exceptionCount}`);
  log(`  ${BOLD}Composants${RESET}        : ${analysis.summary.componentCount}`);
  log(`  ${BOLD}Technologies${RESET}      : ${analysis.summary.technologyCount}`);
  log(`  ${BOLD}Ambiguïtés${RESET}        : ${analysis.summary.ambiguityCount}`);

  if (analysis.multiTech.technologiesDetected.length > 0) {
    log(`\n  ${BOLD}Technologies détectées :${RESET}`);
    for (const tech of analysis.multiTech.technologiesDetected) {
      log(`    ${CYAN}•${RESET} ${tech}`);
    }
  }

  if (analysis.multiTech.maturityScore) {
    const ms = analysis.multiTech.maturityScore;
    log(`\n  ${BOLD}Score de maturité :${RESET}`);
    log(`    Complexité  : ${formatScore(ms.complexity)}`);
    log(`    Couverture  : ${formatScore(ms.coverage)}`);
    log(`    Risque      : ${formatScore(ms.risk)}`);
    log(`    Valeur      : ${formatScore(ms.value)}`);
    log(`    Confiance   : ${formatScore(ms.confidence)}`);
    log(`    ${BOLD}Global      : ${formatScore(ms.overall)}${RESET}`);
  }

  if (verbose && analysis.ambiguities.length > 0) {
    log(`\n  ${BOLD}Ambiguïtés détectées :${RESET}`);
    for (const amb of analysis.ambiguities) {
      log(`    ${YELLOW}?${RESET} [${amb.type}] ${amb.question}`);
      log(`      ${DIM}Classe: ${amb.context.className}${RESET}`);
      log(`      ${DIM}Recommandation: ${amb.recommendation}${RESET}`);
    }
  }
}

function formatScore(score: number): string {
  const pct = Math.round(score * 100);
  const bar = "█".repeat(Math.round(pct / 5)) + "░".repeat(20 - Math.round(pct / 5));
  const color = pct >= 70 ? GREEN : pct >= 40 ? YELLOW : RED;
  return `${color}${bar}${RESET} ${pct}%`;
}

function printGenerationSummary(project: GeneratedProject, verbose: boolean) {
  phase("Résultat de la génération");

  log(`  ${BOLD}Fichiers générés${RESET}  : ${project.files.length}`);
  log(`  ${BOLD}Multi-tech${RESET}        : ${project.multiTechFiles.length}`);
  log(`  ${BOLD}Warnings${RESET}          : ${project.warnings.length}`);

  if (verbose && project.warnings.length > 0) {
    for (const w of project.warnings) {
      warn(`  ${w}`);
    }
  }

  if (verbose) {
    log(`\n  ${BOLD}Fichiers :${RESET}`);
    for (const f of project.files) {
      detail(`${f.path} (${f.type})`);
    }
    for (const f of project.multiTechFiles) {
      detail(`${f.filePath} (multi-tech)`);
    }
  }
}

function printCompilationSummary(result: LoopResult, verbose: boolean) {
  phase("Résultat de la compilation");

  const statusColor = result.status === "SUCCESS" || result.status === "FIXED" ? GREEN : result.status === "PARTIAL" ? YELLOW : RED;
  log(`  ${BOLD}Statut${RESET}            : ${statusColor}${result.status}${RESET}`);
  log(`  ${BOLD}Tentatives${RESET}        : ${result.totalAttempts}`);
  log(`  ${BOLD}Erreurs restantes${RESET} : ${result.finalErrors.length}`);

  const totalFixes = result.iterations.reduce((sum, it) => sum + it.errorsFixed, 0);
  log(`  ${BOLD}Corrections${RESET}       : ${totalFixes}`);

  if (verbose && result.iterations.length > 0) {
    for (const it of result.iterations) {
      if (it.fixes.length > 0) {
        log(`\n  ${BOLD}Tentative ${it.attempt} :${RESET}`);
        for (const fix of it.fixes) {
          detail(`${fix.file}: ${fix.description}`);
        }
      }
    }
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();

  if (args.command === "help" || args.command === "--help" || args.command === "-h") {
    printHelp();
    return;
  }

  if (args.command !== "migrate") {
    error(`Commande inconnue: ${args.command}`);
    printHelp();
    process.exit(1);
  }

  if (!args.repo && !args.zip) {
    error("Spécifiez --repo <url> ou --zip <path>");
    process.exit(1);
  }

  // ─── Banner ─────────────────────────────────────────────────────────────

  log(`\n${BOLD}${CYAN}╔══════════════════════════════════════════╗${RESET}`);
  log(`${BOLD}${CYAN}║  Compleo CLI v4.0 — Migration Autonome   ║${RESET}`);
  log(`${BOLD}${CYAN}╚══════════════════════════════════════════╝${RESET}\n`);

  if (args.dryRun) {
    warn("Mode --dry-run : analyse uniquement, pas de génération ni push");
  }

  const startTime = Date.now();

  // ─── Phase 1: Load sources ──────────────────────────────────────────────

  phase("Chargement des sources");

  let files: SourceFile[];
  let projectName = args.project || "migration";

  if (args.zip) {
    info(`Extraction du ZIP: ${args.zip}`);
    if (!fs.existsSync(args.zip)) {
      error(`Fichier introuvable: ${args.zip}`);
      process.exit(1);
    }
    files = readZipFiles(args.zip);
    if (!args.project) {
      projectName = path.basename(args.zip, ".zip");
    }
  } else if (args.repo) {
    info(`Clonage du repository: ${args.repo}`);
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "compleo-git-"));
    const cloneCmd = args.token
      ? `git clone --depth 1 --branch ${args.branch} https://${args.token}@${args.repo.replace(/^https?:\/\//, "")} "${tmpDir}"`
      : `git clone --depth 1 --branch ${args.branch} "${args.repo}" "${tmpDir}"`;

    try {
      execSync(cloneCmd, { stdio: args.verbose ? "inherit" : "pipe" });
    } catch (err) {
      error(`Échec du clonage: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }

    files = readSourceFiles(tmpDir);
    if (!args.project) {
      projectName = path.basename(args.repo, ".git");
    }

    // Cleanup
    try { execSync(`rm -rf "${tmpDir}"`); } catch { /* ignore */ }
  } else {
    files = [];
  }

  success(`${files.length} fichiers chargés`);

  if (files.length === 0) {
    error("Aucun fichier source trouvé");
    process.exit(1);
  }

  // ─── Phase 2: Analyze ──────────────────────────────────────────────────

  phase("Analyse du projet");

  const engine = new CompleoEngine();
  const pomFile = files.find((f) => f.path.endsWith("pom.xml"));
  const bianFile = files.find((f) => f.path.endsWith("bian.yml") || f.path.endsWith("bian.yaml"));

  const analysis = await engine.analyze(files, {
    pomXml: pomFile?.content,
    bianYml: bianFile?.content,
    projectName,
  });

  printAnalysisSummary(analysis, args.verbose);

  if (args.dryRun) {
    log(`\n${BOLD}${BLUE}─── Mode dry-run : arrêt après l'analyse ───${RESET}\n`);
    const elapsed = Date.now() - startTime;
    info(`Durée totale: ${formatElapsed(elapsed)}`);
    return;
  }

  // ─── Phase 3: Resolve ambiguities ──────────────────────────────────────

  if (analysis.ambiguities.length > 0) {
    if (args.autoResolve) {
      info(`Auto-résolution de ${analysis.ambiguities.length} ambiguïtés`);
    } else {
      warn(`${analysis.ambiguities.length} ambiguïtés détectées — utilisez --auto-resolve pour les résoudre automatiquement`);
      warn("Utilisation des recommandations par défaut...");
    }
  }

  // ─── Phase 4: Generate ─────────────────────────────────────────────────

  phase("Génération du projet Spring Boot");

  // Apply ambiguity choices (auto-resolve or recommendations)
  const choiceList = analysis.ambiguities.map((a) => ({
    ambiguityId: a.id,
    choiceId: a.recommendation,
  }));

  const userChoices = choiceList.length > 0 ? { choices: choiceList } : undefined;
  const project = await engine.generate(
    analysis.ir,
    userChoices,
    analysis.ambiguities.length > 0 ? analysis.ambiguities : undefined,
    analysis.multiTech.generatedFiles.length > 0 ? analysis.multiTech.generatedFiles : undefined
  );

  printGenerationSummary(project, args.verbose);

  // ─── Phase 5: Compilation loop ─────────────────────────────────────────

  phase("Boucle de compilation");

  const compilationLoop = new CompilationLoop();
  const allFiles = [
    ...project.files.map((f) => ({
      path: f.path,
      content: f.content,
      category: f.type as string,
    })),
    ...project.multiTechFiles
      .filter((f) => f.filePath)
      .map((f) => ({
        path: f.filePath,
        content: f.content,
        category: "multi-tech",
      })),
  ];

  const compilationResult = await compilationLoop.run(allFiles, args.maxAttempts);

  printCompilationSummary(compilationResult, args.verbose);

  // ─── Phase 6: Write output ─────────────────────────────────────────────

  phase("Écriture des fichiers");

  const outputDir = path.resolve(args.output);
  fs.mkdirSync(outputDir, { recursive: true });

  let writtenCount = 0;

  // Write compiled files (from compilation loop result)
  for (const file of compilationResult.project) {
    const filePath = path.join(outputDir, file.path);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, file.content, "utf-8");
    writtenCount++;
    if (args.verbose) detail(`Écrit: ${file.path}`);
  }

  // Write migration report
  if (project.migrationReport) {
    const reportPath = path.join(outputDir, "MIGRATION_REPORT.md");
    fs.writeFileSync(reportPath, project.migrationReport, "utf-8");
    writtenCount++;
    if (args.verbose) detail("Écrit: MIGRATION_REPORT.md");
  }

  success(`${writtenCount} fichiers écrits dans ${outputDir}`);

  // ─── Summary ───────────────────────────────────────────────────────────

  const elapsed = Date.now() - startTime;

  log(`\n${BOLD}${GREEN}╔══════════════════════════════════════════╗${RESET}`);
  log(`${BOLD}${GREEN}║  Migration terminée avec succès           ║${RESET}`);
  log(`${BOLD}${GREEN}╚══════════════════════════════════════════╝${RESET}\n`);

  log(`  ${BOLD}Projet${RESET}            : ${projectName}`);
  log(`  ${BOLD}Sources${RESET}           : ${files.length} fichiers`);
  log(`  ${BOLD}Générés${RESET}           : ${writtenCount} fichiers`);
  log(`  ${BOLD}Compilation${RESET}       : ${compilationResult.status} (${compilationResult.totalAttempts} tentatives)`);
  const summaryFixes = compilationResult.iterations.reduce((sum: number, it: any) => sum + it.errorsFixed, 0);
  log(`  ${BOLD}Corrections${RESET}       : ${summaryFixes}`);
  log(`  ${BOLD}Sortie${RESET}            : ${outputDir}`);
  log(`  ${BOLD}Durée${RESET}             : ${formatElapsed(elapsed)}`);
  log("");
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

function printHelp() {
  log(`
${BOLD}Compleo CLI v4.0${RESET} — Migration autonome Java legacy → Spring Boot

${BOLD}Usage:${RESET}
  npx tsx scripts/compleo-cli.ts migrate --repo <url> [options]
  npx tsx scripts/compleo-cli.ts migrate --zip <path> [options]

${BOLD}Commandes:${RESET}
  migrate     Lancer une migration complète
  help        Afficher cette aide

${BOLD}Options:${RESET}
  --repo <url>        URL du repository Git
  --zip <path>        Chemin vers un fichier ZIP local
  --token <token>     Token d'authentification Git
  --branch <branch>   Branche à cloner (défaut: main)
  --output <dir>      Répertoire de sortie (défaut: ./output)
  --project <name>    Nom du projet
  --auto-resolve      Auto-résoudre les ambiguïtés
  --dry-run           Analyse uniquement (pas de génération)
  --verbose           Logs détaillés
  --max-attempts <n>  Tentatives de compilation max (défaut: 5)

${BOLD}Exemples:${RESET}
  ${DIM}# Analyser un repo Git (dry-run)${RESET}
  npx tsx scripts/compleo-cli.ts migrate --repo https://github.com/org/legacy.git --dry-run --verbose

  ${DIM}# Migrer un ZIP avec auto-résolution${RESET}
  npx tsx scripts/compleo-cli.ts migrate --zip ./mon-projet.zip --auto-resolve --output ./spring-boot

  ${DIM}# Migrer un repo privé${RESET}
  npx tsx scripts/compleo-cli.ts migrate --repo https://github.com/org/repo.git --token ghp_xxx --branch develop
`);
}

// ─── Run ─────────────────────────────────────────────────────────────────────

main().catch((err) => {
  error(`Erreur fatale: ${err instanceof Error ? err.message : String(err)}`);
  if (err instanceof Error && err.stack) {
    log(`${DIM}${err.stack}${RESET}`);
  }
  process.exit(1);
});
