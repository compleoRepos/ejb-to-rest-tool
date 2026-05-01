/**
 * CompleoEngine — Service interne unifié pour la modernisation Java legacy.
 * Encapsule le parser EJB, le générateur Spring Boot, le détecteur d'ambiguïtés,
 * et le pipeline multi-technologies en une API propre.
 *
 * Interface publique :
 *   analyze(files)           → ProjectIR + ambiguïtés + multi-tech
 *   generate(ir, choices?)   → GeneratedProject (fichiers + rapport)
 *   validate(project)        → ValidationResult (syntaxe, imports, types)
 *
 * Les endpoints REST existants (/api/compleo/*) délèguent à cette classe.
 * L'IHM ne change pas. Zéro régression.
 *
 * @author Compleo
 */

import { parseEjbProject, type ProjectIR } from "../java-parser";
import {
  generateSpringBootProject,
  type GenerationResult,
  type MigrationReportContext,
} from "../spring-generator";
import {
  detectAmbiguities,
  applyChoicesToIR,
  type Ambiguity,
  type UserChoice,
} from "../ambiguity-detector";
import { runPipeline, type PipelineResult, type MaturityScore } from "./pipeline/index";
import { registerAllDetectors } from "./detectors/index";
import { registerAllGenerators } from "./generators/index";
import { registry } from "./registry/index";
import type { DetectedComponent, GeneratedFile, TechnologyType, ValidationResult } from "./registry/types";
import { JdbcPostProcessor, countUnresolvedPlaceholders } from "./llm/JdbcPostProcessor";
import type { JdbcBlock } from "./BusinessLogicTransformer";

// ─── Types publics ────────────────────────────────────────────────────────────

export interface SourceFile {
  path: string;
  content: string;
}

export interface AnalysisResult {
  /** EJB-specific IR (backward compat) */
  ir: ProjectIR;
  /** Ambiguïtés détectées */
  ambiguities: Ambiguity[];
  /** Résultats multi-technologies (v3.0) */
  multiTech: {
    technologiesDetected: TechnologyType[];
    detectedComponents: DetectedComponent[];
    generatedFiles: GeneratedFile[];
    maturityScore: MaturityScore | undefined;
    stats: PipelineResult["stats"];
    migrationNotes: PipelineResult["migrationNotes"];
  };
  /** Résumé rapide */
  summary: {
    useCaseCount: number;
    dtoCount: number;
    enumCount: number;
    exceptionCount: number;
    componentCount: number;
    technologyCount: number;
    hasAmbiguities: boolean;
    ambiguityCount: number;
  };
  /** v10.5b: Insights IA (null si LLM non disponible) */
  aiInsights?: import("./analysis/AnalysisLLMEnricher").AIAnalysisInsights | null;
}

export interface GeneratedProject {
  /** Fichiers générés (EJB pipeline) */
  files: GenerationResult["files"];
  /** Statistiques de génération */
  stats: GenerationResult["stats"];
  /** Warnings de génération */
  warnings: string[];
  /** Rapport de migration (contenu Markdown) */
  migrationReport: string;
  /** Fichiers multi-tech (si disponibles) */
  multiTechFiles: GeneratedFile[];
}

export interface UserChoices {
  choices: UserChoice[];
}

export interface EngineValidationResult {
  /** Résultat de validation multi-tech */
  multiTech: ValidationResult;
  /** Vérifications EJB spécifiques */
  ejb: {
    hasObjectTypes: boolean;
    objectCount: number;
    hasDuplicateImports: boolean;
    duplicateImportCount: number;
    hasVoidIssues: boolean;
    syntaxErrors: string[];
  };
  /** Score global (0-100) */
  score: number;
  /** Statut */
  status: "PASS" | "WARN" | "FAIL";
}

// ─── Moteur ───────────────────────────────────────────────────────────────────

export class CompleoEngine {
  private initialized = false;

  constructor() {
    this.ensureInitialized();
  }

  /**
   * Enregistre les détecteurs et générateurs multi-tech.
   * Idempotent — ne s'exécute qu'une fois.
   */
  private ensureInitialized(): void {
    if (this.initialized) return;
    registerAllDetectors(registry);
    registerAllGenerators(registry);
    this.initialized = true;
  }

