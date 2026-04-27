/**
 * LLM Adapter — Compleo v9.0
 *
 * Adaptateur unifié pour les appels LLM avec support du modèle fine-tuné.
 *
 * Ordre de priorité :
 *   1. Ollama local — modèle fine-tuné `ejb-modernizer` (27K paires d'entraînement)
 *   2. Manus invokeLLM (cloud) — modèle généraliste
 *   3. null → les appelants gèrent le fallback rule-based
 *
 * Le modèle fine-tuné est prioritaire car il a été entraîné spécifiquement
 * sur 27 237 paires de transformation Java EE → Spring Boot, extraites de
 * 884 projets GitHub enterprise + 4 projets bancaires réels.
 *
 * @author Hamza NORDINE
 */

import { invokeLLM } from "../../_core/llm";

// ── Types ────────────────────────────────────────────────────────

export interface LLMGenerateOptions {
  temperature?: number;
  maxTokens?:   number;
  stop?:        string[];
}

export interface LLMAdapterConfig {
  /** Ollama URL (default: http://localhost:11434) */
  ollamaUrl?:  string;
  /** Ollama model name (default: ejb-modernizer) */
  model?:      string;
  /** Timeout in ms */
  timeoutMs?:  number;
  /** Force a specific backend (bypass priority chain) */
  forceBackend?: "finetuned" | "manus" | "ollama-generic";
}

/**
 * Model tier used for the generation.
 * Allows callers to know which backend produced the result.
 */
export type LLMBackend = "finetuned" | "manus" | "ollama-generic" | "none";

export interface LLMGenerateResult {
  text:    string;
  backend: LLMBackend;
}

// ── Constants ───────────────────────────────────────────────────

/** Default fine-tuned model name (created via `ollama create ejb-modernizer -f Modelfile`) */
const FINETUNED_MODEL = process.env.FINETUNED_MODEL || "ejb-modernizer";

/** Default generic Ollama model (fallback if fine-tuned not available) */
const GENERIC_MODEL = "qwen2.5-coder:1.5b";

/** Default Ollama URL */
const DEFAULT_OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";

/** System prompt optimisé pour le modèle fine-tuné */
const FINETUNED_SYSTEM_PROMPT = `Tu es un expert en modernisation de code Java EE legacy vers Spring Boot 3.x et microservices cloud-native.
Tu transformes le code en respectant les conventions Spring Boot : injection par constructeur, @Service, @Repository, @RestController, @Transactional, Spring Data JPA, etc.
Retourne UNIQUEMENT le code Java modernisé.`;

/** System prompt pour le modèle généraliste (Manus cloud) */
const GENERIC_SYSTEM_PROMPT = `Tu es un expert Java EE / Spring Boot 3.2 spécialisé dans la migration d'applications legacy bancaires. Réponds uniquement avec le contenu demandé, sans commentaires superflus.`;

// ── Availability cache ──────────────────────────────────────────

interface AvailabilityCache {
  finetuned:     boolean | null;
  manus:         boolean | null;
  ollamaGeneric: boolean | null;
  lastCheck:     number;
}

const _cache: AvailabilityCache = {
  finetuned:     null,
  manus:         null,
  ollamaGeneric: null,
  lastCheck:     0,
};

/** Cache TTL: re-check availability every 5 minutes */
const CACHE_TTL_MS = 5 * 60 * 1000;

function isCacheStale(): boolean {
  return Date.now() - _cache.lastCheck > CACHE_TTL_MS;
}

// ── Ollama helpers ──────────────────────────────────────────────

/**
 * Check if a specific Ollama model is available.
 */
async function isOllamaModelAvailable(
  ollamaUrl: string,
  modelName: string,
  timeoutMs = 5000,
): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(`${ollamaUrl}/api/tags`, {
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) return false;

    const data = await res.json() as { models?: Array<{ name: string }> };
    const models = data.models ?? [];
    return models.some(m =>
      m.name === modelName ||
      m.name.startsWith(`${modelName}:`)
    );
  } catch {
    return false;
  }
}

/**
 * Generate text using an Ollama model.
 */
