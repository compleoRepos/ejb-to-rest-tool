/**
 * CrossProjectCorrelator v13.13 — Cross-reference fields across multiple projects.
 *
 * When a workspace contains multiple EJB projects (e.g. avis-opere, interface-credit-jocker),
 * the same DB table/column may appear in several projects with different variable names.
 * This module correlates those usages to:
 *   - Validate inferences (same column, same variable name → HIGH confidence)
 *   - Detect conflicts (same column, different variable names → needs review)
 *   - Discover relationships (project A writes, project B reads → data flow)
 *
 * @author Hamza NORDINE — Compleo
 */

import type { SemanticField, SemanticInferenceResult } from "./SemanticInferenceEngine";

// ─── Interfaces ─────────────────────────────────────────────────────────────

export interface CorrelatedField {
  /** DB column name */
  dbColumn: string;
  /** Table name */
  tableName: string;
  /** Projects that reference this field */
  projects: ProjectFieldReference[];
  /** Consensus business name (if projects agree) */
  consensusNameFr: string | null;
  consensusNameEn: string | null;
  /** Whether projects agree on the name */
  isConsensus: boolean;
  /** Conflicts (different names for same field) */
  conflicts: string[];
  /** Data flow direction */
  dataFlow: DataFlowInfo | null;
  /** Boosted confidence (after cross-validation) */
  boostedConfidence: number;
  /** Original max confidence across projects */
  originalConfidence: number;
}

export interface ProjectFieldReference {
  projectName: string;
  businessNameFr: string;
  businessNameEn: string;
  confidence: number;
  variableNames: string[];
  usageCount: number;
}

export interface DataFlowInfo {
  /** Projects that write to this field */
  writers: string[];
  /** Projects that read this field */
  readers: string[];
  /** Direction: "unidirectional" or "bidirectional" */
  direction: "unidirectional" | "bidirectional";
}

export interface CrossProjectCorrelationResult {
  correlatedFields: CorrelatedField[];
  /** Fields unique to a single project */
  isolatedFields: { projectName: string; field: SemanticField }[];
  /** Shared tables across projects */
  sharedTables: { tableName: string; projects: string[] }[];
  stats: {
    totalFields: number;
    correlatedFields: number;
    consensusFields: number;
    conflictFields: number;
    isolatedFields: number;
    sharedTables: number;
    confidenceBoosts: number;
  };
  executionTimeMs: number;
}

// ─── Main Correlator ────────────────────────────────────────────────────────

