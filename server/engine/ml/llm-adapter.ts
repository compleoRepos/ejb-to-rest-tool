/**
 * LLM Adapter — Compleo v8.0
 *
 * Adaptateur unifié pour les appels LLM. Remplace les appels directs
 * à Ollama (http://localhost:11434/api/generate) par l'API Manus
 * invokeLLM, tout en gardant la même interface pour les consommateurs.
 *
 * Si l'API Manus n'est pas disponible, tente Ollama en fallback.
 * Si aucun n'est disponible, retourne null (les appelants gèrent le fallback).
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
  /** Ollama URL as fallback (optional) */
  ollamaUrl?:  string;
  /** Ollama model name (optional, for fallback) */
  model?:      string;
  /** Timeout in ms */
  timeoutMs?:  number;
}

// ── Availability check ───────────────────────────────────────────

let _manusAvailable: boolean | null = null;

/**
 * Check if the Manus LLM API is available.
 * Result is cached for the lifetime of the process.
 */
export async function isLLMAvailable(): Promise<boolean> {
  if (_manusAvailable !== null) return _manusAvailable;

  try {
    const result = await invokeLLM({
      messages: [
        { role: "user", content: "ping" },
      ],
    });
    _manusAvailable = !!result?.choices?.[0]?.message?.content;
  } catch {
    _manusAvailable = false;
  }

  return _manusAvailable;
}

/**
 * Reset the availability cache (useful for testing).
 */
export function resetAvailabilityCache(): void {
  _manusAvailable = null;
}

// ── Main generate function ───────────────────────────────────────

/**
 * Generate text from a prompt using the best available LLM.
 *
 * Priority:
 *   1. Manus invokeLLM (cloud, always available in deployed env)
 *   2. Ollama local (fallback for local dev)
 *   3. null (caller handles fallback to rule-based)
 *
 * @param prompt   The full prompt text
 * @param options  Generation options (temperature, maxTokens, stop)
 * @param config   Adapter config (ollamaUrl for fallback)
 * @returns        Generated text or null if all backends fail
 */
export async function llmGenerate(
  prompt:   string,
  options?: LLMGenerateOptions,
  config?:  LLMAdapterConfig,
): Promise<string | null> {
  // 1. Try Manus invokeLLM first
  try {
    const result = await invokeLLM({
      messages: [
        {
          role: "system",
          content: "Tu es un expert Java EE / Spring Boot 3.2 spécialisé dans la migration d'applications legacy bancaires. Réponds uniquement avec le contenu demandé, sans commentaires superflus.",
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
      _manusAvailable = true;
      return text.trim();
    }
  } catch (e) {
    console.warn(`[LLM Adapter] Manus invokeLLM failed: ${e instanceof Error ? e.message : String(e)}`);
    _manusAvailable = false;
  }

  // 2. Fallback to Ollama if configured
  if (config?.ollamaUrl) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        config.timeoutMs ?? 60_000,
      );

      const res = await fetch(`${config.ollamaUrl}/api/generate`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          model:   config.model ?? "qwen2.5-coder:1.5b",
          prompt,
          stream:  false,
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
      // Ollama also unavailable
    }
  }

  // 3. All backends failed
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
// v8.0 LLM migration complete
