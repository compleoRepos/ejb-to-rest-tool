/**
 * BusinessConceptClassifier v13.15 — Multi-signal field classification engine.
 *
 * For each field detected by FieldUsageAnalyzer + SemanticInferenceEngine,
 * produces a precise business concept classification using 6 convergent signals:
 *   1. Field name pattern matching
 *   2. Java variable name pattern matching
 *   3. Java type hints
 *   4. Context of usage (comparisons, log messages, joins)
 *   5. Format patterns (length, regex)
 *   6. Banking abbreviation dictionary
 *
 * Confidence rules:
 *   ≥ 3 signals → HIGH (≥75%)
 *   2 signals   → MEDIUM (50-74%)
 *   1 signal    → LOW (25-49%)
 *   0 signals   → UNKNOWN
 *
 * @author Hamza NORDINE — Compleo
 */

import type { FieldUsage } from "./FieldUsageAnalyzer";
import type { SemanticField } from "./SemanticInferenceEngine";
import {
  type PrimaryCategory,
  type Sensitivity,
  type SubConcept,
  SUB_CONCEPTS,
  CATEGORY_META,
  getAllCategories,
} from "./BusinessConceptTaxonomy";

// ─── Output interface ───────────────────────────────────────────────────────

export interface BusinessConceptClassification {
  /** Primary category from taxonomy */
  primaryCategory: PrimaryCategory;
  /** Sub-concept key, e.g. "AccountNumber" */
  subConcept: string;
  /** Human-readable sub-concept label */
  subConceptLabel: string;
  /** Classification confidence 0-100 */
  confidence: number;
  /** Evidence signals that contributed to classification */
  evidenceSignals: string[];
  /** Inferred constraints */
  inferredConstraints: {
    format?: string;
    minLength?: number;
    maxLength?: number;
    enumValues?: string[];
    pattern?: string;
  };
  /** Data sensitivity level */
  sensitivity: Sensitivity;
  /** Inferred business rules */
  businessRules: string[];
  /** Suggested Java-idiomatic rename (camelCase) */
  suggestedRename: string;
}

export interface ClassificationResult {
  /** All classified fields */
  classifications: Map<string, BusinessConceptClassification>;
  /** Distribution by category */
  distribution: Record<PrimaryCategory, number>;
  /** Stats */
  stats: {
    total: number;
    classified: number;
    unknown: number;
    avgConfidence: number;
    highConfidence: number;
    mediumConfidence: number;
    lowConfidence: number;
  };
  executionTimeMs: number;
}

// ─── Signal scoring ─────────────────────────────────────────────────────────

interface SignalMatch {
  subConcept: SubConcept;
  signals: string[];
  score: number;
}

function matchFieldNameSignals(fieldName: string, sc: SubConcept): string[] {
  const signals: string[] = [];
  for (const pattern of sc.fieldPatterns) {
    if (pattern.test(fieldName)) {
      signals.push(`field name "${fieldName}" matches pattern ${pattern.source}`);
      break; // One match is enough per signal type
    }
  }
  return signals;
}

function matchVariableNameSignals(variableNames: string[], sc: SubConcept): string[] {
  const signals: string[] = [];
  for (const varName of variableNames) {
    for (const pattern of sc.variablePatterns) {
      if (pattern.test(varName)) {
        signals.push(`Java variable "${varName}" matches ${sc.key} pattern`);
        return signals; // One match is enough
      }
    }
  }
  return signals;
}

function matchJavaTypeSignals(javaType: string, sc: SubConcept): string[] {
  if (sc.javaTypeHints.some(hint => hint.toLowerCase() === javaType.toLowerCase())) {
    return [`Java type ${javaType} consistent with ${sc.key}`];
  }
  return [];
}