  // ─── analyze ──────────────────────────────────────────────────────────────

  /**
   * Analyse un ensemble de fichiers source Java.
   * Retourne l'IR EJB, les ambiguïtés, et les résultats multi-technologies.
   */
  async analyze(
    files: SourceFile[],
    options?: {
      pomXml?: string;
      bianYml?: string;
      projectName?: string;
    }
  ): Promise<AnalysisResult> {
    const pomXml = options?.pomXml;
    const bianYml = options?.bianYml;
    const projectName = options?.projectName || "unknown";

    // 1. Parse EJB (backward compat)
    const ir = parseEjbProject(files, pomXml, bianYml);

    // 2. Detect ambiguities
    const ambiguities = detectAmbiguities(ir);

    // 3. Run multi-tech pipeline — align basePackage with Spring generator (groupId + artifactId)
    let basePackage = "com.app";
    if (pomXml) {
      const groupMatch = pomXml.match(/<groupId>([^<]+)<\/groupId>/);
      const artifactMatch = pomXml.match(/<artifactId>([^<]+)<\/artifactId>/);
      if (groupMatch) {
        basePackage = groupMatch[1];
        if (artifactMatch) {
          const normalizedArtifact = artifactMatch[1].replace(/-/g, "");
          basePackage = `${groupMatch[1]}.${normalizedArtifact}`;
        }
      }
    }

    const pipelineResult = runPipeline({
      files,
      basePackage,
      projectName,
    });

    const result: AnalysisResult = {
      ir,
      ambiguities,
      multiTech: {
        technologiesDetected: pipelineResult.technologiesDetected,
        detectedComponents: pipelineResult.detectedComponents,
        generatedFiles: pipelineResult.generatedFiles,
        maturityScore: pipelineResult.maturityScore,
        stats: pipelineResult.stats,
        migrationNotes: pipelineResult.migrationNotes,
      },
      summary: {
        useCaseCount: ir.stats.useCaseCount,
        dtoCount: ir.stats.dtoCount,
        enumCount: ir.stats.enumCount,
        exceptionCount: ir.stats.exceptionCount,
        componentCount: pipelineResult.detectedComponents.length,
        technologyCount: pipelineResult.technologiesDetected.length,
        hasAmbiguities: ambiguities.length > 0,
        ambiguityCount: ambiguities.length,
      },
    };

    // v10.12: Le mapping standard métier (BIAN, ACORD, HL7/FHIR, TMForum, DDD, TOGAF)
    // est maintenant conditionnel au choix de l'utilisateur dans l'IHM.
    // Il est exécuté dans la phase GENERATING du CompleoAgent, pas ici.

    // v10.6: Cache des insights IA (hash-based) + enrichissement + validation
    try {
      const { getInsightsCache } = await import("./analysis/InsightsCache");
      const cache = getInsightsCache();
      const sourceHash = cache.computeHash(files);

      // Check cache first
      const cached = cache.get(sourceHash);
      if (cached) {
        console.log(`[CompleoEngine] AI insights cache HIT for ${projectName} (hash: ${sourceHash.slice(0, 8)}...)`);
        result.aiInsights = cached;
      } else {
        // Cache miss → appeler le LLM
        const { AnalysisLLMEnricher } = await import("./analysis/AnalysisLLMEnricher");
        const { validateInsights } = await import("./analysis/AnalysisInsightValidator");
        const enricher = new AnalysisLLMEnricher();
        const rawInsights = await enricher.enrich(result, ir);
        if (rawInsights) {
          const { validated, report } = validateInsights(rawInsights as any, ir);
          result.aiInsights = validated as any;
          // Stocker dans le cache
          cache.set(sourceHash, result.aiInsights as any, projectName);
          console.log(`[CompleoEngine] AI insights cache MISS for ${projectName} — stored (hash: ${sourceHash.slice(0, 8)}..., ${report.passedChecks}/${report.totalChecks} checks passed)`);
        } else {
          result.aiInsights = null;
        }
      }
    } catch (err) {
      console.warn("[CompleoEngine] AI enrichment failed (non-blocking):", err);
      result.aiInsights = null;
    }

    return result;
  }

