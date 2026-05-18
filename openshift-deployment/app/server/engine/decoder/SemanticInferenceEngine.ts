/**
 * SemanticInferenceEngine v13.13 — LLM-powered semantic inference for cryptic DB columns.
 *
 * Takes FieldUsageAnalyzer output and uses LLM to infer business meaning.
 * Produces a structured glossary with confidence scores.
 *
 * Strategy:
 *   1. Build a context packet per field (variable names, log labels, comparisons, joins)
 *   2. Batch fields by table for efficient LLM calls
 *   3. Ask LLM to infer: business name (FR), business name (EN), description, domain
 *   4. Merge LLM output with static heuristics for final confidence
 *
 * @author Hamza NORDINE — Compleo
 */

import type { FieldUsage, FieldUsageAnalysisResult } from "./FieldUsageAnalyzer";
import { invokeLLM } from "../../_core/llm";

// ─── Interfaces ─────────────────────────────────────────────────────────────

export type SemanticConfidence = "high" | "medium" | "low" | "unresolved";

export interface SemanticField {
  /** Original DB column name */
  dbColumn: string;
  /** Table name */
  tableName: string;
  /** Inferred business name (French) */
  businessNameFr: string;
  /** Inferred business name (English) */
  businessNameEn: string;
  /** Business description */
  description: string;
  /** Business domain (e.g. "client", "compte", "transaction") */
  domain: string;
  /** Java type inferred from usage */
  javaType: string;
  /** Confidence level */
  confidence: SemanticConfidence;
  /** Confidence score 0-100 */
  confidenceScore: number;
  /** Sources that contributed to inference */
  sources: string[];
  /** Variable names found in code */
  variableNames: string[];
  /** Values compared to (enum hints) */
  comparedTo: string[];
  /** Join relationships */
  joinedWith: string[];
  /** Number of usage sites */
  usageCount: number;
  /** Whether LLM was used for inference */
  llmInferred: boolean;
}

export interface SemanticInferenceResult {
  fields: SemanticField[];
  stats: {
    total: number;
    high: number;
    medium: number;
    low: number;
    unresolved: number;
    llmCalls: number;
    llmTokensUsed: number;
  };
  executionTimeMs: number;
}

// ─── Banking abbreviation dictionary (French legacy systems) ────────────────

