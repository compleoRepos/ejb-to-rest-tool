/**
 * Pipeline Timeouts & Recovery — Compleo v10.4 STEP 3
 *
 * Définit les timeouts par phase du pipeline et fournit un wrapper
 * pour exécuter des opérations avec timeout + recovery.
 *
 * @author Compleo
 */

import type { AgentPhase } from "./CompleoAgent";

/**
 * Timeouts par phase du pipeline (en ms).
 * Ajustés selon la complexité de chaque phase.
 */
export const PHASE_TIMEOUTS: Record<string, number> = {
  CLONING: 120_000,          // 2 min — clone git
  ANALYZING: 180_000,        // 3 min — parsing + analyse multi-tech
  GENERATING: 300_000,       // 5 min — génération Spring Boot
  MICROSERVICES: 300_000,    // 5 min — découpage microservices + saga
  ENHANCING_REPORTS: 300_000, // 5 min — enrichissement rapports ML
  COMPILING: 600_000,        // 10 min — compilation + self-healing loop
  TESTING: 180_000,          // 3 min — tests
  PUSHING: 120_000,          // 2 min — push git / ZIP S3
  MIGRATING_BUSINESS_LOGIC: 600_000, // 10 min — migration LLM des corps de méthodes
};

/**
 * Timeout global du pipeline (30 min max).
 */
export const PIPELINE_GLOBAL_TIMEOUT = 1_800_000;

export class PipelineTimeoutError extends Error {
  public readonly phase: string;
  public readonly timeoutMs: number;

  constructor(phase: string, timeoutMs: number) {
    super(`Phase ${phase} a dépassé le timeout de ${timeoutMs / 1000}s`);
    this.name = "PipelineTimeoutError";
    this.phase = phase;
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Execute an async operation with a timeout.
 * If the operation exceeds the timeout, throws PipelineTimeoutError.
 */
export async function withPhaseTimeout<T>(
  phase: string,
  operation: () => Promise<T>,
  customTimeout?: number,
): Promise<T> {
  const timeout = customTimeout ?? PHASE_TIMEOUTS[phase] ?? 300_000;

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new PipelineTimeoutError(phase, timeout));
    }, timeout);

    operation()
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/**
 * Check if an error is a timeout error (for recovery logic).
 */
export function isTimeoutError(err: unknown): err is PipelineTimeoutError {
  return err instanceof PipelineTimeoutError;
}