async function ollamaGenerate(
  ollamaUrl: string,
  model:     string,
  prompt:    string,
  systemPrompt: string,
  options?:  LLMGenerateOptions,
  timeoutMs = 60_000,
): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(`${ollamaUrl}/api/generate`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        model,
        prompt,
        system: systemPrompt,
        stream: false,
        options: {
          temperature: options?.temperature ?? 0.1,
          num_predict: options?.maxTokens ?? 800,
          ...(options?.stop ? { stop: options.stop } : {}),
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json() as { response: string };
      if (data.response?.trim()) {
        return data.response.trim();
      }
    }
  } catch {
    // Model unavailable
  }
  return null;
}

// ── Availability checks ─────────────────────────────────────────

/**
 * Check if the fine-tuned model is available on Ollama.
 */
export async function isFinetunedAvailable(ollamaUrl?: string): Promise<boolean> {
  if (_cache.finetuned !== null && !isCacheStale()) return _cache.finetuned;

  _cache.finetuned = await isOllamaModelAvailable(
    ollamaUrl ?? DEFAULT_OLLAMA_URL,
    FINETUNED_MODEL,
  );
  _cache.lastCheck = Date.now();
  return _cache.finetuned;
}

/**
 * Check if the Manus LLM API is available.
 * Result is cached for the lifetime of the process.
 */
export async function isLLMAvailable(): Promise<boolean> {
  if (_cache.manus !== null && !isCacheStale()) return _cache.manus;

  try {
    const result = await invokeLLM({
      messages: [
        { role: "user", content: "ping" },
      ],
    });
    _cache.manus = !!result?.choices?.[0]?.message?.content;
  } catch {
    _cache.manus = false;
  }

  _cache.lastCheck = Date.now();
  return _cache.manus;
}

/**
 * Reset the availability cache (useful for testing).
 */
export function resetAvailabilityCache(): void {
  _cache.finetuned = null;
  _cache.manus = null;
  _cache.ollamaGeneric = null;
  _cache.lastCheck = 0;
}

/**
 * Get the current backend status for diagnostics.
 */
export async function getBackendStatus(ollamaUrl?: string): Promise<{
  finetuned: boolean;
  manus:     boolean;
  preferred: LLMBackend;
}> {
  const url = ollamaUrl ?? DEFAULT_OLLAMA_URL;
  const finetuned = await isFinetunedAvailable(url);
  const manus = await isLLMAvailable();

  return {
    finetuned,
    manus,
    preferred: finetuned ? "finetuned" : manus ? "manus" : "none",
  };
}

// ── Main generate function ───────────────────────────────────────

/**
 * Generate text from a prompt using the best available LLM.
 *
 * Priority chain:
 *   1. Fine-tuned `ejb-modernizer` on Ollama (specialized, 27K training pairs)
 *   2. Manus invokeLLM (cloud, generalist)
 *   3. Generic Ollama model (local fallback)
 *   4. null (caller handles fallback to rule-based)
 *
 * @param prompt   The full prompt text
 * @param options  Generation options (temperature, maxTokens, stop)
 * @param config   Adapter config (ollamaUrl, model override, forceBackend)
 * @returns        Generated text and backend used, or null if all backends fail
 */
export async function llmGenerate(
  prompt:   string,
  options?: LLMGenerateOptions,
  config?:  LLMAdapterConfig,
): Promise<string | null> {
  const result = await llmGenerateWithBackend(prompt, options, config);
  return result?.text ?? null;
}

/**
 * Generate text with backend information.
 * Same as llmGenerate but returns which backend was used.
 */
