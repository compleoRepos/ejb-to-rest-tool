/**
 * ValidationRunner — Exécute le pipeline Compleo sur chaque projet du registre,
 * vérifie les assertions structurelles, lance la compilation, et produit un rapport.
 *
 * Flux pour chaque projet :
 *   1. Charger les fichiers source
 *   2. Exécuter CompleoEngine.analyze() + generate()
 *   3. Exécuter CompilationLoop.run() (build + auto-fix)
 *   4. Vérifier les assertions structurelles
 *   5. Calculer le score
 *   6. Enregistrer le résultat dans le registre
 *
 * @since v8.7
 */

import * as fs from "fs";
import * as path from "path";
import type { ProjectRegistry, TestProject, ProjectAssertion, ValidationResult } from "./ProjectRegistry";
import type { SourceFile, GeneratedProject } from "../../engine/CompleoEngine";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ValidationOptions {
  /** Projets à valider : "ALL", "REFERENCE", "GENERATED", ou un ID spécifique */
  projects: string;
  /** Nombre max de tentatives de build */
  maxBuildRetries: number;
  /** Arrêter au premier échec */
  stopOnFirstFail: boolean;
  /** Comparer avec le dernier snapshot */
  compareWithLast: boolean;
}

export interface ProjectValidationResult {
  projectId: string;
  projectName: string;
  projectType: string;
  /** Étapes du pipeline */
  analysisSuccess: boolean;
  generationSuccess: boolean;
  buildSuccess: boolean;
  buildAttempts: number;
  buildErrorsFixed: number;
  /** Assertions */
  assertionResults: AssertionResult[];
  assertionsPassed: number;
  assertionsTotal: number;
  /** Score (0-100) */
  score: number;
  /** Régressions détectées */
  regressions: string[];
  /** Fichiers générés */
  filesGenerated: number;
  /** Erreur fatale */
  error?: string;
  /** Durée en ms */
  durationMs: number;
}

export interface AssertionResult {
  assertion: ProjectAssertion;
  passed: boolean;
  actual?: string | number;
  message: string;
}

export interface ValidationReport {
  /** Date de la validation */
  date: string;
  /** Résultats par projet */
  results: ProjectValidationResult[];
  /** Résumé global */
  summary: {
    total: number;
    passed: number;
    failed: number;
    avgScore: number;
    totalBuildErrors: number;
    totalAutoFixed: number;
    totalRegressions: number;
    durationMs: number;
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Charger les fichiers source d'un projet depuis le disque.
 */
export function loadSourceFiles(projectPath: string): SourceFile[] {
  const files: SourceFile[] = [];
  const absPath = path.resolve(projectPath);

  if (!fs.existsSync(absPath)) {
    return files;
  }

  function walk(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "target") continue;
        walk(fullPath);
      } else if (entry.name.endsWith(".java") || entry.name === "pom.xml" || entry.name.endsWith(".yml") || entry.name.endsWith(".yaml")) {
        const relativePath = path.relative(absPath, fullPath);
        files.push({
          path: relativePath,
          content: fs.readFileSync(fullPath, "utf-8"),
        });
      }
    }
  }

  walk(absPath);
  return files;
}

/**
 * Extraire le pom.xml des fichiers source.
 */
function extractPomXml(files: SourceFile[]): string | undefined {
  const pom = files.find((f) => f.path.endsWith("pom.xml"));
  return pom?.content;
}

/**
 * Vérifier une assertion structurelle sur le projet généré.
 */
