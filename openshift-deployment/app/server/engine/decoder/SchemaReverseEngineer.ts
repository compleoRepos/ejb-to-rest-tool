/**
 * SchemaReverseEngineer v13.16 — Orchestrator for the full schema reverse-engineering pipeline.
 *
 * Chains:
 *   1. FieldUsageAnalyzer → raw field usage collection
 *   2. SemanticInferenceEngine → LLM + heuristic meaning inference
 *   3. BusinessConceptClassifier → multi-signal business concept classification (v13.15)
 *   4. LlmFieldClassifier → LLM classification for UNKNOWN fields (NEW v13.16)
 *   5. CrossProjectCorrelator → cross-project validation (multi-project mode)
 *   6. OrphanFieldDetector → dead/orphan field detection
 *   7. GlossaryGenerator → HTML/CSV/JSON glossary output (enriched with classification + source)
 *
 * Also maintains backward compatibility with the existing SchemaDecoder API
 * by producing a SchemaDecoderResult alongside the enriched outputs.
 *
 * @author Hamza NORDINE — Compleo
 */

import { FieldUsageAnalyzer, type FieldUsageAnalysisResult } from "./FieldUsageAnalyzer";
import { SemanticInferenceEngine, type SemanticInferenceResult } from "./SemanticInferenceEngine";
import { BusinessConceptClassifier, type ClassificationResult, type BusinessConceptClassification } from "./BusinessConceptClassifier";
import { LlmFieldClassifier, type UnknownField, type LlmClassification, type LlmClassificationCache } from "./LlmFieldClassifier";
import { CrossProjectCorrelator, type CrossProjectCorrelationResult } from "./CrossProjectCorrelator";
import { OrphanFieldDetector, type OrphanDetectionResult } from "./OrphanFieldDetector";
import { GlossaryGenerator, type GlossaryOutput } from "./GlossaryGenerator";
import { decodeSchema, type SchemaDecoderResult } from "./SchemaDecoder";

// ─── Interfaces ─────────────────────────────────────────────────────────────

export interface SchemaReverseEngineerOptions {
  /** Enable LLM-based semantic inference (default: true) */
  useLlm?: boolean;
  /** Enable LLM classification for UNKNOWN fields (default: true) — NEW v13.16 */
  useLlmForUnknown?: boolean;
  /** Project name for glossary header */
  projectName?: string;
  /** DDL fields for orphan detection (optional) */
  ddlFields?: { tableName: string; columnName: string }[];
  /** Pre-loaded LLM classification cache (for persistence across runs) */
  llmCache?: LlmClassificationCache;
}

export interface SchemaReverseEngineerResult {
  /** Backward-compatible SchemaDecoder result */
  legacyResult: SchemaDecoderResult;
  /** Phase 1: Raw field usage analysis */
  fieldUsageAnalysis: FieldUsageAnalysisResult;
  /** Phase 2: Semantic inference with confidence scores */
  semanticInference: SemanticInferenceResult;
  /** Phase 3: Business concept classification (v13.15) */
  classification: ClassificationResult;
  /** Phase 4: LLM classification for UNKNOWN fields (v13.16) */
  llmClassificationStats?: {
    attempted: number;
    classified: number;
    cacheHits: number;
    cacheMisses: number;
    totalLlmCalls: number;
    avgBatchTimeMs: number;
  };
  /** LLM classification cache for persistence */
  llmCache?: LlmClassificationCache;
  /** Phase 6: Orphan/dead field detection */
  orphanDetection: OrphanDetectionResult;
  /** Phase 7: Generated glossary (HTML, CSV, JSON) — enriched with classification + source */
  glossary: GlossaryOutput;
  /** Total execution time in ms */
  executionTimeMs: number;
}

export interface MultiProjectSchemaResult {
  /** Per-project results */
  projects: Map<string, SchemaReverseEngineerResult>;
  /** Phase 4: Cross-project correlation */
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

    // Phase 3: Business concept classification (v13.15 — rule-based)
    const classifier = new BusinessConceptClassifier();
    const classification = classifier.classifyAll(
      semanticInference.fields,
      fieldUsageAnalysis.fields
    );

    // Phase 4: LLM classification for UNKNOWN fields (v13.16)
    let llmClassificationStats: SchemaReverseEngineerResult["llmClassificationStats"];
    let llmCache: LlmClassificationCache | undefined;