const BANKING_ABBREVS: Record<string, { fr: string; en: string; domain: string }> = {
  NOM: { fr: "nom", en: "name", domain: "identité" },
  PRENOM: { fr: "prénom", en: "first_name", domain: "identité" },
  ADR: { fr: "adresse", en: "address", domain: "coordonnées" },
  ADDR: { fr: "adresse", en: "address", domain: "coordonnées" },
  TEL: { fr: "téléphone", en: "phone", domain: "coordonnées" },
  NUM: { fr: "numéro", en: "number", domain: "référence" },
  DT: { fr: "date", en: "date", domain: "temporel" },
  MTT: { fr: "montant", en: "amount", domain: "financier" },
  MNT: { fr: "montant", en: "amount", domain: "financier" },
  LIB: { fr: "libellé", en: "label", domain: "description" },
  REF: { fr: "référence", en: "reference", domain: "référence" },
  TYP: { fr: "type", en: "type", domain: "classification" },
  COD: { fr: "code", en: "code", domain: "référence" },
  STA: { fr: "statut", en: "status", domain: "état" },
  OBS: { fr: "observation", en: "observation", domain: "description" },
  CDE: { fr: "code", en: "code", domain: "référence" },
  CPT: { fr: "compte", en: "account", domain: "compte" },
  AGE: { fr: "agence", en: "branch", domain: "organisation" },
  CLI: { fr: "client", en: "customer", domain: "client" },
  CTR: { fr: "contrat", en: "contract", domain: "contrat" },
  DEV: { fr: "devise", en: "currency", domain: "financier" },
  SOL: { fr: "solde", en: "balance", domain: "financier" },
  TAU: { fr: "taux", en: "rate", domain: "financier" },
  DUR: { fr: "durée", en: "duration", domain: "temporel" },
  ECH: { fr: "échéance", en: "maturity", domain: "temporel" },
  CAP: { fr: "capital", en: "principal", domain: "financier" },
  INT: { fr: "intérêt", en: "interest", domain: "financier" },
  PEN: { fr: "pénalité", en: "penalty", domain: "financier" },
  RIB: { fr: "RIB", en: "bank_account_id", domain: "compte" },
  IBAN: { fr: "IBAN", en: "iban", domain: "compte" },
  BIC: { fr: "BIC", en: "bic", domain: "compte" },
  SWIFT: { fr: "SWIFT", en: "swift", domain: "compte" },
  BNF: { fr: "bénéficiaire", en: "beneficiary", domain: "tiers" },
  DON: { fr: "donneur", en: "donor", domain: "tiers" },
  OPE: { fr: "opération", en: "operation", domain: "transaction" },
  MVT: { fr: "mouvement", en: "movement", domain: "transaction" },
  VIR: { fr: "virement", en: "transfer", domain: "transaction" },
  CHQ: { fr: "chèque", en: "check", domain: "instrument" },
  PRE: { fr: "prélèvement", en: "debit", domain: "transaction" },
  REM: { fr: "remise", en: "remittance", domain: "transaction" },
  ENC: { fr: "encaissement", en: "collection", domain: "transaction" },
  DEC: { fr: "décaissement", en: "disbursement", domain: "transaction" },
  GAR: { fr: "garantie", en: "guarantee", domain: "sûreté" },
  HYP: { fr: "hypothèque", en: "mortgage", domain: "sûreté" },
  ASS: { fr: "assurance", en: "insurance", domain: "assurance" },
  PRM: { fr: "prime", en: "premium", domain: "assurance" },
  COM: { fr: "commission", en: "commission", domain: "financier" },
  FRA: { fr: "frais", en: "fees", domain: "financier" },
  AGI: { fr: "agios", en: "bank_charges", domain: "financier" },
  RBT: { fr: "rabattement", en: "discount", domain: "financier" },
  ESC: { fr: "escompte", en: "discount", domain: "financier" },
  AVO: { fr: "avoir", en: "credit_note", domain: "financier" },
  DEB: { fr: "débit", en: "debit", domain: "financier" },
  CRD: { fr: "crédit", en: "credit", domain: "financier" },
  BEN: { fr: "bénéfice", en: "profit", domain: "financier" },
  PRT: { fr: "perte", en: "loss", domain: "financier" },
  BIL: { fr: "bilan", en: "balance_sheet", domain: "comptabilité" },
  CMP: { fr: "comptabilité", en: "accounting", domain: "comptabilité" },
  JNL: { fr: "journal", en: "ledger", domain: "comptabilité" },
  GRL: { fr: "grand livre", en: "general_ledger", domain: "comptabilité" },
  BAL: { fr: "balance", en: "trial_balance", domain: "comptabilité" },
  EXE: { fr: "exercice", en: "fiscal_year", domain: "comptabilité" },
  TRS: { fr: "transaction", en: "transaction", domain: "transaction" },
  SIG: { fr: "signature", en: "signature", domain: "sécurité" },
  AUT: { fr: "autorisation", en: "authorization", domain: "sécurité" },
  VAL: { fr: "valeur", en: "value", domain: "financier" },
  NAT: { fr: "nature", en: "nature", domain: "classification" },
  MOT: { fr: "motif", en: "reason", domain: "description" },
  DSG: { fr: "désignation", en: "designation", domain: "description" },
  IDT: { fr: "identifiant", en: "identifier", domain: "référence" },
  DAT: { fr: "date", en: "date", domain: "temporel" },
  NBR: { fr: "nombre", en: "count", domain: "quantité" },
  QTE: { fr: "quantité", en: "quantity", domain: "quantité" },
  PRC: { fr: "pourcentage", en: "percentage", domain: "financier" },
  FLG: { fr: "indicateur", en: "flag", domain: "état" },
  IND: { fr: "indicateur", en: "indicator", domain: "état" },
};

// ─── RS getter → Java type mapping ──────────────────────────────────────────

const RS_TYPE_MAP: Record<string, string> = {
  getString: "String", getLong: "Long", getInt: "Integer",
  getBigDecimal: "BigDecimal", getDate: "LocalDate",
  getTimestamp: "LocalDateTime", getBoolean: "Boolean",
  getDouble: "Double", getFloat: "Float",
};

// ─── Static heuristic inference ─────────────────────────────────────────────

