/**
 * Pipeline Retry — Compleo v10.5
 *
 * Fournit un mécanisme de retry automatique avec backoff exponentiel
 * pour les phases du pipeline qui échouent (timeout, erreur réseau, etc.).
 *
 * Stratégie :
 *   1. Première tentative immédiate
 *   2. Si échec → attendre (baseDelay * 2^attempt) + jitter
 *   3. Répéter jusqu'à maxRetries
 *   4. Si toutes les tentatives échouent → propager l'erreur (NEEDS_HUMAN)
 *
 * Seules les erreurs "retryable" déclenchent un retry :
 *   - PipelineTimeoutError (timeout de phase)
 *   - Erreurs réseau (ECONNREFUSED, ECONNRESET, ETIMEDOUT)
 *   - Erreurs Git transitoires (lock, connection)
 *   - Erreurs LLM transitoires (rate limit, timeout)
 *
 * Les erreurs "fatales" ne sont PAS retried :
 *   - Erreurs de parsing (code source invalide)
 *   - Erreurs de validation (config manquante)
 *   - Erreurs d'authentification
 *
 * @author Compleo
 */

import { PipelineTimeoutError } from "./pipeline-timeouts";

// ── Types ────────────────────────────────────────────────────────────────────

export interface RetryConfig {
  /** Nombre maximum de tentatives (incluant la première). Default: 3 */
  maxAttempts: number;
  /** Délai de base en ms pour le backoff. Default: 2000 (2s) */
  baseDelayMs: number;
  /** Multiplicateur du backoff. Default: 2 (exponentiel) */
  backoffMultiplier: number;
  /** Délai maximum entre deux tentatives en ms. Default: 30000 (30s) */
  maxDelayMs: number;
  /** Facteur de jitter (0-1). Default: 0.2 (±20%) */
  jitterFactor: number;
}

export interface RetryResult<T> {
  /** Le résultat si succès */
  result: T;
  /** Nombre total de tentatives effectuées */
  attempts: number;
  /** Durée totale en ms (incluant les attentes) */
  totalDurationMs: number;
  /** Historique des erreurs des tentatives échouées */
  failedAttempts: RetryAttemptError[];
}

export interface RetryAttemptError {
  attempt: number;
  error: string;
  durationMs: number;
  retryable: boolean;
}

export interface RetryEvent {
  type: "RETRY_ATTEMPT";
  phase: string;
  attempt: number;
  maxAttempts: number;
  error: string;
  nextDelayMs: number;
}

// ── Configuration par défaut ─────────────────────────────────────────────────

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 2000,
  backoffMultiplier: 2,
  maxDelayMs: 30_000,
  jitterFactor: 0.2,
};

/** Configuration spécifique par phase */
export const PHASE_RETRY_CONFIG: Record<string, Partial<RetryConfig>> = {
  CLONING: { maxAttempts: 3, baseDelayMs: 3000 },      // Git clone peut timeout
  ANALYZING: { maxAttempts: 2, baseDelayMs: 2000 },    // Parser rarement transitoire
  GENERATING: { maxAttempts: 2, baseDelayMs: 2000 },   // Génération rarement transitoire
  MICROSERVICES: { maxAttempts: 2, baseDelayMs: 2000 },
  ENHANCING_REPORTS: { maxAttempts: 3, baseDelayMs: 5000 }, // LLM peut rate-limit
  COMPILING: { maxAttempts: 2, baseDelayMs: 3000 },    // Compilation peut OOM
  PUSHING: { maxAttempts: 3, baseDelayMs: 3000 },      // Git push peut timeout
};

// ── Détection d'erreurs retryable ────────────────────────────────────────────

const RETRYABLE_ERROR_PATTERNS = [
  // Timeout
  /timeout/i,
  /timed?\s*out/i,
  /ETIMEDOUT/,
  // Réseau
  /ECONNREFUSED/,
  /ECONNRESET/,
  /ENOTFOUND/,
  /ENETUNREACH/,
  /socket hang up/i,
  /network/i,
  // Git
  /lock/i,
  /could not read from remote/i,
  /connection.*closed/i,
  /fatal:.*unable to access/i,
  // LLM / API
  /rate.?limit/i,
  /429/,
  /503/,
  /502/,
  /too many requests/i,
  /service unavailable/i,
  // Mémoire transitoire
  /ENOMEM/,
  /out of memory/i,
  // Fichier lock
  /EBUSY/,
  /resource busy/i,
];

const FATAL_ERROR_PATTERNS = [
  // Authentification
  /unauthorized/i,
  /forbidden/i,
  /401/,
  /403/,
  // Validation
  /invalid.*config/i,
  /missing.*required/i,
  /validation.*failed/i,
  // Parsing (erreur dans le code source)
  /syntax.*error/i,
  /unexpected.*token/i,
  // Permissions
  /permission denied/i,
  /EACCES/,
];

/**
 * Détermine si une erreur est retryable.
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof PipelineTimeoutError) return true;

  const message = error instanceof Error ? error.message : String(error);

  // Vérifier d'abord si c'est une erreur fatale
  for (const pattern of FATAL_ERROR_PATTERNS) {
    if (pattern.test(message)) return false;
  }

  // Vérifier si c'est une erreur retryable connue
  for (const pattern of RETRYABLE_ERROR_PATTERNS) {
    if (pattern.test(message)) return true;
  }

  // Par défaut, les erreurs inconnues ne sont PAS retried
  return false;
}

// ── Calcul du délai ──────────────────────────────────────────────────────────

/**
 * Calcule le délai avant la prochaine tentative (backoff exponentiel + jitter).
 */