export class CrossProjectCorrelator {
  /**
   * Correlate fields across multiple project inference results.
   */
  correlate(
    projectResults: Map<string, SemanticInferenceResult>
  ): CrossProjectCorrelationResult {
    const t0 = Date.now();

    // Step 1: Build a global field index (TABLE.COLUMN → project references)
    const globalIndex = new Map<string, ProjectFieldReference[]>();
    const allFields = new Map<string, SemanticField[]>();

    for (const [projectName, result] of projectResults.entries()) {
      for (const field of result.fields) {
        const key = `${field.tableName}.${field.dbColumn}`;
        if (!globalIndex.has(key)) {
          globalIndex.set(key, []);
          allFields.set(key, []);
        }
        globalIndex.get(key)!.push({
          projectName,
          businessNameFr: field.businessNameFr,
          businessNameEn: field.businessNameEn,
          confidence: field.confidenceScore,
          variableNames: field.variableNames,
          usageCount: field.usageCount,
        });
        allFields.get(key)!.push(field);
      }
    }

    // Step 2: Identify correlated fields (appearing in 2+ projects)
    const correlatedFields: CorrelatedField[] = [];
    const isolatedFields: { projectName: string; field: SemanticField }[] = [];
    let confidenceBoosts = 0;

    for (const [key, refs] of globalIndex.entries()) {
      const [tableName, dbColumn] = key.split(".");
      const fields = allFields.get(key)!;

      if (refs.length === 1) {
        // Isolated field
        isolatedFields.push({ projectName: refs[0].projectName, field: fields[0] });
        continue;
      }

      // Multi-project field — check consensus
      const namesFr = [...new Set(refs.map(r => r.businessNameFr.toLowerCase()))];
      const namesEn = [...new Set(refs.map(r => r.businessNameEn.toLowerCase()))];
      const isConsensus = namesFr.length === 1 || namesEn.length === 1;

      // Determine consensus name (weighted by confidence)
      let consensusNameFr: string | null = null;
      let consensusNameEn: string | null = null;
      if (isConsensus) {
        consensusNameFr = namesFr[0];
        consensusNameEn = namesEn[0];
      } else {
        // Pick the name with highest total confidence
        const nameScores = new Map<string, number>();
        for (const ref of refs) {
          const n = ref.businessNameFr.toLowerCase();
          nameScores.set(n, (nameScores.get(n) || 0) + ref.confidence);
        }
        let bestName = "";
        let bestScore = 0;
        for (const [name, score] of nameScores) {
          if (score > bestScore) { bestName = name; bestScore = score; }
        }
        consensusNameFr = bestName;
        // Same for EN
        const nameScoresEn = new Map<string, number>();
        for (const ref of refs) {
          const n = ref.businessNameEn.toLowerCase();
          nameScoresEn.set(n, (nameScoresEn.get(n) || 0) + ref.confidence);
        }
        let bestNameEn = "";
        let bestScoreEn = 0;
        for (const [name, score] of nameScoresEn) {
          if (score > bestScoreEn) { bestNameEn = name; bestScoreEn = score; }
        }
        consensusNameEn = bestNameEn;
      }

      // Detect conflicts
      const conflicts: string[] = [];
      if (!isConsensus) {
        for (const ref of refs) {
          conflicts.push(`${ref.projectName}: "${ref.businessNameFr}" (confidence: ${ref.confidence})`);
        }
      }

      // Detect data flow (simplified: check variable names for read/write patterns)
      const writers: string[] = [];
      const readers: string[] = [];
      for (const field of fields) {
        const ref = refs.find(r => r.projectName === [...projectResults.keys()].find(
          k => projectResults.get(k)!.fields.includes(field)
        ));
        if (!ref) continue;

        // Heuristic: if field has writes (INSERT/UPDATE), it's a writer
        // This info is not directly available here, so we use variable name patterns
        const hasWritePattern = ref.variableNames.some(v =>
          /^(new|create|insert|save|update|set)/i.test(v)
        );
        const hasReadPattern = ref.variableNames.some(v =>
          /^(get|find|search|read|fetch|load|select)/i.test(v)
        );

        if (hasWritePattern) writers.push(ref.projectName);
        if (hasReadPattern || !hasWritePattern) readers.push(ref.projectName);
      }

      const dataFlow: DataFlowInfo | null = (writers.length > 0 || readers.length > 0) ? {
        writers: [...new Set(writers)],
        readers: [...new Set(readers)],
        direction: (writers.length > 0 && readers.length > 0) ? "bidirectional" : "unidirectional",
      } : null;

      // Boost confidence for correlated fields
      const originalConfidence = Math.max(...refs.map(r => r.confidence));
      let boostedConfidence = originalConfidence;
      if (isConsensus) {
        boostedConfidence = Math.min(100, originalConfidence + 15);
        confidenceBoosts++;
      } else if (refs.length >= 2) {
        boostedConfidence = Math.min(100, originalConfidence + 5);
        confidenceBoosts++;
      }

      correlatedFields.push({
        dbColumn,
        tableName,
        projects: refs,
        consensusNameFr,
        consensusNameEn,
        isConsensus,
        conflicts,
        dataFlow,
        boostedConfidence,
        originalConfidence,
      });
    }

    // Step 3: Identify shared tables
    const tableProjects = new Map<string, Set<string>>();
    for (const [projectName, result] of projectResults.entries()) {
      for (const field of result.fields) {
        if (!tableProjects.has(field.tableName)) {
          tableProjects.set(field.tableName, new Set());
        }
        tableProjects.get(field.tableName)!.add(projectName);
      }
    }
    const sharedTables = Array.from(tableProjects.entries())
      .filter(([, projects]) => projects.size > 1)
      .map(([tableName, projects]) => ({ tableName, projects: [...projects] }));

    return {
      correlatedFields,
      isolatedFields,
      sharedTables,
      stats: {
        totalFields: globalIndex.size,
        correlatedFields: correlatedFields.length,
        consensusFields: correlatedFields.filter(f => f.isConsensus).length,
        conflictFields: correlatedFields.filter(f => f.conflicts.length > 0).length,
        isolatedFields: isolatedFields.length,
        sharedTables: sharedTables.length,
        confidenceBoosts,
      },
      executionTimeMs: Date.now() - t0,
    };
  }
}
