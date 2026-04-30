/**
 * Tests unitaires — Pipeline Retry v10.5
 *
 * Vérifie le mécanisme de retry automatique avec backoff exponentiel.
 * @author Compleo
 */
import { describe, it, expect, vi } from "vitest";
import {
  withRetry,
  isRetryableError,
  calculateDelay,
  DEFAULT_RETRY_CONFIG,
  PHASE_RETRY_CONFIG,
  type RetryEvent,
} from "./pipeline-retry";
import { PipelineTimeoutError } from "./pipeline-timeouts";

describe("Pipeline Retry v10.5", () => {
  describe("isRetryableError", () => {
    it("PipelineTimeoutError est retryable", () => {
      const err = new PipelineTimeoutError("CLONING", 120000);
      expect(isRetryableError(err)).toBe(true);
    });

    it("Erreur réseau ECONNREFUSED est retryable", () => {
      expect(isRetryableError(new Error("connect ECONNREFUSED 127.0.0.1:3000"))).toBe(true);
    });

    it("Erreur réseau ETIMEDOUT est retryable", () => {
      expect(isRetryableError(new Error("connect ETIMEDOUT"))).toBe(true);
    });

    it("Erreur réseau ECONNRESET est retryable", () => {
      expect(isRetryableError(new Error("read ECONNRESET"))).toBe(true);
    });

    it("Erreur Git lock est retryable", () => {
      expect(isRetryableError(new Error("fatal: Unable to create '/tmp/.git/index.lock': File exists"))).toBe(true);
    });

    it("Erreur Git connection est retryable", () => {
      expect(isRetryableError(new Error("fatal: unable to access 'https://github.com/repo.git'"))).toBe(true);
    });

    it("Erreur LLM rate limit est retryable", () => {
      expect(isRetryableError(new Error("Rate limit exceeded (429)"))).toBe(true);
    });

    it("Erreur 503 service unavailable est retryable", () => {
      expect(isRetryableError(new Error("503 Service Unavailable"))).toBe(true);
    });

    it("Erreur 401 unauthorized n'est PAS retryable", () => {
      expect(isRetryableError(new Error("401 Unauthorized"))).toBe(false);
    });

    it("Erreur 403 forbidden n'est PAS retryable", () => {
      expect(isRetryableError(new Error("403 Forbidden"))).toBe(false);
    });

    it("Erreur de validation n'est PAS retryable", () => {
      expect(isRetryableError(new Error("Validation failed: missing required field"))).toBe(false);
    });

    it("Erreur de permission n'est PAS retryable", () => {
      expect(isRetryableError(new Error("EACCES: permission denied"))).toBe(false);
    });

    it("Erreur inconnue n'est PAS retryable par défaut", () => {
      expect(isRetryableError(new Error("Something unexpected happened"))).toBe(false);
    });
  });

  describe("calculateDelay", () => {
    it("Premier retry: baseDelay * 2^0 = baseDelay", () => {
      const delay = calculateDelay(0, DEFAULT_RETRY_CONFIG);
      // 2000 * 2^0 = 2000 ± 20% jitter
      expect(delay).toBeGreaterThanOrEqual(1600);
      expect(delay).toBeLessThanOrEqual(2400);
    });

    it("Deuxième retry: baseDelay * 2^1 = 4000", () => {
      const delay = calculateDelay(1, DEFAULT_RETRY_CONFIG);
      expect(delay).toBeGreaterThanOrEqual(3200);
      expect(delay).toBeLessThanOrEqual(4800);
    });

    it("Troisième retry: baseDelay * 2^2 = 8000", () => {
      const delay = calculateDelay(2, DEFAULT_RETRY_CONFIG);
      expect(delay).toBeGreaterThanOrEqual(6400);
      expect(delay).toBeLessThanOrEqual(9600);
    });

    it("Ne dépasse pas maxDelayMs", () => {
      const delay = calculateDelay(10, DEFAULT_RETRY_CONFIG);
      // 2000 * 2^10 = 2048000, mais plafonné à 30000 ± 20%
      expect(delay).toBeLessThanOrEqual(36000);
    });
  });

  describe("PHASE_RETRY_CONFIG", () => {
    it("CLONING a 3 tentatives max", () => {
      expect(PHASE_RETRY_CONFIG.CLONING?.maxAttempts).toBe(3);
    });

    it("ENHANCING_REPORTS a un baseDelay plus élevé (LLM)", () => {
      expect(PHASE_RETRY_CONFIG.ENHANCING_REPORTS?.baseDelayMs).toBe(5000);
    });

    it("PUSHING a 3 tentatives max", () => {
      expect(PHASE_RETRY_CONFIG.PUSHING?.maxAttempts).toBe(3);
    });

    it("ANALYZING a 2 tentatives max", () => {
      expect(PHASE_RETRY_CONFIG.ANALYZING?.maxAttempts).toBe(2);
    });
  });

  describe("withRetry", () => {
    it("Succès au premier essai — pas de retry", async () => {
      const operation = vi.fn().mockResolvedValue("success");
      const result = await withRetry("CLONING", operation);

      expect(result.result).toBe("success");
      expect(result.attempts).toBe(1);
      expect(result.failedAttempts).toHaveLength(0);
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it("Échec retryable puis succès au 2ème essai", async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new PipelineTimeoutError("CLONING", 120000))
        .mockResolvedValue("success");

      const result = await withRetry("CLONING", operation, undefined, {
        baseDelayMs: 10, // Réduire le délai pour le test
      });

      expect(result.result).toBe("success");
      expect(result.attempts).toBe(2);
      expect(result.failedAttempts).toHaveLength(1);
      expect(result.failedAttempts[0].retryable).toBe(true);
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it("Échec retryable 2 fois puis succès au 3ème essai", async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error("connect ECONNREFUSED"))
        .mockRejectedValueOnce(new Error("read ECONNRESET"))
        .mockResolvedValue("success");

      const result = await withRetry("PUSHING", operation, undefined, {
        baseDelayMs: 10,
      });

      expect(result.result).toBe("success");
      expect(result.attempts).toBe(3);
      expect(result.failedAttempts).toHaveLength(2);
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it("Erreur fatale (non-retryable) → pas de retry, throw immédiat", async () => {
      const operation = vi.fn()
        .mockRejectedValue(new Error("401 Unauthorized"));

      await expect(withRetry("CLONING", operation, undefined, {
        baseDelayMs: 10,
      })).rejects.toThrow("401 Unauthorized");

      expect(operation).toHaveBeenCalledTimes(1);
    });

    it("Toutes les tentatives échouent → throw après maxAttempts", async () => {
      const operation = vi.fn()
        .mockRejectedValue(new PipelineTimeoutError("CLONING", 120000));

      await expect(withRetry("CLONING", operation, undefined, {
        maxAttempts: 3,
        baseDelayMs: 10,
      })).rejects.toThrow("Phase CLONING a dépassé le timeout");

      expect(operation).toHaveBeenCalledTimes(3);
    });

    it("Émet des événements onRetry entre les tentatives", async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error("connect ETIMEDOUT"))
        .mockResolvedValue("ok");

      const retryEvents: RetryEvent[] = [];
      const onRetry = (event: RetryEvent) => retryEvents.push(event);

      await withRetry("PUSHING", operation, onRetry, {
        baseDelayMs: 10,
      });

      expect(retryEvents).toHaveLength(1);
      expect(retryEvents[0].type).toBe("RETRY_ATTEMPT");
      expect(retryEvents[0].phase).toBe("PUSHING");
      expect(retryEvents[0].attempt).toBe(1);
      expect(retryEvents[0].maxAttempts).toBe(3);
      expect(retryEvents[0].error).toContain("ETIMEDOUT");
      expect(retryEvents[0].nextDelayMs).toBeGreaterThan(0);
    });

    it("totalDurationMs inclut le temps d'attente", async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new PipelineTimeoutError("PUSHING", 120000))
        .mockResolvedValue("ok");

      const result = await withRetry("PUSHING", operation, undefined, {
        baseDelayMs: 50,
      });

      // La durée totale doit inclure au moins le délai d'attente
      expect(result.totalDurationMs).toBeGreaterThanOrEqual(40);
    });

    it("Respecte le customConfig override", async () => {
      const operation = vi.fn()
        .mockRejectedValue(new Error("connect ECONNREFUSED"));

      await expect(withRetry("CLONING", operation, undefined, {
        maxAttempts: 2,
        baseDelayMs: 10,
      })).rejects.toThrow("ECONNREFUSED");

      // Custom maxAttempts = 2 override le PHASE_RETRY_CONFIG.CLONING.maxAttempts = 3
      expect(operation).toHaveBeenCalledTimes(2);
    });
  });
});