export function calculateDelay(attempt: number, config: RetryConfig): number {
  // Backoff exponentiel : baseDelay * multiplier^attempt
  const exponentialDelay = config.baseDelayMs * Math.pow(config.backoffMultiplier, attempt);

  // Plafonner au maxDelay
  const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);

  // Ajouter du jitter (±jitterFactor)
  const jitter = cappedDelay * config.jitterFactor * (Math.random() * 2 - 1);

  return Math.max(0, Math.round(cappedDelay + jitter));
}

// ── Fonction utilitaire sleep ────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Retry principal ──────────────────────────────────────────────────────────

/**
 * Exécute une opération avec retry automatique et backoff exponentiel.
 *
 * @param phase - Nom de la phase (pour les logs et la config)
 * @param operation - La fonction async à exécuter
 * @param onRetry - Callback optionnel appelé avant chaque retry (pour émettre des events SSE)
 * @param customConfig - Configuration de retry personnalisée (override la config par phase)
 * @returns RetryResult avec le résultat et les métadonnées de retry
 * @throws L'erreur originale si toutes les tentatives échouent ou si l'erreur est fatale
 */
export async function withRetry<T>(
  phase: string,
  operation: () => Promise<T>,
  onRetry?: (event: RetryEvent) => void,
  customConfig?: Partial<RetryConfig>,
): Promise<RetryResult<T>> {
  const phaseConfig = PHASE_RETRY_CONFIG[phase] ?? {};
  const config: RetryConfig = {
    ...DEFAULT_RETRY_CONFIG,
    ...phaseConfig,
    ...customConfig,
  };

  const failedAttempts: RetryAttemptError[] = [];
  const startTime = Date.now();

  for (let attempt = 0; attempt < config.maxAttempts; attempt++) {
    const attemptStart = Date.now();

    try {
      const result = await operation();
      return {
        result,
        attempts: attempt + 1,
        totalDurationMs: Date.now() - startTime,
        failedAttempts,
      };
    } catch (error) {
      const durationMs = Date.now() - attemptStart;
      const errorMessage = error instanceof Error ? error.message : String(error);
      const retryable = isRetryableError(error);

      failedAttempts.push({
        attempt: attempt + 1,
        error: errorMessage,
        durationMs,
        retryable,
      });

      // Si l'erreur n'est pas retryable → propager immédiatement
      if (!retryable) {
        throw error;
      }

      // Si c'est la dernière tentative → propager l'erreur
      if (attempt >= config.maxAttempts - 1) {
        throw error;
      }

      // Calculer le délai avant la prochaine tentative
      const nextDelay = calculateDelay(attempt, config);

      // Émettre l'événement de retry (pour le SSE)
      if (onRetry) {
        onRetry({
          type: "RETRY_ATTEMPT",
          phase,
          attempt: attempt + 1,
          maxAttempts: config.maxAttempts,
          error: errorMessage,
          nextDelayMs: nextDelay,
        });
      }

      // Attendre avant la prochaine tentative
      await sleep(nextDelay);
    }
  }

  // Ne devrait jamais arriver (le throw dans la boucle couvre tous les cas)
  throw new Error(`[pipeline-retry] Unexpected: all ${config.maxAttempts} attempts exhausted for phase ${phase}`);
}

/**
 * Version generator du retry — émet des AgentEvents entre les tentatives.
 * Utilisé dans le CompleoAgent pour intégrer les retries dans le flux SSE.
 */
export async function* withRetryGenerator<T>(
  phase: string,
  operation: () => Promise<T>,
  customConfig?: Partial<RetryConfig>,
): AsyncGenerator<RetryEvent, RetryResult<T>> {
  const phaseConfig = PHASE_RETRY_CONFIG[phase] ?? {};
  const config: RetryConfig = {
    ...DEFAULT_RETRY_CONFIG,
    ...phaseConfig,
    ...customConfig,
  };

  const failedAttempts: RetryAttemptError[] = [];
  const startTime = Date.now();

  for (let attempt = 0; attempt < config.maxAttempts; attempt++) {
    const attemptStart = Date.now();

    try {
      const result = await operation();
      return {
        result,
        attempts: attempt + 1,
        totalDurationMs: Date.now() - startTime,
        failedAttempts,
      };
    } catch (error) {
      const durationMs = Date.now() - attemptStart;
      const errorMessage = error instanceof Error ? error.message : String(error);
      const retryable = isRetryableError(error);

      failedAttempts.push({
        attempt: attempt + 1,
        error: errorMessage,
        durationMs,
        retryable,
      });

      // Si l'erreur n'est pas retryable → propager immédiatement
      if (!retryable) {
        throw error;
      }

      // Si c'est la dernière tentative → propager l'erreur
      if (attempt >= config.maxAttempts - 1) {
        throw error;
      }

      // Calculer le délai
      const nextDelay = calculateDelay(attempt, config);

      // Yield l'événement de retry
      yield {
        type: "RETRY_ATTEMPT",
        phase,
        attempt: attempt + 1,
        maxAttempts: config.maxAttempts,
        error: errorMessage,
        nextDelayMs: nextDelay,
      };

      // Attendre
      await sleep(nextDelay);
    }
  }

  throw new Error(`[pipeline-retry] Unexpected: all ${config.maxAttempts} attempts exhausted for phase ${phase}`);
}