export function checkAssertion(
  assertion: ProjectAssertion,
  generatedFiles: { path: string; content: string }[]
): AssertionResult {
  const javaFiles = generatedFiles.filter((f) => f.path.endsWith(".java"));
  const allContent = javaFiles.map((f) => f.content).join("\n");

  switch (assertion.type) {
    case "MIN_SERVICES": {
      const serviceFiles = javaFiles.filter(
        (f) => f.path.includes("Service.java") && f.content.includes("@Service")
      );
      const count = serviceFiles.length;
      const expected = Number(assertion.expected);
      return {
        assertion,
        passed: count >= expected,
        actual: count,
        message: count >= expected
          ? `${count} services trouvés (min: ${expected})`
          : `Seulement ${count} services (attendu min: ${expected})`,
      };
    }

    case "MIN_DTOS": {
      const dtoFiles = javaFiles.filter(
        (f) => f.path.includes("DTO") || f.path.includes("Dto") || f.path.includes("Request") || f.path.includes("Response")
      );
      const count = dtoFiles.length;
      const expected = Number(assertion.expected);
      return {
        assertion,
        passed: count >= expected,
        actual: count,
        message: count >= expected
          ? `${count} DTOs trouvés (min: ${expected})`
          : `Seulement ${count} DTOs (attendu min: ${expected})`,
      };
    }

    case "MIN_CONTROLLERS": {
      const controllerFiles = javaFiles.filter(
        (f) => f.path.includes("Controller.java") && f.content.includes("@RestController")
      );
      const count = controllerFiles.length;
      const expected = Number(assertion.expected);
      return {
        assertion,
        passed: count >= expected,
        actual: count,
        message: count >= expected
          ? `${count} controllers trouvés (min: ${expected})`
          : `Seulement ${count} controllers (attendu min: ${expected})`,
      };
    }

    case "MIN_FILES": {
      const count = javaFiles.length;
      const expected = Number(assertion.expected);
      return {
        assertion,
        passed: count >= expected,
        actual: count,
        message: count >= expected
          ? `${count} fichiers Java (min: ${expected})`
          : `Seulement ${count} fichiers (attendu min: ${expected})`,
      };
    }

    case "PATTERN_ABSENT": {
      const pattern = String(assertion.expected);
      const found = javaFiles.some((f) => f.content.includes(pattern));
      return {
        assertion,
        passed: !found,
        actual: found ? "trouvé" : "absent",
        message: found
          ? `Pattern interdit "${pattern}" trouvé dans le code généré`
          : `Pattern "${pattern}" correctement absent`,
      };
    }

    case "PATTERN_PRESENT": {
      const pattern = String(assertion.expected);
      const found = javaFiles.some((f) => f.content.includes(pattern));
      return {
        assertion,
        passed: found,
        actual: found ? "trouvé" : "absent",
        message: found
          ? `Pattern "${pattern}" correctement présent`
          : `Pattern attendu "${pattern}" non trouvé`,
      };
    }

    case "HAS_DOMAIN": {
      const domain = String(assertion.expected).toLowerCase();
      const found = javaFiles.some(
        (f) => f.path.toLowerCase().includes(domain) || f.content.toLowerCase().includes(domain)
      );
      return {
        assertion,
        passed: found,
        actual: found ? "trouvé" : "absent",
        message: found
          ? `Domaine "${domain}" détecté`
          : `Domaine "${domain}" non trouvé`,
      };
    }

    case "BUILD_SUCCESS": {
      // Vérifié séparément par le build loop
      return {
        assertion,
        passed: true, // Placeholder — sera mis à jour après le build
        actual: "pending",
        message: "Vérifié après compilation",
      };
    }

    default:
      return {
        assertion,
        passed: false,
        message: `Type d'assertion inconnu: ${assertion.type}`,
      };
  }
}

/**
 * Calculer le score d'un projet (0-100).
 */
export function calculateScore(
  analysisOk: boolean,
  generationOk: boolean,
  buildOk: boolean,
  assertionsPassed: number,
  assertionsTotal: number,
  regressionCount: number
): number {
  let score = 0;

  // Analyse réussie : 20 points
  if (analysisOk) score += 20;

  // Génération réussie : 20 points
  if (generationOk) score += 20;

  // Build réussi : 30 points
  if (buildOk) score += 30;

  // Assertions : 20 points proportionnels
  if (assertionsTotal > 0) {
    score += Math.round((assertionsPassed / assertionsTotal) * 20);
  } else {
    score += 20;
  }

  // Bonus : 10 points si 0 régression
  if (regressionCount === 0) score += 10;

  return Math.min(100, Math.max(0, score));
}

// ─── ValidationRunner ───────────────────────────────────────────────────────

export class ValidationRunner {
  private registry: ProjectRegistry;

  constructor(registry: ProjectRegistry) {
    this.registry = registry;
  }

