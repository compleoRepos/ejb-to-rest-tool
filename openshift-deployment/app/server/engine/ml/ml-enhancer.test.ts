/**
 * Tests unitaires — MLEnhancer v9.0
 *
 * Vérifie :
 *   - L'orchestration enhance() avec le pipeline complet
 *   - Le fallback quand ML est désactivé
 *   - Les diagnostics
 *   - L'indexation d'exemples
 *   - La compatibilité legacy (signature string)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MLEnhancer, type MLConfig, type EJBSignature } from "./ml-enhancer";

// Mock dependencies
vi.mock("./embedding-service", () => {
  return {
    EmbeddingService: vi.fn().mockImplementation(() => ({
      initialize: vi.fn().mockResolvedValue(undefined),
      seedFromExamples: vi.fn().mockResolvedValue(15),
      findSimilar: vi.fn().mockResolvedValue([]),
      indexPair: vi.fn().mockResolvedValue(undefined),
      isReady: vi.fn().mockReturnValue(true),
      getBackendMode: vi.fn().mockReturnValue("in-memory"),
      getMemoryCount: vi.fn().mockReturnValue(15),
    })),
  };
});

vi.mock("./generation-service", () => {
  const MockGenerationService = vi.fn().mockImplementation(() => ({
    improveServiceMethod: vi.fn().mockResolvedValue({
      code: "@Service\npublic class AccountService {\n    public AccountVO findAccount(String clientId) { return null; }\n}",
      confidence: 0.85,
      source: "ml",
      warnings: [],
      backend: "finetuned",
    }),
  }));
  // Add static methods to the mock constructor
  MockGenerationService.getSupportedTechnologies = vi.fn().mockReturnValue([
    "EJB3X", "EJB2X", "SERVLET", "STRUTS", "SOAP", "JDBC", "HIBERNATE", "JMS", "BATCH",
  ]);
  MockGenerationService.getLearnedPatterns = vi.fn().mockReturnValue({
    category: "EJB Session Bean",
    annotationMap: {},
    importReplacements: {},
    antiPatterns: [],
    exampleTransform: "",
  });
  return {
    GenerationService: MockGenerationService,
  };
});

vi.mock("./llm-adapter", () => ({
  getBackendStatus: vi.fn().mockResolvedValue({
    finetuned: true,
    manus: true,
    preferred: "finetuned",
  }),
}));

import { GenerationService } from "./generation-service";

const MockedGenerationService = vi.mocked(GenerationService);

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Fixtures ────────────────────────────────────────────────────

const defaultConfig: MLConfig = {
  enabled:       true,
  ollamaUrl:     "http://localhost:11434",
  chromaUrl:     "http://localhost:8000",
  model:         "ejb-modernizer",
  minConfidence: 0.6,
};

const disabledConfig: MLConfig = {
  ...defaultConfig,
  enabled: false,
};

const ejbSignature: EJBSignature = {
  methodName:  "findAccountByClientId",
  params:      [{ name: "clientId", type: "String" }],
  returnType:  "AccountVO",
  className:   "AccountServiceBean",
  javaType:    "EJB3X",
};

const sampleEjbCode = `@Stateless
public class AccountServiceBean {
    public AccountVO findAccountByClientId(String clientId) {
        return accountDAO.findByClientId(clientId);
    }
}`;

const sampleRuleCode = `@Service
public class AccountService {
    public AccountVO findAccountByClientId(String clientId) {
        return accountRepository.findByClientId(clientId);
    }
}`;

// ── Tests ───────────────────────────────────────────────────────

describe("MLEnhancer v9.0", () => {

  describe("constructor", () => {
    it("should default model to ejb-modernizer", () => {
      const configNoModel: MLConfig = {
        enabled: true,
        ollamaUrl: "http://localhost:11434",
        chromaUrl: "http://localhost:8000",
      };
      const enhancer = new MLEnhancer(configNoModel);
      // GenerationService should be called with "ejb-modernizer"
      expect(MockedGenerationService).toHaveBeenCalledWith(
        "http://localhost:11434",
        "ejb-modernizer"
      );
    });

    it("should use custom model when provided", () => {
      const enhancer = new MLEnhancer({
        ...defaultConfig,
        model: "custom-model",
      });
      expect(MockedGenerationService).toHaveBeenCalledWith(
        "http://localhost:11434",
        "custom-model"
      );
    });
  });

  describe("initialize", () => {
    it("should initialize when enabled", async () => {
      const enhancer = new MLEnhancer(defaultConfig);
      await enhancer.initialize();
      expect(enhancer.enabled).toBe(true);
    });

    it("should skip initialization when disabled", async () => {
      const enhancer = new MLEnhancer(disabledConfig);
      await enhancer.initialize();
      expect(enhancer.enabled).toBe(false);
    });
  });

  describe("enhance", () => {

    it("should return ML-enhanced code when confidence is sufficient", async () => {
      const enhancer = new MLEnhancer(defaultConfig);
      await enhancer.initialize();

      const result = await enhancer.enhance(
        sampleEjbCode, sampleRuleCode, ejbSignature
      );

      expect(result.source).toBe("ml");
      expect(result.backend).toBe("finetuned");
      expect(result.code).toContain("@Service");
    });

    it("should return rule-based code when ML is disabled", async () => {
      const enhancer = new MLEnhancer(disabledConfig);
      await enhancer.initialize();

      const result = await enhancer.enhance(
        sampleEjbCode, sampleRuleCode, ejbSignature
      );

      expect(result.source).toBe("rules");
      expect(result.code).toBe(sampleRuleCode);
      expect(result.backend).toBeUndefined();
    });

    it("should return rule-based code when confidence is too low", async () => {
      // Override the mock to return low confidence
      const lowConfidenceGen = vi.fn().mockResolvedValue({
        code: "bad code",
        confidence: 0.3,
        source: "ml",
        warnings: ["Too many issues"],
        backend: "manus",
      });

      MockedGenerationService.mockImplementationOnce(() => ({
        improveServiceMethod: lowConfidenceGen,
      }) as any);

      const enhancer = new MLEnhancer(defaultConfig);
      await enhancer.initialize();

      const result = await enhancer.enhance(
        sampleEjbCode, sampleRuleCode, ejbSignature
      );

      expect(result.source).toBe("rules");
      expect(result.code).toBe(sampleRuleCode);
    });

    it("should handle legacy string signature (backward compat)", async () => {
      const enhancer = new MLEnhancer(defaultConfig);
      await enhancer.initialize();

      const result = await enhancer.enhance(
        sampleEjbCode, sampleRuleCode, "findAccountByClientId", "String", "AccountVO"
      );

      expect(result.source).toBe("ml");
    });

    it("should handle errors gracefully and fallback to rules", async () => {
      const errorGen = vi.fn().mockRejectedValue(new Error("LLM timeout"));

      MockedGenerationService.mockImplementationOnce(() => ({
        improveServiceMethod: errorGen,
      }) as any);

      const enhancer = new MLEnhancer(defaultConfig);
      await enhancer.initialize();

      const result = await enhancer.enhance(
        sampleEjbCode, sampleRuleCode, ejbSignature
      );

      expect(result.source).toBe("rules");
      expect(result.code).toBe(sampleRuleCode);
    });
  });

  describe("getDiagnostics", () => {

    it("should return complete diagnostics", async () => {
      const enhancer = new MLEnhancer(defaultConfig);
      await enhancer.initialize();

      const diag = await enhancer.getDiagnostics();

      expect(diag.enabled).toBe(true);
      expect(diag.ragBackend).toBe("in-memory");
      expect(diag.ragExamplesCount).toBe(15);
      expect(diag.llmBackend).toBe("finetuned");
      expect(diag.finetunedAvailable).toBe(true);
      expect(diag.manusAvailable).toBe(true);
      expect(diag.supportedTechnologies).toContain("EJB3X");
      expect(diag.supportedTechnologies).toContain("SERVLET");
    });
  });

  describe("indexExample", () => {

    it("should index an example when enabled", async () => {
      const enhancer = new MLEnhancer(defaultConfig);
      await enhancer.initialize();

      // Should not throw
      await enhancer.indexExample(
        sampleEjbCode,
        sampleRuleCode,
        {
          className: "AccountServiceBean",
          methodName: "findAccountByClientId",
          javaType: "EJB3X",
          hasOracle: true,
          hasJms: false,
        }
      );
    });

    it("should skip indexing when disabled", async () => {
      const enhancer = new MLEnhancer(disabledConfig);
      await enhancer.initialize();

      // Should not throw
      await enhancer.indexExample(
        sampleEjbCode,
        sampleRuleCode,
        {
          className: "AccountServiceBean",
          methodName: "findAccountByClientId",
          javaType: "EJB3X",
          hasOracle: true,
          hasJms: false,
        }
      );
    });
  });
});
