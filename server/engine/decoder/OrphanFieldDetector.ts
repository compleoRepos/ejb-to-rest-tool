/**
 * OrphanFieldDetector v13.13 — Detect dead/orphan fields in legacy schemas.
 *
 * Identifies fields that are:
 *   - Declared in DDL/schema but never read or written in Java code
 *   - Written but never read (write-only → potential dead data)
 *   - Read but never written (read-only → potential external source)
 *   - Referenced in only one file (low cross-reference → fragile)
 *
 * Produces actionable recommendations for schema cleanup.
 *
 * @author Hamza NORDINE — Compleo
 */

import type { FieldUsage, FieldUsageAnalysisResult } from "./FieldUsageAnalyzer";
import type { SemanticField, SemanticInferenceResult } from "./SemanticInferenceEngine";

// ─── Interfaces ─────────────────────────────────────────────────────────────

export type OrphanCategory =
  | "dead"           // In DDL but no Java usage at all
  | "write-only"     // Written but never read
  | "read-only"      // Read but never written (external source?)
  | "single-ref"     // Only referenced in 1 file (fragile)
  | "low-confidence"  // Exists but meaning unknown
  | "deprecated";     // Likely deprecated (comment hints)

export interface OrphanField {
  dbColumn: string;
  tableName: string;
  category: OrphanCategory;
  severity: "critical" | "warning" | "info";
  reason: string;
  recommendation: string;
  /** Files that reference this field (empty for "dead") */
  referencingFiles: string[];
  /** Read count */
  readCount: number;
  /** Write count */
  writeCount: number;
  /** Total usage count */
  totalUsages: number;
}

export interface OrphanDetectionResult {
  orphans: OrphanField[];
  stats: {
    totalFieldsAnalyzed: number;
    deadFields: number;
    writeOnlyFields: number;
    readOnlyFields: number;
    singleRefFields: number;
    lowConfidenceFields: number;
    deprecatedFields: number;
    healthyFields: number;
    healthScore: number; // 0-100
  };
  executionTimeMs: number;
}

// ─── Deprecated patterns ────────────────────────────────────────────────────

const DEPRECATED_PATTERNS = [
  /deprecated/i,
  /obsolete/i,
  /ancien/i,
  /old_/i,
  /_old$/i,
  /unused/i,
  /tmp_/i,
  /_tmp$/i,
  /bak_/i,
  /_bak$/i,
  /test_/i,
  /_test$/i,
  /v[0-9]+_/i,     // versioned fields (v1_, v2_)
  /_v[0-9]+$/i,
];

function isLikelyDeprecated(fieldName: string, contexts: string[]): boolean {
  // Check field name
  if (DEPRECATED_PATTERNS.some(p => p.test(fieldName))) return true;

  // Check surrounding comments
  for (const ctx of contexts) {
    if (/deprecated|obsolete|ancien|ne\s+plus\s+utiliser|do\s+not\s+use/i.test(ctx)) {
      return true;
    }
  }

  return false;
}

// ─── Main Detector ──────────────────────────────────────────────────────────