  /**
   * Exécuter la validation sur les projets sélectionnés.
   */
  async runValidation(options: ValidationOptions): Promise<ValidationReport> {
    const startTime = Date.now();
    const projects = this.selectProjects(options.projects);
    const results: ProjectValidationResult[] = [];

    for (const project of projects) {
      const result = await this.validateProject(project, options);
      results.push(result);

      // Enregistrer le résultat dans le registre
      const validationResult: ValidationResult = {
        date: new Date().toISOString(),
        score: result.score,
        buildSuccess: result.buildSuccess,
        buildErrors: result.buildAttempts > 1 ? result.buildErrorsFixed : 0,
        autoFixedErrors: result.buildErrorsFixed,
        assertionsPassed: result.assertionsPassed,
        assertionsTotal: result.assertionsTotal,
        failedAssertions: result.assertionResults
          .filter((a) => !a.passed)
          .map((a) => a.message),
        regressions: result.regressions,
        filesGenerated: result.filesGenerated,
      };
      this.registry.recordResult(project.id, validationResult);

      if (options.stopOnFirstFail && result.score < 50) {
        break;
      }
    }

    const totalDuration = Date.now() - startTime;
    const passed = results.filter((r) => r.score >= 50);
    const scores = results.map((r) => r.score);

    return {
      date: new Date().toISOString(),
      results,
      summary: {
        total: results.length,
        passed: passed.length,
        failed: results.length - passed.length,
        avgScore: scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
        totalBuildErrors: results.reduce((sum, r) => sum + (r.buildAttempts > 1 ? r.buildErrorsFixed : 0), 0),
        totalAutoFixed: results.reduce((sum, r) => sum + r.buildErrorsFixed, 0),
        totalRegressions: results.reduce((sum, r) => sum + r.regressions.length, 0),
        durationMs: totalDuration,
      },
    };
  }