function inferFromAbbreviations(fieldName: string): { fr: string; en: string; domain: string } | null {
  const upper = fieldName.toUpperCase();

  // Direct match
  if (BANKING_ABBREVS[upper]) return BANKING_ABBREVS[upper];

  // Prefix match (e.g. NOM_CLI → nom_client)
  for (const [abbr, info] of Object.entries(BANKING_ABBREVS)) {
    if (upper.startsWith(abbr + "_")) {
      const rest = upper.substring(abbr.length + 1);
      const restInfo = BANKING_ABBREVS[rest];
      return {
        fr: `${info.fr}_${restInfo ? restInfo.fr : rest.toLowerCase()}`,
        en: `${info.en}_${restInfo ? restInfo.en : rest.toLowerCase()}`,
        domain: info.domain,
      };
    }
  }

  // Suffix match (e.g. CLI_NOM → client_nom)
  for (const [abbr, info] of Object.entries(BANKING_ABBREVS)) {
    if (upper.endsWith("_" + abbr)) {
      const prefix = upper.substring(0, upper.length - abbr.length - 1);
      const prefixInfo = BANKING_ABBREVS[prefix];
      return {
        fr: `${prefixInfo ? prefixInfo.fr : prefix.toLowerCase()}_${info.fr}`,
        en: `${prefixInfo ? prefixInfo.en : prefix.toLowerCase()}_${info.en}`,
        domain: info.domain,
      };
    }
  }

  return null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function inferJavaType(field: FieldUsage): string {
  // From ResultSet getter — match the getter that references THIS field specifically
  for (const site of field.reads) {
    if (site.type === 'resultset-get') {
      // First try: find the getter that references this exact column name
      const specificRegex = new RegExp(`\\.(get\\w+)\\s*\\(\\s*"${escapeRegex(field.fieldName)}"`, 'i');
      const specificMatch = site.context.match(specificRegex);
      if (specificMatch && RS_TYPE_MAP[specificMatch[1]]) {
        return RS_TYPE_MAP[specificMatch[1]];
      }
      // Fallback: first getter in context (less reliable)
      const getterMatch = site.context.match(/\.(get\w+)\s*\(/);
      if (getterMatch && RS_TYPE_MAP[getterMatch[1]]) {
        return RS_TYPE_MAP[getterMatch[1]];
      }
    }
  }
  // From JPA annotation
  for (const site of field.reads) {
    if (site.type === 'jpa-column') {
      const typeMatch = site.context.match(/(?:private|protected|public)\s+(\w+)\s+/);
      if (typeMatch) return typeMatch[1];
    }
  }
  return "String";
}

// ─── Confidence scoring ─────────────────────────────────────────────────────

function computeConfidence(
  field: FieldUsage,
  hasStaticInference: boolean,
  hasLlmInference: boolean
): { level: SemanticConfidence; score: number; sources: string[] } {
  const sources: string[] = [];
  let score = 0;

  // Variable names (strong signal)
  if (field.variableNames.length > 0) {
    score += 35;
    sources.push(`variable names: ${field.variableNames.join(", ")}`);
    // Extra bonus for multiple distinct variable names (stronger cross-validation)
    if (field.variableNames.length >= 2) {
      score += 10;
      sources.push(`${field.variableNames.length} distinct variable names`);
    }
  }

  // Multiple files referencing (cross-validation)
  if (field.filesReferencing.length > 1) {
    score += 15;
    sources.push(`referenced in ${field.filesReferencing.length} files`);
  }

  // JPA annotation (very strong)
  if (field.reads.some(r => r.type === 'jpa-column')) {
    score += 25;
    sources.push("JPA @Column annotation");
  }

  // Setter mapping (strong)
  if (field.reads.some(r => r.type === 'resultset-get') && field.variableNames.length > 0) {
    score += 25;
    sources.push("ResultSet → setter mapping");
  }

  // PreparedStatement write (medium-strong signal)
  if (field.writes.some(w => w.type === 'sql-insert' || w.type === 'sql-update')) {
    score += 10;
    sources.push("SQL write operations");
  }

  // Log context (medium)
  if (field.loggedAs.length > 0) {
    score += 10;
    sources.push(`logged as: ${field.loggedAs.join(", ")}`);
  }

  // Comparison values (enum hints)
  if (field.comparedTo.length > 0) {
    score += 5;
    sources.push(`compared to: ${field.comparedTo.slice(0, 3).join(", ")}`);
  }

  // Join relationships (structural)
  if (field.joinedWith.length > 0) {
    score += 10;
    sources.push(`joins: ${field.joinedWith.join(", ")}`);
  }

  // Static abbreviation match
  if (hasStaticInference) {
    score += 20;
    sources.push("banking abbreviation dictionary");
  }

  // LLM inference
  if (hasLlmInference) {
    score += 10;
    sources.push("LLM semantic inference");
  }

  // Usage volume bonus
  if (field.totalUsages >= 5) score += 5;
  if (field.totalUsages >= 10) score += 5;

  // Cap at 100
  score = Math.min(100, score);

  let level: SemanticConfidence;
  if (score >= 65) level = "high";
  else if (score >= 35) level = "medium";
  else if (score >= 15) level = "low";
  else level = "unresolved";

  return { level, score, sources };
}

// ─── LLM batch inference ────────────────────────────────────────────────────

interface LlmFieldInference {
  dbColumn: string;
  businessNameFr: string;
  businessNameEn: string;
  description: string;
  domain: string;
}

async function batchLlmInference(
  tableName: string,
  fields: FieldUsage[]
): Promise<Map<string, LlmFieldInference>> {
  const result = new Map<string, LlmFieldInference>();

  if (fields.length === 0) return result;

  // Build context for LLM
  const fieldDescriptions = fields.map(f => {
    const parts: string[] = [`- ${f.fieldName}`];
    if (f.variableNames.length > 0) parts.push(`  variables: ${f.variableNames.join(", ")}`);
    if (f.loggedAs.length > 0) parts.push(`  logged as: ${f.loggedAs.join(", ")}`);
    if (f.comparedTo.length > 0) parts.push(`  compared to: ${f.comparedTo.slice(0, 5).join(", ")}`);
    if (f.joinedWith.length > 0) parts.push(`  joins: ${f.joinedWith.join(", ")}`);
    if (f.reads.length > 0) {
      const ctx = f.reads[0].context.substring(0, 150);
      parts.push(`  context: ${ctx}`);
    }
    return parts.join("\n");
  }).join("\n\n");

  const prompt = `Tu es un expert DBA Oracle spécialisé dans les systèmes bancaires legacy marocains (BMCE/BOA).
Analyse les colonnes cryptiques de la table "${tableName}" et infère leur signification métier.

Colonnes à analyser:
${fieldDescriptions}

Pour chaque colonne, retourne un JSON array avec:
- dbColumn: nom original
- businessNameFr: nom métier en français (snake_case)
- businessNameEn: nom métier en anglais (snake_case)
- description: description métier courte (1 phrase)
- domain: domaine métier (client, compte, transaction, financier, temporel, référence, etc.)

Réponds UNIQUEMENT avec le JSON array, sans markdown.`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: "Tu es un expert en reverse-engineering de schémas bancaires legacy. Réponds uniquement en JSON valide." },
        { role: "user", content: prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "field_inferences",
          strict: true,
          schema: {
            type: "object",
            properties: {
              fields: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    dbColumn: { type: "string" },
                    businessNameFr: { type: "string" },
                    businessNameEn: { type: "string" },
                    description: { type: "string" },
                    domain: { type: "string" },
                  },
                  required: ["dbColumn", "businessNameFr", "businessNameEn", "description", "domain"],
                  additionalProperties: false,
                },
              },
            },
            required: ["fields"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices?.[0]?.message?.content;
    if (typeof content === "string") {
      const parsed = JSON.parse(content);
      const inferences: LlmFieldInference[] = parsed.fields || parsed;
      for (const inf of inferences) {
        result.set(inf.dbColumn.toUpperCase(), inf);
      }
    }
  } catch (err) {
    console.warn(`[SemanticInferenceEngine] LLM inference failed for table ${tableName}:`, err);
  }

  return result;
}

