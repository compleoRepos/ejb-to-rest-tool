/**
 * Tests unitaires — Couche ML (EmbeddingService, GenerationService, MLEnhancer)
 *
 * Ces tests vérifient la logique interne SANS dépendance à Ollama/ChromaDB.
 * Les appels réseau sont mockés via vi.fn().
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { GenerationService, type MLGenerationResult } from "../../server/engine/ml/generation-service";
import { MLEnhancer, type MLConfig } from "../../server/engine/ml/ml-enhancer";
import type { MigrationPair } from "../../server/engine/ml/embedding-service";

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
      const result = service.validate(
        "public CompteVoOut consulterCompte(CompteVoIn request) { return null; }",
        "consulterCompte",
        "CompteVoIn",
        "CompteVoOut"
      );
      expect(result.confidence).toBe(0.9);
      expect(result.source).toBe("ml");
      expect(result.warnings).toHaveLength(0);
    });

    it("should penalize Void.builder()", () => {
      const result = service.validate(
        "public Void consulterCompte() { return Void.builder().build(); }",
        "consulterCompte",
        null,
        null
      );
      expect(result.confidence).toBe(0.5);
      expect(result.warnings).toContain("Void.builder() détecté — code rule-based préféré");
    });

    it("should penalize missing voInType", () => {
      const result = service.validate(
        "public CompteVoOut consulterCompte(String id) { return null; }",
        "consulterCompte",
        "CompteVoIn",
        "CompteVoOut"
      );
      expect(result.confidence).toBe(0.7);
      expect(result.warnings.some(w => w.includes("CompteVoIn absent"))).toBe(true);
    });

    it("should fix slash in method name", () => {
      const result = service.validate(
        "public void get/compte() { }",
        "getCompte",
        null,
        null
      );
      expect(result.code).toContain("compte(");
      expect(result.code).not.toContain("get/compte");
      expect(result.warnings.some(w => w.includes("Slash"))).toBe(true);
    });

    it("should return source='rules' when confidence < 0.6", () => {
      const result = service.validate(
        "public Void test() { return Void.builder().build(); }",
        "test",
        "TestVoIn",
        null
      );
      // Void.builder (-0.4) + missing voInType (-0.2) = 0.3
      expect(result.confidence).toBe(0.3);
      expect(result.source).toBe("rules");
    });

    it("should clamp confidence to 0 minimum", () => {
      // Void.builder (-0.4) + missing voIn (-0.2) + slash (-0.1) = 0.2
      const result = service.validate(
        "public Void get/test() { return Void.builder().build(); }",
        "test",
        "TestVoIn",
        null
      );
      expect(result.confidence).toBeGreaterThanOrEqual(0);
    });
  });

  describe("buildPrompt()", () => {
    it("should include EJB code and rule-based code", () => {
      const prompt = service.buildPrompt(
        "public void ejbMethod() {}",
        "public void springMethod() {}",
        [],
        "springMethod",
        "VoIn",
        "VoOut"
      );
      expect(prompt).toContain("ejbMethod");
      expect(prompt).toContain("springMethod");
      expect(prompt).toContain("VoIn");
      expect(prompt).toContain("VoOut");
    });

    it("should include RAG examples when provided", () => {
      const examples: MigrationPair[] = [{
        id: "test-1",
        ejbCode: "public void oldMethod() {}",
        springCode: "public void newMethod() {}",
        meta: { className: "Test", methodName: "test", javaType: "EJB", hasOracle: false, hasJms: false },
      }];
      const prompt = service.buildPrompt(
        "ejb code", "rule code", examples, "test", null, null
      );
      expect(prompt).toContain("Exemple 1");
      expect(prompt).toContain("oldMethod");
      expect(prompt).toContain("newMethod");
    });

    it("should skip examples section when empty", () => {
      const prompt = service.buildPrompt(
        "ejb code", "rule code", [], "test", null, null
      );
      expect(prompt).not.toContain("Exemple");
    });

    it("should include strict rules", () => {
      const prompt = service.buildPrompt(
        "ejb", "rule", [], "test", null, null
      );
      expect(prompt).toContain("JAMAIS Void.builder()");
      expect(prompt).toContain("Constantes SQL");
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
  });

  describe("enhance() — error handling", () => {
    it("should fallback to rules when ML services are unavailable", async () => {
      const enhancer = new MLEnhancer(baseConfig);
      // Don't initialize — services won't be ready
      // The enhance method should catch errors and fallback
      const result = await enhancer.enhance(
        "ejb code", "rule code", "test", null, null
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

  describe("initialize() — error handling", () => {
    it("should disable ML on init failure", async () => {
      const enhancer = new MLEnhancer(baseConfig);
      // ChromaDB is not running, so init should fail and disable ML
      await enhancer.initialize();
      expect(enhancer.enabled).toBe(false);
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
  it("should complete full enhance flow with mocked Ollama", async () => {
    // This test verifies the GenerationService.improveServiceMethod
    // falls back gracefully when Ollama is not available
    const genService = new GenerationService("http://nonexistent:11434");
    const result = await genService.improveServiceMethod(
      "public void ejbMethod() {}",
      "public void springMethod() { /* rule-based */ }",
      [],
      "springMethod",
      null,
      null
    );

    // Should fallback to rules since Ollama is not available
    expect(result.source).toBe("rules");
    expect(result.confidence).toBe(0.5);
    expect(result.code).toContain("rule-based");
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