export class OrphanFieldDetector {
  /**
   * Detect orphan/dead fields from analysis and inference results.
   *
   * @param analysisResult - Raw field usage data from FieldUsageAnalyzer
   * @param inferenceResult - Semantic inference data (optional, for confidence check)
   * @param ddlFields - Fields declared in DDL but possibly not in Java (optional)
   */
  detect(
    analysisResult: FieldUsageAnalysisResult,
    inferenceResult?: SemanticInferenceResult,
    ddlFields?: { tableName: string; columnName: string }[]
  ): OrphanDetectionResult {
    const t0 = Date.now();
    const orphans: OrphanField[] = [];
    const healthyCount = { value: 0 };

    // Index fields by key for quick lookup
    const fieldIndex = new Map<string, FieldUsage>();
    for (const field of analysisResult.fields) {
      fieldIndex.set(`${field.tableName}.${field.fieldName}`, field);
    }

    // Index semantic fields
    const semanticIndex = new Map<string, SemanticField>();
    if (inferenceResult) {
      for (const field of inferenceResult.fields) {
        semanticIndex.set(`${field.tableName}.${field.dbColumn}`, field);
      }
    }

    // Check 1: DDL fields not in Java code (dead fields)
    if (ddlFields) {
      for (const ddl of ddlFields) {
        const key = `${ddl.tableName.toUpperCase()}.${ddl.columnName.toUpperCase()}`;
        if (!fieldIndex.has(key)) {
          orphans.push({
            dbColumn: ddl.columnName,
            tableName: ddl.tableName,
            category: "dead",
            severity: "critical",
            reason: "Colonne déclarée en DDL mais jamais référencée dans le code Java",
            recommendation: "Vérifier si cette colonne est utilisée par d'autres systèmes (batch, ETL). Si non, planifier sa suppression.",
            referencingFiles: [],
            readCount: 0,
            writeCount: 0,
            totalUsages: 0,
          });
        }
      }
    }

    // Check 2-6: Analyze each field from Java code
    for (const field of analysisResult.fields) {
      const key = `${field.tableName}.${field.fieldName}`;
      const semantic = semanticIndex.get(key);
      const contexts = [
        ...field.reads.map(r => r.context),
        ...field.writes.map(w => w.context),
      ];

      // Check for deprecated
      if (isLikelyDeprecated(field.fieldName, contexts)) {
        orphans.push({
          dbColumn: field.fieldName,
          tableName: field.tableName,
          category: "deprecated",
          severity: "warning",
          reason: "Le nom ou les commentaires suggèrent que ce champ est obsolète",
          recommendation: "Confirmer avec l'équipe métier. Si obsolète, migrer les données et supprimer.",
          referencingFiles: field.filesReferencing,
          readCount: field.reads.length,
          writeCount: field.writes.length,
          totalUsages: field.totalUsages,
        });
        continue;
      }

      // Check write-only
      if (field.writes.length > 0 && field.reads.length === 0) {
        orphans.push({
          dbColumn: field.fieldName,
          tableName: field.tableName,
          category: "write-only",
          severity: "warning",
          reason: `Écrit ${field.writes.length} fois mais jamais lu dans le code Java analysé`,
          recommendation: "Vérifier si ce champ est lu par des requêtes SQL externes, des rapports, ou des batch. Potentiellement données mortes.",
          referencingFiles: field.filesReferencing,
          readCount: 0,
          writeCount: field.writes.length,
          totalUsages: field.totalUsages,
        });
        continue;
      }

      // Check read-only (no writes detected)
      if (field.reads.length > 0 && field.writes.length === 0) {
        // This is less concerning — could be populated by another system
        orphans.push({
          dbColumn: field.fieldName,
          tableName: field.tableName,
          category: "read-only",
          severity: "info",
          reason: `Lu ${field.reads.length} fois mais jamais écrit dans le code Java analysé`,
          recommendation: "Ce champ est probablement alimenté par un autre système (batch, ETL, trigger). Documenter la source.",
          referencingFiles: field.filesReferencing,
          readCount: field.reads.length,
          writeCount: 0,
          totalUsages: field.totalUsages,
        });
        continue;
      }

      // Check single-reference
      if (field.filesReferencing.length === 1 && field.totalUsages <= 2) {
        orphans.push({
          dbColumn: field.fieldName,
          tableName: field.tableName,
          category: "single-ref",
          severity: "info",
          reason: `Référencé uniquement dans ${field.filesReferencing[0]} (${field.totalUsages} usage(s))`,
          recommendation: "Champ fragile : un seul point d'accès. Vérifier si c'est intentionnel ou si des usages manquent.",
          referencingFiles: field.filesReferencing,
          readCount: field.reads.length,
          writeCount: field.writes.length,
          totalUsages: field.totalUsages,
        });
        continue;
      }

      // Check low confidence (meaning unknown)
      if (semantic && (semantic.confidence === "unresolved" || semantic.confidenceScore < 15)) {
        orphans.push({
          dbColumn: field.fieldName,
          tableName: field.tableName,
          category: "low-confidence",
          severity: "info",
          reason: `Utilisé ${field.totalUsages} fois mais signification métier non résolue (score: ${semantic.confidenceScore})`,
          recommendation: "Demander clarification à l'équipe métier. Le nom cryptique empêche l'inférence automatique.",
          referencingFiles: field.filesReferencing,
          readCount: field.reads.length,
          writeCount: field.writes.length,
          totalUsages: field.totalUsages,
        });
        continue;
      }

      // Healthy field
      healthyCount.value++;
    }

    // Compute stats
    const totalAnalyzed = analysisResult.fields.length + (ddlFields?.length || 0);
    const deadFields = orphans.filter(o => o.category === "dead").length;
    const writeOnlyFields = orphans.filter(o => o.category === "write-only").length;
    const readOnlyFields = orphans.filter(o => o.category === "read-only").length;
    const singleRefFields = orphans.filter(o => o.category === "single-ref").length;
    const lowConfidenceFields = orphans.filter(o => o.category === "low-confidence").length;
    const deprecatedFields = orphans.filter(o => o.category === "deprecated").length;

    // Health score: 100 = all fields healthy, 0 = all fields orphan
    const criticalWeight = deadFields * 3 + writeOnlyFields * 2 + deprecatedFields * 2;
    const warningWeight = singleRefFields + lowConfidenceFields;
    const totalWeight = totalAnalyzed * 3;
    const healthScore = totalWeight > 0
      ? Math.max(0, Math.round(100 - (criticalWeight + warningWeight) / totalWeight * 100))
      : 100;

    return {
      orphans,
      stats: {
        totalFieldsAnalyzed: totalAnalyzed,
        deadFields,
        writeOnlyFields,
        readOnlyFields,
        singleRefFields,
        lowConfidenceFields,
        deprecatedFields,
        healthyFields: healthyCount.value,
        healthScore,
      },
      executionTimeMs: Date.now() - t0,
    };
  }
}