// ─── Main Engine ────────────────────────────────────────────────────────────

export class SemanticInferenceEngine {
  private useLlm: boolean;

  constructor(options?: { useLlm?: boolean }) {
    this.useLlm = options?.useLlm ?? true;
  }

  /**
   * Run semantic inference on FieldUsageAnalyzer output.
   */
  async infer(analysisResult: FieldUsageAnalysisResult): Promise<SemanticInferenceResult> {
    const t0 = Date.now();
    const semanticFields: SemanticField[] = [];
    let llmCalls = 0;
    let llmTokensUsed = 0;

    // Group fields by table for batch LLM calls
    const fieldsByTable = new Map<string, FieldUsage[]>();
    for (const field of analysisResult.fields) {
      const table = field.tableName;
      if (!fieldsByTable.has(table)) fieldsByTable.set(table, []);
      fieldsByTable.get(table)!.push(field);
    }

    // Process each table
    for (const [tableName, fields] of fieldsByTable.entries()) {
      // Step 1: Static heuristic inference
      const staticInferences = new Map<string, { fr: string; en: string; domain: string }>();
      const needsLlm: FieldUsage[] = [];

      for (const field of fields) {
        const staticResult = inferFromAbbreviations(field.fieldName);
        if (staticResult) {
          staticInferences.set(field.fieldName.toUpperCase(), staticResult);
        }
        // Fields with no variable names and no static match need LLM
        if (!staticResult && field.variableNames.length === 0) {
          needsLlm.push(field);
        } else if (field.variableNames.length === 0) {
          // Has static match but no variable names — still useful to LLM-validate
          needsLlm.push(field);
        }
      }

      // Step 2: LLM batch inference (if enabled)
      let llmInferences = new Map<string, LlmFieldInference>();
      if (this.useLlm && needsLlm.length > 0) {
        // Batch in groups of 20 to avoid token limits
        for (let i = 0; i < needsLlm.length; i += 20) {
          const batch = needsLlm.slice(i, i + 20);
          const batchResult = await batchLlmInference(tableName, batch);
          for (const [k, v] of batchResult) llmInferences.set(k, v);
          llmCalls++;
        }
      }

      // Step 3: Merge results
      for (const field of fields) {
        const staticInf = staticInferences.get(field.fieldName.toUpperCase());
        const llmInf = llmInferences.get(field.fieldName.toUpperCase());
        const javaType = inferJavaType(field);

        // Determine best business name
        let businessNameFr = field.fieldName.toLowerCase();
        let businessNameEn = field.fieldName.toLowerCase();
        let description = "";
        let domain = "inconnu";
        let llmInferred = false;

        // Priority: variable names > LLM > static > fallback
        if (field.variableNames.length > 0) {
          // Use the most descriptive variable name
          const bestVar = field.variableNames.sort((a, b) => b.length - a.length)[0];
          businessNameFr = bestVar;
          businessNameEn = bestVar;
          if (staticInf) {
            domain = staticInf.domain;
            description = `Champ ${staticInf.fr} (déduit du code Java: ${bestVar})`;
          }
        }

        if (llmInf) {
          if (field.variableNames.length === 0) {
            businessNameFr = llmInf.businessNameFr;
            businessNameEn = llmInf.businessNameEn;
          }
          description = llmInf.description;
          domain = llmInf.domain;
          llmInferred = true;
        } else if (staticInf && field.variableNames.length === 0) {
          businessNameFr = staticInf.fr;
          businessNameEn = staticInf.en;
          domain = staticInf.domain;
          description = `Champ ${staticInf.fr} (déduit du dictionnaire bancaire)`;
        }

        const conf = computeConfidence(field, !!staticInf, !!llmInf);

        semanticFields.push({
          dbColumn: field.fieldName,
          tableName: field.tableName,
          businessNameFr,
          businessNameEn,
          description,
          domain,
          javaType,
          confidence: conf.level,
          confidenceScore: conf.score,
          sources: conf.sources,
          variableNames: field.variableNames,
          comparedTo: field.comparedTo,
          joinedWith: field.joinedWith,
          usageCount: field.totalUsages,
          llmInferred,
        });
      }
    }

    // Compute stats
    const stats = {
      total: semanticFields.length,
      high: semanticFields.filter(f => f.confidence === "high").length,
      medium: semanticFields.filter(f => f.confidence === "medium").length,
      low: semanticFields.filter(f => f.confidence === "low").length,
      unresolved: semanticFields.filter(f => f.confidence === "unresolved").length,
      llmCalls,
      llmTokensUsed,
    };

    return {
      fields: semanticFields,
      stats,
      executionTimeMs: Date.now() - t0,
    };
  }
}
