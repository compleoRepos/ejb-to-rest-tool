/**
 * LlmFieldClassifier — v13.16
 *
 * Classifie les champs marqués UNKNOWN par le BusinessConceptClassifier (rule-based)
 * en utilisant le LLM via llm-adapter.
 *
 * Architecture "Best of both worlds" :
 *   1. Rule-based classifie ~30-50% (rapide, déterministe, gratuit)
 *   2. LLM classifie les UNKNOWN restants (batch 15, cache disque, fallback gracieux)
 *   3. Rule-based gagne en cas de conflit (signal explicite > inférence LLM)
 *
 * Anti-OOM :
 *   - Batch processing : max 15 champs par appel LLM
 *   - Max 2 batches concurrents
 *   - Si > 100 UNKNOWN : séquentiel (pas de parallélisme)
 *   - Cache disque persistant : un champ classifié ne re-passe jamais au LLM
 *   - Fallback gracieux : LLM down → champs restent UNKNOWN, pas de crash
 *
 * @author Hamza NORDINE — Compleo
 */

import { createHash } from "crypto";
import { llmGenerateJSON, isLLMAvailable } from "../ml/llm-adapter";
import type { LLMAdapterConfig } from "../ml/llm-adapter";
import type { PrimaryCategory } from "./BusinessConceptTaxonomy";

// ─── Input interface ────────────────────────────────────────────────────────

export interface UnknownField {
  tableName: string;
  columnName: string;
  javaType: string;
  variableNames: string[];
  usageContext: string[];     // 3-5 lines of typical code usage
  comparedTo: string[];       // compared values (constants)
  joinedWith: string[];       // join relationships
}

// ─── Output interface ───────────────────────────────────────────────────────

export interface LlmClassification {
  primaryCategory: PrimaryCategory;
  subConcept: string;
  subConceptLabel: string;
  confidence: number;
  sensitivity: "public" | "internal" | "pii" | "banking-sensitive" | "pci-dss";
  businessRules: string[];
  suggestedRename: string;
  reasoning: string;
  source: "llm";
}

// ─── Options ────────────────────────────────────────────────────────────────

export interface LlmClassifierOptions {
  batchSize?: number;         // default 15
  maxConcurrent?: number;     // default 2
  timeoutMs?: number;         // default 15000 ms per batch
  cacheEnabled?: boolean;     // default true
  minConfidence?: number;     // default 50 — below this, keep UNKNOWN
  llmConfig?: LLMAdapterConfig;
}

// ─── Cache types ────────────────────────────────────────────────────────────

interface CacheEntry {
  hash: string;
  classification: LlmClassification;
  timestamp: string;
}

export interface LlmClassificationCache {
  version: string;
  entries: Record<string, CacheEntry>;
}

// ─── LLM response schema ────────────────────────────────────────────────────

interface LlmFieldResponse {
  fieldIndex: number;
  primaryCategory: string;
  subConcept: string;
  confidence: number;
  sensitivity: string;
  businessRules: string[];
  suggestedRename: string;
  reasoning: string;
}

// ─── Valid categories for post-validation ────────────────────────────────────

const VALID_CATEGORIES: Set<string> = new Set([
  "IDENTITY", "ACCOUNT", "TRANSACTION", "MONETARY", "TIME",
  "CONTACT", "GEOGRAPHY", "STATUS", "DOCUMENT", "SYSTEM", "UNKNOWN",
]);

const VALID_SENSITIVITIES: Set<string> = new Set([
  "public", "internal", "pii", "banking-sensitive", "pci-dss",
]);

// ─── Main class ─────────────────────────────────────────────────────────────

export class LlmFieldClassifier {
  private readonly options: Required<Omit<LlmClassifierOptions, "llmConfig">> & { llmConfig?: LLMAdapterConfig };
  private cache: LlmClassificationCache;
  private cacheHits = 0;
  private cacheMisses = 0;
  private totalLlmCalls = 0;
  private totalLlmTimeMs = 0;

