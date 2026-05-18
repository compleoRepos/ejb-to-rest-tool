/**
 * Tests unitaires — llm-adapter v9.0
 *
 * Vérifie :
 *   - La chaîne de priorité (fine-tuné → Manus → Ollama generic)
 *   - Le cache d'availability et son TTL
 *   - L'extraction de code Java depuis les réponses
 *   - Le forceBackend
 *   - Le reset du cache
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// We need to mock the invokeLLM import before importing the module
vi.mock("../../_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

import {
  llmGenerate,
  llmGenerateCode,
  llmGenerateWithBackend,
  llmGenerateCodeWithBackend,
  llmGenerateJSON,
  resetAvailabilityCache,
  isFinetunedAvailable,
  isLLMAvailable,
  getBackendStatus,
} from "./llm-adapter";
import { invokeLLM } from "../../_core/llm";

const mockedInvokeLLM = vi.mocked(invokeLLM);

// Mock global fetch
const originalFetch = globalThis.fetch;

beforeEach(() => {
  resetAvailabilityCache();
  vi.clearAllMocks();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ── Helper to mock fetch ────────────────────────────────────────

function mockFetch(handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  globalThis.fetch = vi.fn(handler) as typeof fetch;
}

function mockOllamaWithModel(modelName: string, response: string) {
  mockFetch(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();

    // /api/tags → list models
    if (url.includes("/api/tags")) {
      return new Response(JSON.stringify({
        models: [{ name: modelName }],
      }), { status: 200 });
    }

    // /api/generate → generate text
    if (url.includes("/api/generate")) {
      return new Response(JSON.stringify({
        response,
      }), { status: 200 });
    }

    return new Response("Not found", { status: 404 });
  });
}

function mockOllamaUnavailable() {
  mockFetch(async () => {
    throw new Error("Connection refused");
  });
}

// ── Tests ───────────────────────────────────────────────────────

describe("llm-adapter v9.0", () => {

  describe("resetAvailabilityCache", () => {
    it("should reset the cache so next call re-checks availability", async () => {
      // First call: Ollama unavailable, Manus unavailable
      mockOllamaUnavailable();
      mockedInvokeLLM.mockRejectedValueOnce(new Error("unavailable"));

      const result1 = await llmGenerate("test prompt");
      expect(result1).toBeNull();

      // Reset cache
      resetAvailabilityCache();

      // Now mock Manus as available
      mockedInvokeLLM.mockResolvedValueOnce({
        choices: [{ message: { content: "generated code here" } }],
      } as any);

      const result2 = await llmGenerate("test prompt");
      expect(result2).toBe("generated code here");
    });
  });

  describe("Priority chain: finetuned → manus → ollama-generic", () => {

    it("should prefer fine-tuned model when available", async () => {
      mockOllamaWithModel("ejb-modernizer", "// Spring Boot service method");

      const result = await llmGenerateWithBackend("transform this EJB");
      expect(result).not.toBeNull();
      expect(result!.backend).toBe("finetuned");
      expect(result!.text).toBe("// Spring Boot service method");
    });

    it("should fallback to Manus when fine-tuned is not available", async () => {
      // Ollama has no ejb-modernizer model
      mockFetch(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/tags")) {
          return new Response(JSON.stringify({ models: [] }), { status: 200 });
        }
        if (url.includes("/api/generate")) {
          return new Response(JSON.stringify({ response: "generic ollama" }), { status: 200 });
        }
        return new Response("Not found", { status: 404 });
      });

      mockedInvokeLLM.mockResolvedValueOnce({
        choices: [{ message: { content: "Manus generated Spring Boot code" } }],
      } as any);

      const result = await llmGenerateWithBackend("transform this EJB");
      expect(result).not.toBeNull();
      expect(result!.backend).toBe("manus");
      expect(result!.text).toBe("Manus generated Spring Boot code");
    });

    it("should fallback to generic Ollama when both fine-tuned and Manus are unavailable", async () => {
      // Ollama has generic model but not ejb-modernizer
      mockFetch(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/tags")) {
          return new Response(JSON.stringify({
            models: [{ name: "qwen2.5-coder:1.5b" }],
          }), { status: 200 });
        }
        if (url.includes("/api/generate")) {
          return new Response(JSON.stringify({
            response: "generic ollama response",
          }), { status: 200 });
        }
        return new Response("Not found", { status: 404 });
      });

      // Manus fails
      mockedInvokeLLM.mockRejectedValueOnce(new Error("Manus unavailable"));

      const result = await llmGenerateWithBackend("transform this EJB", undefined, {
        model: "qwen2.5-coder:1.5b",
      });
      expect(result).not.toBeNull();
      expect(result!.backend).toBe("ollama-generic");
      expect(result!.text).toBe("generic ollama response");
    });

    it("should return null when all backends are unavailable", async () => {
      mockOllamaUnavailable();
      mockedInvokeLLM.mockRejectedValueOnce(new Error("unavailable"));

      const result = await llmGenerate("test prompt");
      expect(result).toBeNull();
    });
  });

  describe("forceBackend", () => {

    it("should force fine-tuned backend even if Manus is available", async () => {
      mockOllamaWithModel("ejb-modernizer", "forced finetuned output");

      const result = await llmGenerateWithBackend("test", undefined, {
        forceBackend: "finetuned",
      });
      expect(result).not.toBeNull();
      expect(result!.backend).toBe("finetuned");
      // invokeLLM should NOT have been called
      expect(mockedInvokeLLM).not.toHaveBeenCalled();
    });

    it("should force Manus backend even if fine-tuned is available", async () => {
      mockOllamaWithModel("ejb-modernizer", "finetuned output");
      mockedInvokeLLM.mockResolvedValueOnce({
        choices: [{ message: { content: "forced manus output" } }],
      } as any);

      const result = await llmGenerateWithBackend("test", undefined, {
        forceBackend: "manus",
      });
      expect(result).not.toBeNull();
      expect(result!.backend).toBe("manus");
      expect(result!.text).toBe("forced manus output");
    });
  });

  describe("llmGenerateCode", () => {

    it("should extract Java code from markdown code blocks", async () => {
      mockedInvokeLLM.mockResolvedValueOnce({
        choices: [{
          message: {
            content: "Here is the code:\n```java\npublic void test() {\n    return;\n}\n```\nDone.",
          },
        }],
      } as any);

      // Make sure finetuned is not available so it falls to Manus
      mockOllamaUnavailable();
      resetAvailabilityCache();

      const code = await llmGenerateCode("generate a method");
      expect(code).toBe("public void test() {\n    return;\n}");
    });

    it("should extract generic code blocks if no java block found", async () => {
      mockedInvokeLLM.mockResolvedValueOnce({
        choices: [{
          message: {
            content: "```\nsome code\n```",
          },
        }],
      } as any);

      mockOllamaUnavailable();
      resetAvailabilityCache();

      const code = await llmGenerateCode("generate");
      expect(code).toBe("some code");
    });

    it("should return raw text if no code blocks found", async () => {
      mockedInvokeLLM.mockResolvedValueOnce({
        choices: [{
          message: {
            content: "public void rawMethod() { }",
          },
        }],
      } as any);

      mockOllamaUnavailable();
      resetAvailabilityCache();

      const code = await llmGenerateCode("generate");
      expect(code).toBe("public void rawMethod() { }");
    });
  });

  describe("llmGenerateCodeWithBackend", () => {

    it("should return code and backend info", async () => {
      mockOllamaWithModel("ejb-modernizer", "```java\n@Service\npublic class Test {}\n```");

      const result = await llmGenerateCodeWithBackend("transform");
      expect(result).not.toBeNull();
      expect(result!.backend).toBe("finetuned");
      expect(result!.code).toBe("@Service\npublic class Test {}");
    });
  });

  describe("llmGenerateJSON", () => {

    it("should parse JSON from markdown code block", async () => {
      mockedInvokeLLM.mockResolvedValueOnce({
        choices: [{
          message: {
            content: '```json\n{"name": "test", "count": 42}\n```',
          },
        }],
      } as any);

      mockOllamaUnavailable();
      resetAvailabilityCache();

      const json = await llmGenerateJSON<{ name: string; count: number }>("extract");
      expect(json).toEqual({ name: "test", count: 42 });
    });

    it("should parse raw JSON without code blocks", async () => {
      mockedInvokeLLM.mockResolvedValueOnce({
        choices: [{
          message: {
            content: '{"key": "value"}',
          },
        }],
      } as any);

      mockOllamaUnavailable();
      resetAvailabilityCache();

      const json = await llmGenerateJSON<{ key: string }>("extract");
      expect(json).toEqual({ key: "value" });
    });

    it("should return null for invalid JSON", async () => {
      mockedInvokeLLM.mockResolvedValueOnce({
        choices: [{
          message: {
            content: "not valid json at all",
          },
        }],
      } as any);

      mockOllamaUnavailable();
      resetAvailabilityCache();

      const json = await llmGenerateJSON("extract");
      expect(json).toBeNull();
    });
  });

  describe("isFinetunedAvailable", () => {

    it("should return true when ejb-modernizer model is listed", async () => {
      mockFetch(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/tags")) {
          return new Response(JSON.stringify({
            models: [
              { name: "ejb-modernizer:latest" },
              { name: "qwen2.5-coder:1.5b" },
            ],
          }), { status: 200 });
        }
        return new Response("Not found", { status: 404 });
      });

      const available = await isFinetunedAvailable("http://localhost:11434");
      expect(available).toBe(true);
    });

    it("should return false when Ollama is unreachable", async () => {
      mockOllamaUnavailable();
      const available = await isFinetunedAvailable("http://localhost:11434");
      expect(available).toBe(false);
    });
  });

  describe("getBackendStatus", () => {

    it("should report preferred backend correctly", async () => {
      mockOllamaWithModel("ejb-modernizer", "test");
      mockedInvokeLLM.mockResolvedValueOnce({
        choices: [{ message: { content: "pong" } }],
      } as any);

      const status = await getBackendStatus("http://localhost:11434");
      expect(status.finetuned).toBe(true);
      expect(status.manus).toBe(true);
      expect(status.preferred).toBe("finetuned");
    });

    it("should report manus as preferred when finetuned unavailable", async () => {
      mockFetch(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/tags")) {
          return new Response(JSON.stringify({ models: [] }), { status: 200 });
        }
        return new Response("Not found", { status: 404 });
      });

      mockedInvokeLLM.mockResolvedValueOnce({
        choices: [{ message: { content: "pong" } }],
      } as any);

      const status = await getBackendStatus("http://localhost:11434");
      expect(status.finetuned).toBe(false);
      expect(status.manus).toBe(true);
      expect(status.preferred).toBe("manus");
    });

    it("should report none when all unavailable", async () => {
      mockOllamaUnavailable();
      mockedInvokeLLM.mockRejectedValueOnce(new Error("unavailable"));

      const status = await getBackendStatus("http://localhost:11434");
      expect(status.finetuned).toBe(false);
      expect(status.manus).toBe(false);
      expect(status.preferred).toBe("none");
    });
  });
});