function matchContextSignals(
  field: FieldUsage | null,
  semanticField: SemanticField,
  sc: SubConcept
): string[] {
  const signals: string[] = [];

  // Check comparison values for enum hints
  const comparedTo = field?.comparedTo || semanticField.comparedTo || [];
  if (comparedTo.length > 0) {
    // Check if compared values suggest this sub-concept
    const comparedStr = comparedTo.join(" ").toLowerCase();
    if (sc.category === "TRANSACTION" && /\b(valid|pending|rejected|en_cours|valide|rejete|annule)\b/i.test(comparedStr)) {
      signals.push(`compared to status values: ${comparedTo.slice(0, 3).join(", ")}`);
    }
    if (sc.category === "ACCOUNT" && /\b(courant|epargne|depot|current|savings)\b/i.test(comparedStr)) {
      signals.push(`compared to account type values: ${comparedTo.slice(0, 3).join(", ")}`);
    }
    if (sc.key === "Channel" && /\b(gab|web|agency|agence|atm|mobile)\b/i.test(comparedStr)) {
      signals.push(`compared to channel values: ${comparedTo.slice(0, 3).join(", ")}`);
    }
    if (sc.key === "Direction" && /\b(debit|credit|d|c)\b/i.test(comparedStr)) {
      signals.push(`compared to direction values: ${comparedTo.slice(0, 3).join(", ")}`);
    }
    if (sc.key === "ActiveFlag" && /\b(o|n|true|false|1|0|oui|non|y|yes|no)\b/i.test(comparedStr)) {
      signals.push(`compared to boolean values: ${comparedTo.slice(0, 3).join(", ")}`);
    }
    if (sc.key === "Gender" && /\b(m|f|masculin|feminin|male|female)\b/i.test(comparedStr)) {
      signals.push(`compared to gender values: ${comparedTo.slice(0, 3).join(", ")}`);
    }
    if (sc.key === "Civility" && /\b(m|mme|mlle|mr|mrs|ms)\b/i.test(comparedStr)) {
      signals.push(`compared to civility values: ${comparedTo.slice(0, 3).join(", ")}`);
    }
  }

  // Check log context
  const loggedAs = field?.loggedAs || [];
  for (const logLabel of loggedAs) {
    const lower = logLabel.toLowerCase();
    // Check if log label contains keywords matching the sub-concept
    for (const pattern of sc.variablePatterns) {
      if (pattern.test(logLabel)) {
        signals.push(`log message: "${logLabel}"`);
        break;
      }
    }
    // Generic money-related log patterns
    if (sc.category === "MONEY" && /\b(amount|montant|solde|balance|total)\b/i.test(lower)) {
      signals.push(`log message suggests monetary value: "${logLabel}"`);
    }
  }

  // Check join relationships
  const joinedWith = field?.joinedWith || semanticField.joinedWith || [];
  for (const join of joinedWith) {
    const lower = join.toLowerCase();
    if (sc.category === "ACCOUNT" && /\b(account|compte|cpt)\b/i.test(lower)) {
      signals.push(`joins with account table: ${join}`);
    }
    if (sc.category === "IDENTITY" && /\b(client|customer|cust)\b/i.test(lower)) {
      signals.push(`joins with client table: ${join}`);
    }
  }

  // Check usage context for method calls (e.g., validateRib(), formatIban())
  if (field) {
    for (const site of [...field.reads, ...field.writes]) {
      const ctx = site.context.toLowerCase();
      if (sc.key === "AccountNumber" && /\b(validate[\W_]*rib|check[\W_]*rib|format[\W_]*rib)\b/i.test(ctx)) {
        signals.push("passed to RIB validation method");
      }
      if (sc.key === "IBAN" && /\b(validate[\W_]*iban|check[\W_]*iban|format[\W_]*iban)\b/i.test(ctx)) {
        signals.push("passed to IBAN validation method");
      }
      if (sc.category === "MONEY" && /\b(sum|total|aggregate|add|subtract)\b/i.test(ctx)) {
        signals.push("used in arithmetic/aggregate operation");
      }
    }
  }

  return signals;
}

// ─── Rename suggestion ──────────────────────────────────────────────────────

function suggestRename(
  sc: SubConcept,
  semanticField: SemanticField
): string {
  // If we have a good variable name from the code, prefer it
  if (semanticField.variableNames.length > 0) {
    const best = semanticField.variableNames.sort((a, b) => b.length - a.length)[0];
    // Ensure it's camelCase
    if (/^[a-z][a-zA-Z0-9]*$/.test(best) && best.length > 2) {
      return best;
    }
  }

  // Otherwise derive from sub-concept key
  const key = sc.key;
  // Convert PascalCase to camelCase
  return key.charAt(0).toLowerCase() + key.slice(1);
}