export async function llmGenerateWithBackend(
  prompt:   string,
  options?: LLMGenerateOptions,
  config?:  LLMAdapterConfig,
): Promise<LLMGenerateResult | null> {
  const ollamaUrl = config?.ollamaUrl ?? DEFAULT_OLLAMA_URL;

  // ── Force a specific backend if requested ──
  if (config?.forceBackend === "finetuned") {
    const text = await ollamaGenerate(
      ollamaUrl, FINETUNED_MODEL, prompt, FINETUNED_SYSTEM_PROMPT, options, config?.timeoutMs,
    );
    if (text) return { text, backend: "finetuned" };
    return null;
  }
  if (config?.forceBackend === "manus") {
    const text = await manusGenerate(prompt, options);
    if (text) return { text, backend: "manus" };
    return null;
  }

  // ── Priority 1: Fine-tuned model on Ollama ──
  const ftAvailable = await isFinetunedAvailable(ollamaUrl);
  if (ftAvailable) {
    const text = await ollamaGenerate(
      ollamaUrl, FINETUNED_MODEL, prompt, FINETUNED_SYSTEM_PROMPT, options, config?.timeoutMs,
    );
    if (text) {
      return { text, backend: "finetuned" };
    }
    // Fine-tuned model listed but generation failed → continue to next
    _cache.finetuned = false;
  }

  // ── Priority 2: Manus invokeLLM (cloud) ──
  const manusText = await manusGenerate(prompt, options);
  if (manusText) {
    return { text: manusText, backend: "manus" };
  }

  // ── Priority 3: Generic Ollama model (fallback) ──
  const genericModel = config?.model ?? GENERIC_MODEL;
  const genericText = await ollamaGenerate(
    ollamaUrl, genericModel, prompt, GENERIC_SYSTEM_PROMPT, options, config?.timeoutMs,
  );
  if (genericText) {
    return { text: genericText, backend: "ollama-generic" };
  }

  // ── All backends failed ──
  return null;
}

/**
 * Generate text using Manus invokeLLM.
 */
async function manusGenerate(
  prompt:  string,
  options?: LLMGenerateOptions,
): Promise<string | null> {
  try {
    const result = await invokeLLM({
      messages: [
        {
          role: "system",
          content: GENERIC_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const rawContent = result?.choices?.[0]?.message?.content;
    const text = typeof rawContent === "string" ? rawContent : null;
    if (text && text.trim().length > 10) {
      _cache.manus = true;
      return text.trim();
    }
  } catch (e) {
    console.warn(`[LLM Adapter] Manus invokeLLM failed: ${e instanceof Error ? e.message : String(e)}`);
    _cache.manus = false;
  }
  return null;
}

// ── Convenience wrappers ─────────────────────────────────────────

/**
 * Generate code from a prompt. Extracts Java code blocks if present.
 */
export async function llmGenerateCode(
  prompt:   string,
  options?: LLMGenerateOptions,
  config?:  LLMAdapterConfig,
): Promise<string | null> {
  const raw = await llmGenerate(prompt, options, config);
  if (!raw) return null;

  // Extract Java code block if present
  const match = raw.match(/```java\s*([\s\S]*?)```/);
  if (match) return match[1].trim();

  // Try generic code block
  const generic = raw.match(/```\s*([\s\S]*?)```/);
  if (generic) return generic[1].trim();

  return raw;
}

/**
 * Generate code with backend information.
 */
export async function llmGenerateCodeWithBackend(
  prompt:   string,
  options?: LLMGenerateOptions,
  config?:  LLMAdapterConfig,
): Promise<{ code: string; backend: LLMBackend } | null> {
  const result = await llmGenerateWithBackend(prompt, options, config);
  if (!result) return null;

  const raw = result.text;

  // Extract Java code block if present
  const match = raw.match(/```java\s*([\s\S]*?)```/);
  if (match) return { code: match[1].trim(), backend: result.backend };

  // Try generic code block
  const generic = raw.match(/```\s*([\s\S]*?)```/);
  if (generic) return { code: generic[1].trim(), backend: result.backend };

  return { code: raw, backend: result.backend };
}

/**
 * Generate structured JSON from a prompt.
 */
export async function llmGenerateJSON<T = unknown>(
  prompt:   string,
  options?: LLMGenerateOptions,
  config?:  LLMAdapterConfig,
): Promise<T | null> {
  const raw = await llmGenerate(prompt, options, config);
  if (!raw) return null;

  try {
    // Try to extract JSON from markdown code block
    const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = jsonMatch ? jsonMatch[1].trim() : raw.trim();
    return JSON.parse(jsonStr) as T;
  } catch {
    return null;
  }
}
// v9.0 Fine-tuned model integration complete
