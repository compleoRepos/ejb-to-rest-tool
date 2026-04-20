/**
 * SagaMLEnricher — Compleo v7.10
 *
 * Orchestrateur ML pour l'enrichissement des steps Saga.
 * Utilise Ollama (qwen2.5-coder:1.5b) pour enrichir les squelettes Saga
 * générés par le rule engine avec :
 *   - Corps Java des steps (logique métier migrée)
 *   - Corps Java des compensations (actions inverses concrètes)
 *   - Champs de contexte typés
 *   - Recommandations de retry policy
 *   - Préconditions / Postconditions
 *
 * Fallback automatique vers le rule-based si Ollama est absent.
 *
 * @author Hamza NORDINE
 */

import type { SagaStep, IntermediateResult } from "../saga-step-extractor";
import type { SagaCandidate } from "../saga-detector";
import {
  type StepContext,
  type MLStepEnrichment,
  buildStepBodyPrompt,
  buildCompensationPrompt,
  parseMLResponse,
} from "./prompts";
import { validateSagaMLOutput, type SagaMLValidation } from "./validateSagaMLOutput";
import { generateFallbackEnrichment } from "./fallback";

// ── Types ────────────────────────────────────────────────────────────────────

export interface SagaMLConfig {
  /** URL Ollama (ex: http://localhost:11434) */
  ollamaUrl: string;
  /** Modèle LLM (ex: qwen2.5-coder:1.5b) */
  model: string;
  /** Timeout par appel en ms (défaut: 30000) */
  timeout?: number;
}

export interface SagaMLResult {
  /** Enrichissements par step (indexé par stepNumber) */
  enrichments: Map<number, MLStepEnrichment>;
  /** Source de chaque enrichissement */
  sources: Map<number, "ml" | "fallback">;
  /** Validations ML (pour les steps enrichis par ML) */
  validations: Map<number, SagaMLValidation>;
  /** Statistiques globales */
  stats: {
    totalSteps: number;
    mlEnriched: number;
    fallbackUsed: number;
    validationIssues: number;
    totalDurationMs: number;
  };
}

// ── Enricher ────────────────────────────────────────────────────────────────

export class SagaMLEnricher {
  private ollamaUrl: string;
  private model: string;
  private timeout: number;
  private _available: boolean | null = null;

  constructor(config: SagaMLConfig) {
    this.ollamaUrl = config.ollamaUrl.replace(/\/$/, "");
    this.model = config.model;
    this.timeout = config.timeout ?? 30_000;
  }

  /**
   * Vérifie si le LLM est disponible (Manus invokeLLM ou Ollama).
   * Résultat mis en cache pour la durée de vie de l'instance.
   */
  async isAvailable(): Promise<boolean> {
    if (this._available !== null) return this._available;

    // 1. Try Manus invokeLLM
    try {
      const { isLLMAvailable } = await import("../../ml/llm-adapter");
      if (await isLLMAvailable()) {
        this._available = true;
        return true;
      }
    } catch { /* Manus not available */ }

    // 2. Fallback: try Ollama
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 3_000);
      const res = await fetch(`${this.ollamaUrl}/api/version`, {
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      this._available = res.ok;
    } catch {
      this._available = false;
    }

    return this._available;
  }

  /**
   * Enrichit tous les steps d'une Saga avec le LLM.
   * Fallback automatique si Ollama est absent.
   */
  async enrichSaga(
    candidate: SagaCandidate,
    steps: SagaStep[],
    intermediateResults: IntermediateResult[],
  ): Promise<SagaMLResult> {
    const startTime = Date.now();
    const enrichments = new Map<number, MLStepEnrichment>();
    const sources = new Map<number, "ml" | "fallback">();
    const validations = new Map<number, SagaMLValidation>();
    let mlCount = 0;
    let fallbackCount = 0;
    let issueCount = 0;

    const available = await this.isAvailable();

    // Construire la liste des services disponibles
    const availableServices = candidate.ejbDependencies.map(
      (d) => d.serviceName || d.name,
    );

    // Construire la liste des exceptions connues
    const availableExceptions = extractExceptions(candidate.rawSource);

    // Construire la liste des SQL statements
    const sqlStatements = extractSqlStatements(candidate.rawSource);

    // Enrichir chaque step séquentiellement
    const contextSoFar: string[] = [];

    for (const step of steps) {
      const ctx: StepContext = {
        stepNumber: step.order,
        stepLabel: step.label,
        stepType: step.type,
        isCompensable: step.isCompensable,
        targetService: step.targetService,
        targetMethod: step.targetMethod,
        ejbSourceCode: extractStepSourceCode(candidate.rawSource, step),
        availableServices,
        availableContext: [...contextSoFar],
        availableExceptions,
        sqlStatements,
      };

      let enrichment: MLStepEnrichment;
      let source: "ml" | "fallback";

      if (available) {
        // Tenter l'enrichissement ML
        const mlResult = await this.enrichStep(ctx);

        if (mlResult) {
          // Valider la sortie ML
          const validation = validateSagaMLOutput(mlResult, ctx);
          validations.set(step.order, validation);
          issueCount += validation.issues.length;

          if (validation.isValid) {
            enrichment = validation.cleanedOutput;
            source = "ml";
            mlCount++;
          } else {
            // Fallback si la validation échoue
            enrichment = generateFallbackEnrichment(ctx);
            source = "fallback";
            fallbackCount++;
          }
        } else {
          // Fallback si le LLM ne répond pas
          enrichment = generateFallbackEnrichment(ctx);
          source = "fallback";
          fallbackCount++;
        }
      } else {
        // Ollama absent → fallback direct
        enrichment = generateFallbackEnrichment(ctx);
        source = "fallback";
        fallbackCount++;
      }

      enrichments.set(step.order, enrichment);
      sources.set(step.order, source);

      // Mettre à jour le contexte disponible pour les steps suivants
      for (const field of enrichment.contextFields) {
        contextSoFar.push(`${field.name} (${field.type})`);
      }
    }

    return {
      enrichments,
      sources,
      validations,
      stats: {
        totalSteps: steps.length,
        mlEnriched: mlCount,
        fallbackUsed: fallbackCount,
        validationIssues: issueCount,
        totalDurationMs: Date.now() - startTime,
      },
    };
  }