// ─── Infer constraints ──────────────────────────────────────────────────────

function inferConstraints(
  sc: SubConcept,
  field: FieldUsage | null,
  semanticField: SemanticField
): BusinessConceptClassification["inferredConstraints"] {
  const constraints: BusinessConceptClassification["inferredConstraints"] = {};

  if (sc.formatHint) constraints.format = sc.formatHint;
  if (sc.minLength !== undefined) constraints.minLength = sc.minLength;
  if (sc.maxLength !== undefined) constraints.maxLength = sc.maxLength;
  if (sc.valuePattern) constraints.pattern = sc.valuePattern;

  // Extract enum values from comparisons
  const comparedTo = field?.comparedTo || semanticField.comparedTo || [];
  if (comparedTo.length >= 2 && comparedTo.length <= 20) {
    constraints.enumValues = [...comparedTo];
  }

  return constraints;
}

// ─── Business rules inference ───────────────────────────────────────────────

function inferBusinessRules(
  sc: SubConcept,
  field: FieldUsage | null,
  signals: string[]
): string[] {
  const rules: string[] = [];

  if (sc.key === "AccountNumber" && signals.some(s => s.includes("RIB"))) {
    rules.push("RIB MA validation via modulo 97");
  }
  if (sc.key === "IBAN") {
    rules.push("IBAN validation via ISO 7064 modulo 97-10");
  }
  if (sc.key === "CVV") {
    rules.push("MUST NOT be stored in production (PCI-DSS requirement)");
  }
  if (sc.key === "PAN") {
    rules.push("Must be masked in logs and UI (show last 4 digits only)");
  }
  if (sc.key === "CardPin") {
    rules.push("Must be stored as bcrypt/argon2 hash, never plaintext");
  }
  if (sc.sensitivity === "pci-dss") {
    rules.push("PCI-DSS scope — requires encryption at rest and in transit");
  }
  if (sc.sensitivity === "critical") {
    rules.push("Critical data — restricted access, audit logging required");
  }
  if (sc.sensitivity === "pii") {
    rules.push("PII — subject to GDPR/CNDP data protection requirements");
  }

  return rules;
}

// ─── Main Classifier ────────────────────────────────────────────────────────

