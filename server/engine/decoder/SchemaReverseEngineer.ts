/**
 * SchemaReverseEngineer v13.13 — Orchestrator for the full schema reverse-engineering pipeline.
 *
 * Chains:
 *   1. FieldUsageAnalyzer → raw field usage collection
 *   2. SemanticInferenceEngine → LLM + heuristic meaning inference
 *   3. CrossProjectCorrelator → cross-project validation (multi-project mode)
 *   4. OrphanFieldDetector → dead/orphan field detection
 *   5. GlossaryGenerator → HTML/CSV/JSON glossary output
 *
 * Also maintains backward compatibility with the existing SchemaDecoder API
 * by producing a SchemaDecoderResult alongside the enriched outputs.
 *
 * @author Hamza NORDINE — Compleo
 */

import { FieldUsageAnalyzer, type FieldUsageAnalysisResult } from "./FieldUsageAnalyzer";
import { SemanticInferenceEngine, type SemanticInferenceResult } from "./SemanticInferenceEngine";
import { CrossProjectCorrelator, type CrossProjectCorrelationResult } from "./CrossProjectCorrelator";
import { OrphanFieldDetector, type OrphanDetectionResult } from "./OrphanFieldDetector";
import { GlossaryGenerator, type GlossaryOutput } from "./GlossaryGenerator";
import { decodeSchema, type SchemaDecoderResult } from "./SchemaDecoder";

// ─── Interfaces ─────────────────────────────────────────────────────────────

export interface SchemaReverseEngineerOptions {
  /** Enable LLM-based semantic inference (default: true) */
  useLlm?: boolean;
  /** Project name for glossary header */
  projectName?: string;
  /** DDL fields for orphan detection (optional) */
  ddlFields?: { tableName: string; columnName: string }[];
}

export interface SchemaReverseEngineerResult {
  /** Backward-compatible SchemaDecoder result */
  legacyResult: SchemaDecoderResult;
  /** Phase 1: Raw field usage analysis */
  fieldUsageAnalysis: FieldUsageAnalysisResult;
  /** Phase 2: Semantic inference with confidence scores */
  semanticInference: SemanticInferenceResult;
  /** Phase 4: Orphan/dead field detection */
  orphanDetection: OrphanDetectionResult;
  /** Phase 5: Generated glossary (HTML, CSV, JSON) */
  glossary: GlossaryOutput;
  /** Total execution time in ms */
  executionTimeMs: number;
}

export interface MultiProjectSchemaResult {
  /** Per-project results */
  projects: Map<string, SchemaReverseEngineerResult>;
  /** Phase 3: Cross-project correlation */
  correlation: CrossProjectCorrelationResult;
  /** Merged glossary across all projects */
  mergedGlossary: GlossaryOutput;
  /** Total execution time in ms */
  executionTimeMs: number;
}

// ─── Single-project pipeline ────────────────────────────────────────────────

export class SchemaReverseEngineer {
  private options: SchemaReverseEngineerOptions;

  constructor(options?: SchemaReverseEngineerOptions) {
    this.options = options || {};
  }

  /**
   * Run the full schema reverse-engineering pipeline on a single project.
   */
  async analyze(
    files: { path: string; content: string }[]
  ): Promise<SchemaReverseEngineerResult> {
    const t0 = Date.now();

    // Phase 0: Legacy decoder (backward compatibility)
    const legacyResult = decodeSchema(files);

    // Phase 1: Field usage analysis
    const analyzer = new FieldUsageAnalyzer();
    const fieldUsageAnalysis = analyzer.analyze(files);

    // Phase 2: Semantic inference
    const inferenceEngine = new SemanticInferenceEngine({
      useLlm: this.options.useLlm ?? true,
    });
    const semanticInference = await inferenceEngine.infer(fieldUsageAnalysis);

    // Phase 4: Orphan detection
    const orphanDetector = new OrphanFieldDetector();
    const orphanDetection = orphanDetector.detect(
      fieldUsageAnalysis,
      semanticInference,
      this.options.ddlFields
    );

    // Phase 5: Glossary generation
    const glossaryGen = new GlossaryGenerator();
    const glossary = glossaryGen.generate(
      semanticInference,
      null, // No correlation for single project
      orphanDetection,
      this.options.projectName
    );

    return {
      legacyResult,
      fieldUsageAnalysis,
      semanticInference,
      orphanDetection,
      glossary,
      executionTimeMs: Date.now() - t0,
    };
  }

  /**
   * Run the full pipeline on multiple projects with cross-project correlation.
   */
  async analyzeMultiProject(
    projects: Map<string, { path: string; content: string }[]>
  ): Promise<MultiProjectSchemaResult> {
    const t0 = Date.now();

    // Run single-project analysis for each project
    const projectResults = new Map<string, SchemaReverseEngineerResult>();
    const projectInferences = new Map<string, SemanticInferenceResult>();

    for (const [projectName, files] of projects.entries()) {
      const engineWithName = new SchemaReverseEngineer({
        ...this.options,
        projectName,
      });
      const result = await engineWithName.analyze(files);
      projectResults.set(projectName, result);
      projectInferences.set(projectName, result.semanticInference);
    }

    // Phase 3: Cross-project correlation
    const correlator = new CrossProjectCorrelator();
    const correlation = correlator.correlate(projectInferences);

    // Merge all inferences for a combined glossary
    const allFields = Array.from(projectInferences.values())
      .flatMap(r => r.fields);
    const mergedInference: SemanticInferenceResult = {
      fields: allFields,
      stats: {
        total: allFields.length,
        high: allFields.filter(f => f.confidence === "high").length,
        medium: allFields.filter(f => f.confidence === "medium").length,
        low: allFields.filter(f => f.confidence === "low").length,
        unresolved: allFields.filter(f => f.confidence === "unresolved").length,
        llmCalls: Array.from(projectInferences.values()).reduce((s, r) => s + r.stats.llmCalls, 0),
        llmTokensUsed: 0,
      },
      executionTimeMs: 0,
    };

    // Merge orphan results
    const allOrphans = Array.from(projectResults.values())
      .flatMap(r => r.orphanDetection.orphans);
    const mergedOrphanResult: OrphanDetectionResult = {
      orphans: allOrphans,
      stats: {
        totalFieldsAnalyzed: allFields.length,
        deadFields: allOrphans.filter(o => o.category === "dead").length,
        writeOnlyFields: allOrphans.filter(o => o.category === "write-only").length,
        readOnlyFields: allOrphans.filter(o => o.category === "read-only").length,
        singleRefFields: allOrphans.filter(o => o.category === "single-ref").length,
        lowConfidenceFields: allOrphans.filter(o => o.category === "low-confidence").length,
        deprecatedFields: allOrphans.filter(o => o.category === "deprecated").length,
        healthyFields: 0,
        healthScore: 0,
      },
      executionTimeMs: 0,
    };

    // Generate merged glossary
    const glossaryGen = new GlossaryGenerator();
    const mergedGlossary = glossaryGen.generate(
      mergedInference,
      correlation,
      mergedOrphanResult,
      "Workspace Multi-Projet"
    );

    return {
      projects: projectResults,
      correlation,
      mergedGlossary,
      executionTimeMs: Date.now() - t0,
    };
  }
}