    if (this.options.useLlmForUnknown !== false) {
      const unknownKeys: string[] = [];
      for (const [key, cls] of classification.classifications.entries()) {
        if (cls.primaryCategory === "UNKNOWN") unknownKeys.push(key);
      }

      if (unknownKeys.length > 0 && unknownKeys.length <= 100) {
        const llmClassifier = new LlmFieldClassifier({
          batchSize: 15,
          maxConcurrent: 2,
          timeoutMs: 15000,
          cacheEnabled: true,
          minConfidence: 50,
        });

        // Load pre-existing cache if provided
        if (this.options.llmCache) {
          llmClassifier.loadCache(this.options.llmCache);
        }

        try {
          // Build UnknownField inputs from semantic + usage data
          const unknownFields: UnknownField[] = unknownKeys.map(key => {
            const [tableName, columnName] = key.split(".");
            const semField = semanticInference.fields.find(
              f => f.tableName === tableName && f.dbColumn === columnName
            );
            const usageField = fieldUsageAnalysis.fields.find(
              f => f.tableName === tableName && f.fieldName === columnName
            );
            return {
              tableName,
              columnName,
              javaType: semField?.javaType || "String",
              variableNames: semField?.variableNames || [],
              usageContext: (usageField?.reads || []).slice(0, 3).map(r => r.context),
              comparedTo: semField?.comparedTo || [],
              joinedWith: semField?.joinedWith || [],
            };
          });

          const llmResults = await llmClassifier.classifyBatch(unknownFields);

          // Merge: LLM replaces ONLY UNKNOWN fields
          for (const [key, llmCls] of llmResults.entries()) {
            const existing = classification.classifications.get(key);
            if (existing && existing.primaryCategory === "UNKNOWN") {
              // Replace with LLM classification, preserving source traceability
              classification.classifications.set(key, {
                primaryCategory: llmCls.primaryCategory,
                subConcept: llmCls.subConcept,
                subConceptLabel: llmCls.subConceptLabel,
                confidence: llmCls.confidence,
                evidenceSignals: [`LLM: ${llmCls.reasoning}`],
                inferredConstraints: {},
                sensitivity: llmCls.sensitivity,
                businessRules: llmCls.businessRules,
                suggestedRename: llmCls.suggestedRename,
                // v13.16: source traceability
                source: "llm" as any,
                reasoning: llmCls.reasoning as any,
              } as BusinessConceptClassification);
            }
          }

          // Update classification stats
          const newClassified = Array.from(classification.classifications.values())
            .filter(c => c.primaryCategory !== "UNKNOWN").length;
          classification.stats.classified = newClassified;
          classification.stats.unknown = classification.stats.total - newClassified;

          const stats = llmClassifier.getStats();
          llmClassificationStats = {
            attempted: unknownKeys.length,
            classified: llmResults.size,
            cacheHits: stats.cacheHits,
            cacheMisses: stats.cacheMisses,
            totalLlmCalls: stats.totalLlmCalls,
            avgBatchTimeMs: stats.avgBatchTimeMs,
          };
          llmCache = llmClassifier.exportCache();
        } catch (err) {
          console.warn(`[SchemaRE v13.16] LLM classification failed (non-blocking): ${err instanceof Error ? err.message : String(err)}`);
          // Fallback gracieux — pipeline continue sans crash
        }
      }
    }

    // Phase 6: Orphan detection
    const orphanDetector = new OrphanFieldDetector();
    const orphanDetection = orphanDetector.detect(
      fieldUsageAnalysis,
      semanticInference,
      this.options.ddlFields
    );

    // Phase 7: Glossary generation (enriched with classification + source)
    const glossaryGen = new GlossaryGenerator();
    const glossary = glossaryGen.generate(
      semanticInference,
      null, // No correlation for single project
      orphanDetection,
      this.options.projectName,
      classification
    );

    return {
      legacyResult,
      fieldUsageAnalysis,
      semanticInference,
      classification,
      llmClassificationStats,
      llmCache,
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

    // Phase 4: Cross-project correlation
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

    // Run merged classification for combined glossary
    const mergedClassifier = new BusinessConceptClassifier();
    const mergedClassification = mergedClassifier.classifyAll(allFields, []);

    // Generate merged glossary
    const glossaryGen = new GlossaryGenerator();
    const mergedGlossary = glossaryGen.generate(
      mergedInference,
      correlation,
      mergedOrphanResult,
      "Workspace Multi-Projet",
      mergedClassification
    );

    return {
      projects: projectResults,
      correlation,
      mergedGlossary,
      executionTimeMs: Date.now() - t0,
    };
  }
}
