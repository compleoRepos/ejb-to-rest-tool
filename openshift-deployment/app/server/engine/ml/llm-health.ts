/**
 * LLM Health Check & Timeout Configuration — Compleo v10.4
 *
 * Centralise la vérification de santé des backends LLM
 * et les timeouts par type d'opération.
 *
 * @author Compleo
 */

import { getBackendStatus } from "./llm-adapter";

export type LLMPurpose =
  | "compilation_fix"
  | "report_enhance"
  | "saga_enrich"
  | "ambiguity"
  | "microservice_split"
  | "general";

/**
 * Timeouts par type d'opération LLM (en ms).
 * Ajustés selon la complexité de la tâche.
 */
export const LLM_TIMEOUTS: Record<LLMPurpose, number> = {
  compilation_fix: 30_000,   // 30s — fix rapide
  report_enhance: 60_000,    // 60s — rapport narratif
  saga_enrich: 45_000,       // 45s — enrichissement saga
  ambiguity: 20_000,         // 20s — résolution ambiguïté
  microservice_split: 45_000, // 45s — découpage microservices
  general: 30_000,           // 30s — usage général
};

export interface LLMHealthStatus {
  activeBackend: "finetuned" | "manus" | "ollama-generic" | "none";
  finetuned: boolean;
  manus: boolean;
  lastChecked: number;
}

let cachedHealth: LLMHealthStatus | null = null;
let lastCheckTime = 0;
const HEALTH_CHECK_INTERVAL = 60_000; // Re-check every 60s

/**
 * Check LLM health with caching (avoids spamming Ollama).
 */
export async function checkLLMHealth(): Promise<LLMHealthStatus> {
  const now = Date.now();
  if (cachedHealth && now - lastCheckTime < HEALTH_CHECK_INTERVAL) {
    return cachedHealth;
  }

  try {
    const status = await getBackendStatus();
    cachedHealth = {
      activeBackend: status.preferred === "none" ? "none" : status.preferred as any,
      finetuned: status.finetuned,
      manus: status.manus,
      lastChecked: now,
    };
    lastCheckTime = now;
    return cachedHealth;
  } catch {
    cachedHealth = {
      activeBackend: "none",
      finetuned: false,
      manus: false,
      lastChecked: now,
    };
    lastCheckTime = now;
    return cachedHealth;
  }
}

/**
 * Get timeout for a specific LLM purpose.
 */
export function getTimeoutForPurpose(purpose: LLMPurpose): number {
  return LLM_TIMEOUTS[purpose];
}