export class BusinessConceptClassifier {
  /**
   * Classify a single field using multi-signal convergence.
   */
  classifyField(
    semanticField: SemanticField,
    fieldUsage: FieldUsage | null = null
  ): BusinessConceptClassification {
    const candidates: SignalMatch[] = [];

    for (const sc of SUB_CONCEPTS) {
      const signals: string[] = [];
      let score = 0;

      // Signal 1: Field name
      const fieldNameSignals = matchFieldNameSignals(semanticField.dbColumn, sc);
      if (fieldNameSignals.length > 0) {
        signals.push(...fieldNameSignals);
        score += 30;
      }

      // Signal 2: Variable names
      const varSignals = matchVariableNameSignals(semanticField.variableNames, sc);
      if (varSignals.length > 0) {
        signals.push(...varSignals);
        score += 25;
      }

      // Signal 3: Java type (reinforcement only — does NOT count alone)
      const typeSignals = matchJavaTypeSignals(semanticField.javaType, sc);
      const hasTypeHint = typeSignals.length > 0;

      // Signal 4: Context (comparisons, logs, joins, method calls)
      const ctxSignals = matchContextSignals(fieldUsage, semanticField, sc);
      if (ctxSignals.length > 0) {
        signals.push(...ctxSignals);
        score += 15 * Math.min(ctxSignals.length, 2); // Cap at 2 context signals
      }

      // Java type hint only counts if there's at least one other signal
      // (field name, variable name, or context). Alone, it's too generic.
      if (hasTypeHint && score > 0) {
        signals.push(...typeSignals);
        score += 15;
      }

      // Only add candidate if we have at least one non-type signal
      if (signals.length > 0 && score > 0) {
        candidates.push({ subConcept: sc, signals, score });
      }
    }

    // Pick the best candidate
    if (candidates.length === 0) {
      return this.unknownClassification(semanticField);
    }

    // Sort by score descending, then by number of signals
    candidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.signals.length - a.signals.length;
    });

    const best = candidates[0];
    const sc = best.subConcept;

    // Compute confidence based on number of distinct signal types
    const signalTypes = new Set<string>();
    if (best.signals.some(s => s.startsWith("field name"))) signalTypes.add("fieldName");
    if (best.signals.some(s => s.startsWith("Java variable"))) signalTypes.add("variable");
    if (best.signals.some(s => s.startsWith("Java type"))) signalTypes.add("javaType");
    if (best.signals.some(s => !s.startsWith("field name") && !s.startsWith("Java variable") && !s.startsWith("Java type"))) {
      signalTypes.add("context");
    }

    let confidence: number;
    if (signalTypes.size >= 3) {
      confidence = Math.min(95, 75 + (signalTypes.size - 3) * 10 + Math.min(best.signals.length, 5) * 2);
    } else if (signalTypes.size === 2) {
      confidence = 50 + Math.min(best.signals.length, 5) * 4;
    } else {
      confidence = 25 + Math.min(best.signals.length, 3) * 5;
    }

    return {
      primaryCategory: sc.category,
      subConcept: sc.key,
      subConceptLabel: sc.label,
      confidence,
      evidenceSignals: best.signals,
      inferredConstraints: inferConstraints(sc, fieldUsage, semanticField),
      sensitivity: sc.sensitivity,
      businessRules: inferBusinessRules(sc, fieldUsage, best.signals),
      suggestedRename: suggestRename(sc, semanticField),
    };
  }

  /**
   * Classify all fields in a batch.
   */
  classifyAll(
    semanticFields: SemanticField[],
    fieldUsages: FieldUsage[] = []
  ): ClassificationResult {
    const t0 = Date.now();
    const classifications = new Map<string, BusinessConceptClassification>();
    const usageMap = new Map<string, FieldUsage>();

    for (const fu of fieldUsages) {
      usageMap.set(`${fu.tableName}.${fu.fieldName}`, fu);
    }

    for (const sf of semanticFields) {
      const key = `${sf.tableName}.${sf.dbColumn}`;
      const fu = usageMap.get(key) || null;
      classifications.set(key, this.classifyField(sf, fu));
    }

    // Compute distribution
    const distribution: Record<PrimaryCategory, number> = {} as any;
    for (const cat of getAllCategories()) {
      distribution[cat] = 0;
    }
    for (const c of classifications.values()) {
      distribution[c.primaryCategory] = (distribution[c.primaryCategory] || 0) + 1;
    }

    // Stats
    const all = [...classifications.values()];
    const classified = all.filter(c => c.primaryCategory !== "UNKNOWN").length;
    const avgConf = all.length > 0 ? all.reduce((s, c) => s + c.confidence, 0) / all.length : 0;

    return {
      classifications,
      distribution,
      stats: {
        total: all.length,
        classified,
        unknown: all.length - classified,
        avgConfidence: Math.round(avgConf * 10) / 10,
        highConfidence: all.filter(c => c.confidence >= 75).length,
        mediumConfidence: all.filter(c => c.confidence >= 50 && c.confidence < 75).length,
        lowConfidence: all.filter(c => c.confidence < 50 && c.primaryCategory !== "UNKNOWN").length,
      },
      executionTimeMs: Date.now() - t0,
    };
  }

  // ─── Private ────────────────────────────────────────────────────────────

  private unknownClassification(sf: SemanticField): BusinessConceptClassification {
    return {
      primaryCategory: "UNKNOWN",
      subConcept: "UNKNOWN_BUSINESS_CONCEPT",
      subConceptLabel: "Unknown — review by BA needed",
      confidence: 0,
      evidenceSignals: [],
      inferredConstraints: {},
      sensitivity: "internal",
      businessRules: ["UNKNOWN — review BA needed"],
      suggestedRename: sf.businessNameFr || sf.dbColumn.toLowerCase(),
    };
  }
}