  constructor(options?: LlmClassifierOptions) {
    this.options = {
      batchSize: options?.batchSize ?? 15,
      maxConcurrent: options?.maxConcurrent ?? 2,
      timeoutMs: options?.timeoutMs ?? 15000,
      cacheEnabled: options?.cacheEnabled ?? true,
      minConfidence: options?.minConfidence ?? 50,
      llmConfig: options?.llmConfig,
    };
    this.cache = { version: "1", entries: {} };
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  /**
   * Classify a batch of UNKNOWN fields using LLM.
   * Returns classifications only for fields where LLM confidence >= minConfidence.
   */
  async classifyBatch(fields: UnknownField[]): Promise<Map<string, LlmClassification>> {
    const results = new Map<string, LlmClassification>();

    if (fields.length === 0) return results;

    // Separate cached vs uncached
    const uncached: UnknownField[] = [];
    for (const field of fields) {
      const key = this.cacheKey(field);
      const hash = this.fieldHash(field);
      const cached = this.cache.entries[key];

      if (this.options.cacheEnabled && cached && cached.hash === hash) {
        this.cacheHits++;
        results.set(key, cached.classification);
      } else {
        uncached.push(field);
        this.cacheMisses++;
      }
    }

    if (uncached.length === 0) return results;

    // Batch processing
    const batches = this.splitIntoBatches(uncached, this.options.batchSize);
    const sequential = uncached.length > 50;

    if (sequential) {
      // Sequential processing for large sets (anti-OOM)
      for (const batch of batches) {
        const batchResults = await this.processBatch(batch);
        for (const [key, cls] of batchResults) {
          results.set(key, cls);
        }
      }
    } else {
      // Limited concurrency
      const concurrency = Math.min(this.options.maxConcurrent, batches.length);
      for (let i = 0; i < batches.length; i += concurrency) {
        const chunk = batches.slice(i, i + concurrency);
        const chunkResults = await Promise.all(chunk.map(b => this.processBatch(b)));
        for (const batchResult of chunkResults) {
          for (const [key, cls] of batchResult) {
            results.set(key, cls);
          }
        }
      }
    }

    return results;
  }

  /**
   * Check if LLM is available for classification.
   */
  async isAvailable(): Promise<boolean> {
    try {
      return await isLLMAvailable();
    } catch {
      return false;
    }
  }

  /**
   * Load cache from a JSON object (e.g., read from disk).
   */
  loadCache(cacheData: LlmClassificationCache): void {
    this.cache = cacheData;
  }

  /**
   * Export cache for persistence.
   */
  exportCache(): LlmClassificationCache {
    return { ...this.cache };
  }

  /**
   * Get execution stats.
   */
  getStats(): {
    cacheHits: number;
    cacheMisses: number;
    totalLlmCalls: number;
    avgBatchTimeMs: number;
  } {
    return {
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      totalLlmCalls: this.totalLlmCalls,
      avgBatchTimeMs: this.totalLlmCalls > 0
        ? Math.round(this.totalLlmTimeMs / this.totalLlmCalls)
        : 0,
    };
  }

  // ─── Private methods ────────────────────────────────────────────────────

  private async processBatch(fields: UnknownField[]): Promise<Map<string, LlmClassification>> {
    const results = new Map<string, LlmClassification>();
    const t0 = Date.now();

    try {
      const prompt = this.buildPrompt(fields);
      this.totalLlmCalls++;

      const response = await llmGenerateJSON<LlmFieldResponse[]>(
        prompt,
        { temperature: 0.1, maxTokens: 4000 },
        { timeoutMs: this.options.timeoutMs, forceBackend: "manus", ...this.options.llmConfig },
      );

      this.totalLlmTimeMs += Date.now() - t0;

      if (!response || !Array.isArray(response)) {
        console.warn("[LlmFieldClassifier] LLM returned null or non-array response");
        return results;
      }

      // Process each response
      for (const item of response) {
        const fieldIndex = item.fieldIndex - 1; // 1-indexed → 0-indexed
        if (fieldIndex < 0 || fieldIndex >= fields.length) continue;

        const field = fields[fieldIndex];
        const classification = this.validateAndNormalize(item, field);
        if (!classification) continue;

        // Apply minimum confidence threshold
        if (classification.confidence < this.options.minConfidence) continue;

        const key = this.cacheKey(field);
        results.set(key, classification);

        // Update cache
        if (this.options.cacheEnabled) {
          this.cache.entries[key] = {
            hash: this.fieldHash(field),
            classification,
            timestamp: new Date().toISOString(),
          };
        }
      }
    } catch (err) {
      this.totalLlmTimeMs += Date.now() - t0;
      console.warn(`[LlmFieldClassifier] Batch failed (non-blocking): ${err instanceof Error ? err.message : String(err)}`);
      // Fallback gracieux — pas de crash, champs restent UNKNOWN
    }

    return results;
  }

  private buildPrompt(fields: UnknownField[]): string {
    const fieldDescriptions = fields.map((f, i) => {
      const lines = [
        `[${i + 1}] Table: ${f.tableName}, Column: ${f.columnName}`,
        `    Java type: ${f.javaType}`,
        `    Variable names: [${f.variableNames.join(", ")}]`,
      ];
      if (f.usageContext.length > 0) {
        lines.push(`    Usage: ${f.usageContext.slice(0, 3).join(" | ")}`);
      }
      if (f.comparedTo.length > 0) {
        lines.push(`    Compared to: [${f.comparedTo.slice(0, 5).join(", ")}]`);
      }
      if (f.joinedWith.length > 0) {
        lines.push(`    Joined with: [${f.joinedWith.join(", ")}]`);
      }
      return lines.join("\n");
    }).join("\n\n");

    return `You are a senior banking data architect analyzing a legacy banking application to classify database fields by business concept.

Available primary categories (use ONLY these):
- IDENTITY (clients, persons, third parties, ordonnateurs)
- ACCOUNT (bank accounts, RIB, IBAN, agencies)
- TRANSACTION (operations, channels, types, status)
- MONETARY (amounts, rates, fees)
- TIME (dates, durations, frequencies)
- CONTACT (emails, phones, addresses)
- GEOGRAPHY (countries, cities, postal codes, regions)
- STATUS (state codes, flags, validation states)
- DOCUMENT (orders, contracts, references)
- SYSTEM (technical IDs, audit, counters, versions, batch info)
- UNKNOWN (only if you genuinely cannot determine)

Classify each of the following ${fields.length} banking legacy fields. For each field, output:
- primaryCategory (from the list above)
- subConcept (free text, be precise - examples: "ThirdParty Beneficiary", "Order Counter (vignettes)", "Banking State Code")
- confidence (0-100)
- sensitivity: public|internal|pii|banking-sensitive|pci-dss
- businessRules (array of compliance rules, e.g. "PII subject to GDPR")
- suggestedRename (camelCase Java idiomatic)
- reasoning (1-2 sentences in French, why this classification)

CRITICAL RULES:
- Use French banking vocabulary knowledge (BMCE, Bank Al-Maghrib context).
- "Tiers" = ThirdParty (not Unknown). "Ordonnateur" = AccountHolder/Issuer.
- "Vignettes" = check vouchers count (SYSTEM.Counter).
- "Etat" / "Code etat" = StateCode (STATUS).
- "Type commande" / "Type op" = OperationType (TRANSACTION).
- If a field name is ambiguous AND no usage context disambiguates it, output UNKNOWN with confidence < 30. Do NOT guess.

Fields to classify:

${fieldDescriptions}

Output JSON array only, no preamble. Format:
[
  {
    "fieldIndex": 1,
    "primaryCategory": "SYSTEM",
    "subConcept": "Counter (vignettes - chequier vouchers)",
    "confidence": 85,
    "sensitivity": "internal",
    "businessRules": ["Validated 1-25 range per BMCE rules"],
    "suggestedRename": "nbVignettes",
    "reasoning": "Compteur de vignettes/chequiers, type Integer, compare a seuil maximum 25."
  }
]`;
  }

  private validateAndNormalize(
    item: LlmFieldResponse,
    field: UnknownField,
  ): LlmClassification | null {
    // Validate category
    let category = (item.primaryCategory || "").toUpperCase() as PrimaryCategory;
    if (!VALID_CATEGORIES.has(category)) {
      category = "UNKNOWN" as PrimaryCategory;
    }
    if (category === "UNKNOWN") return null; // No point storing UNKNOWN from LLM

    // Validate sensitivity
    let sensitivity = (item.sensitivity || "internal").toLowerCase();
    if (!VALID_SENSITIVITIES.has(sensitivity)) {
      sensitivity = "internal";
    }

    // Validate confidence
    const confidence = Math.max(0, Math.min(100, Math.round(item.confidence || 0)));

    // Build sub-concept label
    const subConcept = item.subConcept || `${category} (LLM-inferred)`;
    const subConceptLabel = subConcept;

    // Suggested rename
    const suggestedRename = item.suggestedRename || field.columnName.toLowerCase();

    return {
      primaryCategory: category,
      subConcept,
      subConceptLabel,
      confidence,
      sensitivity: sensitivity as LlmClassification["sensitivity"],
      businessRules: Array.isArray(item.businessRules) ? item.businessRules : [],
      suggestedRename,
      reasoning: item.reasoning || "",
      source: "llm",
    };
  }

  private cacheKey(field: UnknownField): string {
    return `${field.tableName}.${field.columnName}`;
  }

  private fieldHash(field: UnknownField): string {
    const data = JSON.stringify({
      t: field.tableName,
      c: field.columnName,
      j: field.javaType,
      v: field.variableNames.sort(),
      u: field.usageContext.slice(0, 3),
      cmp: field.comparedTo.sort(),
    });
    return createHash("sha256").update(data).digest("hex").substring(0, 16);
  }

  private splitIntoBatches<T>(items: T[], size: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
      batches.push(items.slice(i, i + size));
    }
    return batches;
  }
}