  // ─── generate ─────────────────────────────────────────────────────────────

  /**
   * Génère le projet Spring Boot à partir de l'IR.
   * Si des choix utilisateur sont fournis, les applique d'abord.
   */
  async generate(
    ir: ProjectIR,
    choices?: UserChoices,
    ambiguities?: Ambiguity[],
    multiTechFiles?: GeneratedFile[]
  ): Promise<GeneratedProject> {
    let irToUse = ir;

    // Appliquer les choix utilisateur si fournis
    if (choices && choices.choices.length > 0 && ambiguities) {
      irToUse = applyChoicesToIR(ir, ambiguities, choices.choices);
    }

    // Construire le contexte du rapport
    const reportContext: MigrationReportContext | undefined =
      ambiguities && choices
        ? {
            ambiguities: ambiguities.map((a) => ({
              id: a.id,
              type: a.type,
              severity: a.severity as string,
              question: a.question,
              affectedClass: a.context?.className ?? "Unknown",
              recommendation: a.recommendation,
              recommendationReason: a.recommendationReason,
              options: a.options.map((o) => ({ id: o.id, label: o.label })),
            })),
            userChoices: choices.choices.map((c) => ({
              ambiguityId: c.ambiguityId,
              selectedOptionId: c.choiceId,
            })),
            userResolvedCount: choices.choices.length,
            autoResolvedCount: (ambiguities?.length || 0) - choices.choices.length,
          }
        : undefined;

    // Générer le projet Spring Boot
    const result = generateSpringBootProject(irToUse, reportContext);

    // Extraire le rapport de migration du fichier généré
    const reportFile = result.files.find(
      (f) => f.path.includes("MIGRATION_REPORT") || f.path.includes("migration-report")
    );
    const migrationReport = reportFile?.content || "";

    return {
      files: result.files,
      stats: result.stats,
      warnings: result.warnings,
      migrationReport,
      multiTechFiles: multiTechFiles || [],
    };
  }

  // ─── postProcessJdbc ──────────────────────────────────────────────────────

  /**
   * Post-traite les fichiers générés pour migrer les blocs JDBC via LLM.
   * Remplace les placeholders @@JDBC_LLM_BLOCK_*@@ et @@DAO_LLM_BLOCK_*@@
   * par du code Spring Data JPA migré.
   *
   * Appeler après generate() pour obtenir un projet complet.
   * Si le LLM est indisponible, un fallback rule-based amélioré est utilisé.
   *
   * @since v10.15
   */
  async postProcessJdbc(project: GeneratedProject, ir?: ProjectIR): Promise<{
    migratedCount: number;
    fallbackCount: number;
    warnings: string[];
  }> {
    const allFiles = [...project.files, ...project.multiTechFiles];
    const placeholderCount = countUnresolvedPlaceholders(
      allFiles.map(f => ({ path: f.path, content: f.content }))
    );

    if (placeholderCount === 0) {
      return { migratedCount: 0, fallbackCount: 0, warnings: [] };
    }

    const postProcessor = new JdbcPostProcessor();
    const jdbcBlocks: JdbcBlock[] = [];

    // Identifier les fichiers Entity et Repository pour le contexte LLM
    const entityFiles = allFiles
      .filter(f => f.path.includes("/entity/") || f.path.includes("/model/"))
      .map(f => ({ path: f.path, content: f.content }));
    const repositoryFiles = allFiles
      .filter(f => f.path.includes("/repository/"))
      .map(f => ({ path: f.path, content: f.content }));

    // Déterminer le basePackage
    const basePackage = ir?.groupId
      ? `${ir.groupId}.${ir.artifactId?.replace(/-/g, "") || "app"}`
      : "com.example.app";

    const result = await postProcessor.processAll(
      allFiles.map(f => ({ path: f.path, content: f.content, category: (f as any).category })),
      jdbcBlocks,
      basePackage,
      entityFiles,
      repositoryFiles,
    );

    // Mettre à jour les fichiers du projet avec le code migré
    const fileMap = new Map(result.files.map(f => [f.path, f.content]));
    for (const file of project.files) {
      const migrated = fileMap.get(file.path);
      if (migrated) file.content = migrated;
    }
    for (const file of project.multiTechFiles) {
      const migrated = fileMap.get(file.path);
      if (migrated) file.content = migrated;
    }

    return {
      migratedCount: result.migratedCount,
      fallbackCount: result.fallbackCount,
      warnings: result.warnings,
    };
  }

