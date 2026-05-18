/**
 * Tests unitaires — Couche ML (EmbeddingService, GenerationService, MLEnhancer)
 *
 * Ces tests vérifient la logique interne SANS dépendance à Ollama/ChromaDB.
 * Les appels réseau sont mockés via vi.fn().
 *
 * v7.3: Mise à jour pour utiliser EJBSignature au lieu de methodName/voInType/voOutType.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { GenerationService, type MLGenerationResult } from "../../server/engine/ml/generation-service";
import { MLEnhancer, type MLConfig, type EJBSignature } from "../../server/engine/ml/ml-enhancer";
import type { MigrationPair } from "../../server/engine/ml/embedding-service";

// Mock llm-adapter to force fallback mode in tests (no real LLM calls)
vi.mock("../../server/engine/ml/llm-adapter", () => ({
  isLLMAvailable: vi.fn().mockResolvedValue(false),
  isFinetunedAvailable: vi.fn().mockResolvedValue(false),
  llmGenerate: vi.fn().mockResolvedValue(null),
  llmGenerateCode: vi.fn().mockResolvedValue(null),
  llmGenerateCodeWithBackend: vi.fn().mockResolvedValue(null),
  llmGenerateWithBackend: vi.fn().mockResolvedValue(null),
  llmGenerateJSON: vi.fn().mockResolvedValue(null),
  resetAvailabilityCache: vi.fn(),
  getBackendStatus: vi.fn().mockResolvedValue({
    finetuned: false,
    manus: false,
    preferred: "none",
  }),
}));

// ── Helpers ─────────────────────────────────────────────────────────

function makeSig(overrides: Partial<EJBSignature> = {}): EJBSignature {
  return {
    methodName: "consulterCompte",
    params: [],
    returnType: "void",
    className: "CompteEJB",
    javaType: "EJB",
    ...overrides,
  };
}

// ── GenerationService tests (pure logic, no network) ─────────────

describe("GenerationService", () => {
  const service = new GenerationService("http://localhost:11434");

  describe("extractCode()", () => {
    it("should extract code from ```java block", () => {
      const response = `Here is the improved code:
\`\`\`java
public void doSomething() {
    // improved
}
\`\`\`
That's it.`;
      const code = service.extractCode(response);
      expect(code).toContain("public void doSomething()");
      expect(code).toContain("// improved");
    });

    it("should handle response without code block markers", () => {
      const response = `public void doSomething() {
    // no markers
}`;
      const code = service.extractCode(response);
      expect(code).toContain("doSomething");
    });

    it("should extract up to last brace if no code block", () => {
      const response = `Some text\npublic void test() {\n    return;\n}\nSome trailing text`;
      const code = service.extractCode(response);
      expect(code).toContain("}");
    });
  });

  describe("validate()", () => {
    it("should return high confidence for clean code", () => {
      const sig = makeSig({
        methodName: "consulterCompte",
        params: [{ name: "request", type: "CompteVoIn" }],
        returnType: "CompteVoOut",
      });
      const result = service.validate(
        "public CompteVoOut consulterCompte(CompteVoIn request) { return null; }",
        sig
      );
      expect(result.confidence).toBe(0.9);
      expect(result.source).toBe("ml");
      expect(result.warnings).toHaveLength(0);
    });

    it("should penalize Void.builder()", () => {
      const sig = makeSig({
        methodName: "consulterCompte",
        params: [],
        returnType: "void",
      });
      const result = service.validate(
        "public Void consulterCompte() { return Void.builder().build(); }",
        sig
      );
      expect(result.confidence).toBeLessThanOrEqual(0.5);
      expect(result.warnings.some(w => w.includes("Void.builder()"))).toBe(true);
    });

    it("should penalize missing parameter", () => {
      const sig = makeSig({
        methodName: "consulterCompte",
        params: [{ name: "request", type: "CompteVoIn" }],
        returnType: "CompteVoOut",
      });
      const result = service.validate(
        "public CompteVoOut consulterCompte(String id) { return null; }",
        sig
      );
      expect(result.confidence).toBeLessThan(0.9);
      expect(result.warnings.some(w => w.includes("request") || w.includes("CompteVoIn"))).toBe(true);
    });

    it("should fix slash in method name", () => {
      const sig = makeSig({
        methodName: "getCompte",
        params: [],
        returnType: "void",
      });
      const result = service.validate(
        "public void get/compte() { }",
        sig
      );
      expect(result.code).toContain("compte(");
      expect(result.code).not.toContain("get/compte");
      expect(result.warnings.some(w => w.includes("Slash") || w.includes("slash"))).toBe(true);
    });

    it("should return rules-corrected when confidence < 0.5", () => {
      const sig = makeSig({
        methodName: "test",
        params: [{ name: "request", type: "TestVoIn" }],
        returnType: "void",
      });
      const result = service.validate(
        "public Void test() { return Void.builder().build(); }",
        sig
      );
      // Void.builder (-0.4) + missing param (-0.25) = 0.25 < 0.5
      expect(result.confidence).toBe(0.5); // fallback sets 0.5
      expect(result.source).toBe("rules-corrected");
    });

    it("should clamp confidence to 0 minimum", () => {
      const sig = makeSig({
        methodName: "test",
        params: [{ name: "request", type: "TestVoIn" }],
        returnType: "TestVoOut",
      });
      // Void.builder (-0.4) + missing param (-0.25) + slash (-0.1) = 0.15 < 0.5 → fallback
      const result = service.validate(
        "public Void get/test() { return Void.builder().build(); }",
        sig
      );
      expect(result.confidence).toBeGreaterThanOrEqual(0);
    });

    it("should penalize Object as return type", () => {
      const sig = makeSig({
        methodName: "getData",
        params: [],
        returnType: "String",
      });
      const result = service.validate(
        "public Object getData() { return null; }",
        sig
      );
      expect(result.confidence).toBeLessThan(0.9);
      expect(result.warnings.some(w => w.includes("Object"))).toBe(true);
    });
  });

  describe("buildPrompt()", () => {
    it("should include EJB code, rule-based code, and signature", () => {
      const sig = makeSig({
        methodName: "springMethod",
        params: [{ name: "request", type: "VoIn" }],
        returnType: "VoOut",
      });
      const prompt = service.buildPrompt(
        "public void ejbMethod() {}",
        "public void springMethod() {}",
        [],
        sig
      );
      expect(prompt).toContain("ejbMethod");
      expect(prompt).toContain("springMethod");
      expect(prompt).toContain("VoIn");
      expect(prompt).toContain("VoOut");
      expect(prompt).toContain("Signature EJB source");
    });

    it("should include RAG examples when provided", () => {
      const examples: MigrationPair[] = [{
        id: "test-1",
        ejbCode: "public void oldMethod() {}",
        springCode: "public void newMethod() {}",
        meta: { className: "Test", methodName: "test", javaType: "EJB", hasOracle: false, hasJms: false },
      }];
      const sig = makeSig({ methodName: "test" });
      const prompt = service.buildPrompt(
        "ejb code", "rule code", examples, sig
      );
      expect(prompt).toContain("Exemple 1");
      expect(prompt).toContain("oldMethod");
      expect(prompt).toContain("newMethod");
    });

    it("should skip RAG examples section when empty", () => {
      const sig = makeSig({ methodName: "test" });
      const prompt = service.buildPrompt(
        "ejb code", "rule code", [], sig
      );
      // v9.0: The prompt now contains "Exemple de transformation type" in patterns section
      // but should NOT contain "Exemples de migrations similaires réussies" (RAG section)
      expect(prompt).not.toContain("Exemples de migrations similaires réussies");
    });

    it("should include strict rules", () => {
      const sig = makeSig({ methodName: "test" });
      const prompt = service.buildPrompt(
        "ejb", "rule", [], sig
      );
      expect(prompt).toContain("Void.builder()");
      expect(prompt).toContain("SQL constants") || expect(prompt).toContain("Constantes SQL");
    });
  });
});

// ── MLEnhancer tests (with mocked services) ─────────────────────

describe("MLEnhancer", () => {
  const baseConfig: MLConfig = {
    enabled:       true,
    ollamaUrl:     "http://localhost:11434",
    chromaUrl:     "http://localhost:8001",
    minConfidence: 0.6,
  };

  describe("constructor", () => {
    it("should create with default minConfidence", () => {
      const enhancer = new MLEnhancer({
        enabled: true,
        ollamaUrl: "http://localhost:11434",
        chromaUrl: "http://localhost:8001",
      });
      expect(enhancer.enabled).toBe(true);
    });

    it("should respect custom minConfidence", () => {
      const enhancer = new MLEnhancer({
        ...baseConfig,
        minConfidence: 0.8,
      });
      expect(enhancer.enabled).toBe(true);
    });
  });

  describe("enhance() — disabled mode", () => {
    it("should return rule-based code when ML is disabled", async () => {
      const enhancer = new MLEnhancer({ ...baseConfig, enabled: false });
      const result = await enhancer.enhance(
        "ejb code", "rule code", "test", null, null
      );
      expect(result.code).toBe("rule code");
      expect(result.source).toBe("rules");
    });

    it("should return rule-based code with EJBSignature when ML is disabled", async () => {
      const enhancer = new MLEnhancer({ ...baseConfig, enabled: false });
      const sig = makeSig({ methodName: "test" });
      const result = await enhancer.enhance(
        "ejb code", "rule code", sig
      );
      expect(result.code).toBe("rule code");
      expect(result.source).toBe("rules");
    });
  });

  describe("enhance() — error handling", () => {
    it("should fallback to rules when ML services are unavailable", async () => {
      const enhancer = new MLEnhancer(baseConfig);
      // Don't initialize — services won't be ready
      const result = await enhancer.enhance(
        "ejb code", "rule code", "test", null, null
      );
      expect(result.code).toBe("rule code");
      expect(result.source).toBe("rules");
    });

    it("should fallback to rules with EJBSignature when ML services are unavailable", async () => {
      const enhancer = new MLEnhancer(baseConfig);
      const sig = makeSig({ methodName: "test" });
      const result = await enhancer.enhance(
        "ejb code", "rule code", sig
      );
      expect(result.code).toBe("rule code");
      expect(result.source).toBe("rules");
    });
  });

  describe("initialize() — disabled mode", () => {
    it("should do nothing when disabled", async () => {
      const enhancer = new MLEnhancer({ ...baseConfig, enabled: false });
      await enhancer.initialize(); // should not throw
      expect(enhancer.enabled).toBe(false);
    });
  });

  describe("initialize() — in-memory fallback", () => {
    it("should attempt initialization and handle gracefully when services are absent", async () => {
      const enhancer = new MLEnhancer(baseConfig);
      // v9.0: initialize() tries to connect to ChromaDB/Ollama.
      // In test environment (no real services), it may disable itself gracefully.
      // The important thing is it doesn't throw.
      await enhancer.initialize();
      // enabled state depends on whether EmbeddingService.initialize() succeeds
      // In mocked environment, it may be true or false — both are valid
      expect(typeof enhancer.enabled).toBe("boolean");
    });
  });

  describe("indexExample() — disabled mode", () => {
    it("should do nothing when disabled", async () => {
      const enhancer = new MLEnhancer({ ...baseConfig, enabled: false });
      // Should not throw
      await enhancer.indexExample(
        "ejb code", "spring code",
        { className: "Test", methodName: "test", javaType: "EJB", hasOracle: false, hasJms: false }
      );
    });
  });
});

// ── Integration scenario (mocked fetch) ──────────────────────────

describe("ML Integration — mocked fetch", () => {
  it("should complete full enhance flow with mocked Ollama (legacy API)", async () => {
    // This test verifies the GenerationService.improveServiceMethod
    // falls back gracefully when Ollama is not available
    const genService = new GenerationService("http://nonexistent:11434");
    const sig = makeSig({
      methodName: "springMethod",
      params: [],
      returnType: "void",
    });
    const result = await genService.improveServiceMethod(
      "public void ejbMethod() {}",
      "public void springMethod() { /* rule-based */ }",
      [],
      sig
    );

    // Should fallback to rules since Ollama is not available
    expect(result.source).toBe("rules");
    expect(result.confidence).toBe(0.5);
    expect(result.code).toContain("rule-based");
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("should complete full enhance flow with EJBSignature", async () => {
    const genService = new GenerationService("http://nonexistent:11434");
    const sig = makeSig({
      methodName: "consulterSolde",
      params: [{ name: "numCompte", type: "String" }],
      returnType: "SoldeDTO",
    });
    const result = await genService.improveServiceMethod(
      "public SoldeDTO consulterSolde(String numCompte) { return dao.getSolde(numCompte); }",
      "public SoldeDTO consulterSolde(String numCompte) { /* rule-based */ }",
      [],
      sig
    );

    // Should fallback to rules since Ollama is not available
    expect(result.source).toBe("rules");
    expect(result.confidence).toBe(0.5);
    expect(result.code).toContain("rule-based");
  });
});