  /**
   * Valider un projet individuel.
   */
  private async validateProject(
    project: TestProject,
    options: ValidationOptions
  ): Promise<ProjectValidationResult> {
    const startTime = Date.now();
    let analysisSuccess = false;
    let generationSuccess = false;
    let buildSuccess = false;
    let buildAttempts = 0;
    let buildErrorsFixed = 0;
    let filesGenerated = 0;
    let assertionResults: AssertionResult[] = [];
    let regressions: string[] = [];
    let error: string | undefined;

    try {
      // 1. Charger les fichiers source
      const sourceFiles = loadSourceFiles(project.sourcePath);
      if (sourceFiles.length === 0) {
        throw new Error(`Aucun fichier source trouvé dans ${project.sourcePath}`);
      }

      const pomXml = extractPomXml(sourceFiles);

      // 2. Analyser avec CompleoEngine
      const { CompleoEngine, getEngine } = await import("../../engine/CompleoEngine");
      const engine = getEngine();
      const analysisResult = await engine.analyze(sourceFiles, {
        pomXml,
        projectName: project.id,
      });
      analysisSuccess = true;

      // 3. Générer le projet Spring Boot
      const generatedProject = await engine.generate(
        analysisResult.ir,
        undefined,
        analysisResult.ambiguities,
        analysisResult.multiTech?.generatedFiles
      );
      generationSuccess = true;
      filesGenerated = generatedProject.files.length + generatedProject.multiTechFiles.length;

      // 4. Compiler avec CompilationLoop
      const { CompilationLoop } = await import("../../agent/CompilationLoop");
      const compilationLoop = new CompilationLoop();
      const allFiles = [
        ...generatedProject.files.map((f) => ({
          path: f.path,
          content: f.content,
          category: f.category,
        })),
        ...generatedProject.multiTechFiles.map((f) => ({
          path: f.path,
          content: f.content,
          category: f.category,
        })),
      ];
      const loopResult = await compilationLoop.run(allFiles, options.maxBuildRetries);
      buildSuccess = loopResult.status === "SUCCESS" || loopResult.status === "FIXED";
      buildAttempts = loopResult.totalAttempts;
      buildErrorsFixed = loopResult.iterations.reduce((sum, it) => sum + it.errorsFixed, 0);

      // 5. Vérifier les assertions structurelles
      const filesToCheck = loopResult.project.map((f) => ({
        path: f.path,
        content: f.content,
      }));
      assertionResults = project.assertions.map((assertion) => {
        if (assertion.type === "BUILD_SUCCESS") {
          return {
            assertion,
            passed: buildSuccess,
            actual: buildSuccess ? "success" : "failed",
            message: buildSuccess ? "Build réussi" : "Build échoué",
          };
        }
        return checkAssertion(assertion, filesToCheck);
      });

      // 6. Détection de régressions (si snapshot précédent existe)
      if (options.compareWithLast && project.lastSnapshotPath) {
        try {
          const { detectRegressions } = await import("./RegressionDetector");
          const currentOutput = new Map<string, string>();
          for (const f of loopResult.project) {
            currentOutput.set(f.path, f.content);
          }
          regressions = await detectRegressions(currentOutput, project.lastSnapshotPath);
        } catch {
          // Pas de snapshot précédent — pas de régression
        }
      }

      // 7. Sauvegarder le snapshot si build réussi
      if (buildSuccess) {
        const snapshotDir = `./data/snapshots/${project.id}`;
        if (!fs.existsSync(snapshotDir)) {
          fs.mkdirSync(snapshotDir, { recursive: true });
        }
        const snapshotData = new Map<string, string>();
        for (const f of loopResult.project) {
          snapshotData.set(f.path, f.content);
        }
        fs.writeFileSync(
          path.join(snapshotDir, "snapshot.json"),
          JSON.stringify(Object.fromEntries(snapshotData), null, 2),
          "utf-8"
        );
        this.registry.setSnapshotPath(project.id, path.join(snapshotDir, "snapshot.json"));
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }

    const assertionsPassed = assertionResults.filter((a) => a.passed).length;
    const assertionsTotal = assertionResults.length;
    const score = calculateScore(
      analysisSuccess,
      generationSuccess,
      buildSuccess,
      assertionsPassed,
      assertionsTotal,
      regressions.length
    );

    return {
      projectId: project.id,
      projectName: project.name,
      projectType: project.type,
      analysisSuccess,
      generationSuccess,
      buildSuccess,
      buildAttempts,
      buildErrorsFixed,
      assertionResults,
      assertionsPassed,
      assertionsTotal,
      score,
      regressions,
      filesGenerated,
      error,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Sélectionner les projets à valider.
   */
  private selectProjects(selector: string): TestProject[] {
    switch (selector.toUpperCase()) {
      case "ALL":
        return this.registry.getAll();
      case "REFERENCE":
        return this.registry.getByType("REFERENCE");
      case "GENERATED":
        return this.registry.getByType("GENERATED");
      default:
        // Chercher par ID
        const project = this.registry.get(selector);
        return project ? [project] : [];
    }
  }
}

/**
 * Générer un rapport Markdown à partir du ValidationReport.
 */
export function generateMarkdownReport(report: ValidationReport): string {
  const lines: string[] = [];
  lines.push("# Rapport de Validation COMPLEO");
  lines.push("");
  lines.push(`**Date** : ${report.date}`);
  lines.push(`**Projets testés** : ${report.summary.total}`);
  lines.push(`**Score moyen** : ${report.summary.avgScore}/100`);
  lines.push(`**Réussis** : ${report.summary.passed}/${report.summary.total}`);
  lines.push(`**Durée totale** : ${(report.summary.durationMs / 1000).toFixed(1)}s`);
  lines.push("");

  // Tableau résumé
  lines.push("## Résumé par projet");
  lines.push("");
  lines.push("| Projet | Type | Score | Analyse | Génération | Build | Assertions | Régressions |");
  lines.push("|--------|------|-------|---------|------------|-------|------------|-------------|");
  for (const r of report.results) {
    const ok = (b: boolean) => (b ? "OK" : "FAIL");
    lines.push(
      `| ${r.projectName} | ${r.projectType} | ${r.score}/100 | ${ok(r.analysisSuccess)} | ${ok(r.generationSuccess)} | ${ok(r.buildSuccess)} | ${r.assertionsPassed}/${r.assertionsTotal} | ${r.regressions.length} |`
    );
  }
  lines.push("");

  // Détails par projet
  for (const r of report.results) {
    lines.push(`## ${r.projectName}`);
    lines.push("");
    lines.push(`- **Score** : ${r.score}/100`);
    lines.push(`- **Fichiers générés** : ${r.filesGenerated}`);
    lines.push(`- **Build** : ${r.buildSuccess ? "OK" : "FAIL"} (${r.buildAttempts} tentative(s), ${r.buildErrorsFixed} erreurs corrigées)`);
    lines.push(`- **Durée** : ${(r.durationMs / 1000).toFixed(1)}s`);

    if (r.error) {
      lines.push(`- **Erreur** : ${r.error}`);
    }

    if (r.assertionResults.length > 0) {
      lines.push("");
      lines.push("### Assertions");
      for (const a of r.assertionResults) {
        lines.push(`- ${a.passed ? "PASS" : "FAIL"} : ${a.message}`);
      }
    }

    if (r.regressions.length > 0) {
      lines.push("");
      lines.push("### Régressions");
      for (const reg of r.regressions) {
        lines.push(`- ${reg}`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}