  // ─── validate ─────────────────────────────────────────────────────────────

  /**
   * Valide un projet généré : syntaxe, imports, types, duplications.
   */
  async validate(project: GeneratedProject): Promise<EngineValidationResult> {
    // Validation multi-tech
    const generatedFiles: GeneratedFile[] = project.files.map((f) => ({
      path: f.path,
      content: f.content,
      category: f.category,
      technology: "EJB_3X_STATELESS" as TechnologyType,
    }));
    const multiTechValidation = registry.validateAll(generatedFiles);

    // Validation EJB spécifique
    let objectCount = 0;
    let duplicateImportCount = 0;
    let hasVoidIssues = false;
    const syntaxErrors: string[] = [];

    for (const file of project.files) {
      if (!file.path.endsWith(".java")) continue;
      const content = file.content;

      // Compter les types Object (hors commentaires et strings)
      const lines = content.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;
        // Object comme type de retour ou paramètre (pas dans les strings)
        const objectMatches = trimmed.match(/\bObject\b/g);
        if (objectMatches) {
          // Exclure les cas légitimes (Object.class, instanceof Object, etc.)
          const filtered = objectMatches.filter(() => {
            return !trimmed.includes("Object.class") &&
                   !trimmed.includes("instanceof Object") &&
                   !trimmed.includes("// TODO") &&
                   !trimmed.includes("Map<String, Object>");
          });
          objectCount += filtered.length;
        }
      }

      // Détecter les imports dupliqués
      const imports = lines.filter((l) => l.trim().startsWith("import "));
      const importSet = new Set<string>();
      for (const imp of imports) {
        if (importSet.has(imp.trim())) {
          duplicateImportCount++;
        }
        importSet.add(imp.trim());
      }

      // Détecter les problèmes Void
      if (content.includes("Void") && !content.includes("java.lang.Void")) {
        // Check if Void is used as a type parameter (acceptable) vs as a return type (issue)
        const voidAsReturn = lines.some(
          (l) => l.match(/public\s+Void\s+/) && !l.includes("ResponseEntity<Void>")
        );
        if (voidAsReturn) hasVoidIssues = true;
      }

      // Vérification syntaxique basique
      let braceCount = 0;
      for (const line of lines) {
        for (const ch of line) {
          if (ch === "{") braceCount++;
          if (ch === "}") braceCount--;
        }
      }
      if (braceCount !== 0) {
        syntaxErrors.push(`${file.path}: accolades non équilibrées (${braceCount > 0 ? "manquantes" : "en trop"})`);
      }
    }

    // Score global
    let score = 100;
    if (objectCount > 0) score -= Math.min(20, objectCount * 5);
    if (duplicateImportCount > 0) score -= Math.min(10, duplicateImportCount * 2);
    if (hasVoidIssues) score -= 10;
    if (syntaxErrors.length > 0) score -= Math.min(30, syntaxErrors.length * 10);
    if (!multiTechValidation.valid) score -= 15;
    score = Math.max(0, score);

    const status: EngineValidationResult["status"] =
      score >= 90 ? "PASS" : score >= 60 ? "WARN" : "FAIL";

    return {
      multiTech: multiTechValidation,
      ejb: {
        hasObjectTypes: objectCount > 0,
        objectCount,
        hasDuplicateImports: duplicateImportCount > 0,
        duplicateImportCount,
        hasVoidIssues,
        syntaxErrors,
      },
      score,
      status,
    };
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let _instance: CompleoEngine | null = null;

export function getEngine(): CompleoEngine {
  if (!_instance) {
    _instance = new CompleoEngine();
  }
  return _instance;
}