  /**
   * Enrichit un step individuel via le LLM.
   * Retourne null si le LLM ne produit pas de réponse valide.
   */
  private async enrichStep(ctx: StepContext): Promise<MLStepEnrichment | null> {
    try {
      const prompt = buildStepBodyPrompt(ctx);
      const response = await this.callOllama(prompt);

      if (!response) return null;

      const parsed = parseMLResponse<MLStepEnrichment>(response);
      if (!parsed) return null;

      // Vérifier les champs obligatoires
      if (!parsed.stepBody || typeof parsed.stepBody !== "string") return null;

      // Normaliser les champs optionnels
      return {
        stepBody: parsed.stepBody,
        compensationBody: parsed.compensationBody || "",
        contextFields: Array.isArray(parsed.contextFields) ? parsed.contextFields : [],
        retryRecommendation: parsed.retryRecommendation || "",
        preconditions: Array.isArray(parsed.preconditions) ? parsed.preconditions : [],
        postconditions: Array.isArray(parsed.postconditions) ? parsed.postconditions : [],
      };
    } catch {
      return null;
    }
  }

  /**
   * Enrichit la compensation d'un step via le LLM.
   * Utilisé quand la compensation du prompt principal est insuffisante.
   */
  async enrichCompensation(ctx: StepContext): Promise<string | null> {
    try {
      const prompt = buildCompensationPrompt(ctx);
      const response = await this.callOllama(prompt);

      if (!response) return null;

      const parsed = parseMLResponse<{ compensationBody: string }>(response);
      return parsed?.compensationBody || null;
    } catch {
      return null;
    }
  }

  /**
   * Appel LLM via l'adaptateur unifié (Manus + Ollama fallback).
   */
  private async callOllama(prompt: string): Promise<string | null> {
    try {
      const { llmGenerate } = await import("../../ml/llm-adapter");
      return await llmGenerate(
        prompt,
        { temperature: 0.1, maxTokens: 1200, stop: ["```", "// END"] },
        { ollamaUrl: this.ollamaUrl, model: this.model, timeoutMs: this.timeout },
      );
    } catch {
      return null;
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extrait le code source EJB autour d'un step spécifique.
 * Cherche les commentaires "ÉTAPE N" et retourne le bloc correspondant.
 */
function extractStepSourceCode(source: string, step: SagaStep): string {
  // Chercher le commentaire du step
  const stepPattern = new RegExp(
    `//\\s*[ÉE]TAPE\\s+${step.order}\\s*[—\\-–][^\\n]*\\n([\\s\\S]*?)(?=//\\s*[ÉE]TAPE\\s+\\d|$)`,
  );
  const match = source.match(stepPattern);
  if (match) return match[1].substring(0, 800);

  // Sinon, chercher l'appel de méthode
  const methodPattern = new RegExp(
    `[^\\n]*${escapeRegex(step.targetMethod)}\\s*\\([^)]*\\)[^\\n]*`,
    "g",
  );
  const methodMatches = source.match(methodPattern);
  if (methodMatches) return methodMatches.join("\n").substring(0, 800);

  return source.substring(0, 500);
}

/**
 * Extrait les exceptions mentionnées dans le code EJB.
 */
function extractExceptions(source: string): string[] {
  const exceptions = new Set<string>();
  const pattern = /catch\s*\(\s*(\w+Exception)\b/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    exceptions.add(match[1]);
  }
  // Aussi les throws
  const throwsPattern = /throws\s+([\w,\s]+Exception)/g;
  while ((match = throwsPattern.exec(source)) !== null) {
    for (const ex of match[1].split(",")) {
      const trimmed = ex.trim();
      if (trimmed.endsWith("Exception")) exceptions.add(trimmed);
    }
  }
  return Array.from(exceptions);
}

/**
 * Extrait les requêtes SQL détectées dans le code EJB.
 */
function extractSqlStatements(source: string): string[] {
  const statements: string[] = [];
  const sqlPattern = /"((?:SELECT|INSERT|UPDATE|DELETE|MERGE)\s[^"]{10,})"/gi;
  let match: RegExpExecArray | null;
  while ((match = sqlPattern.exec(source)) !== null) {
    statements.push(match[1].substring(0, 300));
  }
  return statements;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
