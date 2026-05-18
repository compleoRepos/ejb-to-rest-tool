/**
 * Tests unitaires — InsightsCache (v10.6)
 */
import { describe, it, expect, beforeEach } from "vitest";
import { InsightsCache, resetInsightsCache, getInsightsCache } from "./InsightsCache";
import type { AIAnalysisInsights } from "./AnalysisLLMEnricher";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const mockInsights: AIAnalysisInsights = {
  architecture: {
    patterns: ["Layered Architecture", "Service Locator"],
    antiPatterns: ["God Class"],
    recommendations: ["Extract interfaces"],
    complexityScore: 7,
  },
  risks: {
    technical: [{ area: "EJB coupling", severity: "high", mitigation: "Use DI" }],
    business: [{ area: "Downtime", severity: "medium", mitigation: "Blue-green deploy" }],
    overallRiskLevel: "medium",
  },
  quality: {
    codeSmells: ["Long methods"],
    testability: 4,
    maintainability: 5,
    suggestions: ["Add unit tests"],
  },
  domains: {
    detected: [{ name: "Payment", confidence: 0.9, components: ["PaymentService"] }],
    boundedContexts: ["Payment", "Account"],
    suggestedSplit: ["payment-service", "account-service"],
  },
  strategy: {
    approach: "Strangler Fig",
    phases: [{ name: "Phase 1", description: "Extract payment", duration: "2 months" }],
    estimatedEffort: "6 months",
    quickWins: ["Extract stateless services first"],
  },
};

const mockFiles = [
  { path: "src/main/java/com/app/Service.java", content: "public class Service {}" },
  { path: "src/main/java/com/app/Dao.java", content: "public class Dao {}" },
  { path: "src/main/java/com/app/Controller.java", content: "public class Controller {}" },
];

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("InsightsCache", () => {
  let cache: InsightsCache;

  beforeEach(() => {
    resetInsightsCache();
    cache = new InsightsCache({ maxMemoryEntries: 5, memoryTTL: 60000 });
  });

  describe("computeHash", () => {
    it("devrait produire un hash SHA-256 déterministe", () => {
      const hash1 = cache.computeHash(mockFiles);
      const hash2 = cache.computeHash(mockFiles);
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 = 64 hex chars
    });

    it("devrait produire le même hash indépendamment de l'ordre des fichiers", () => {
      const reversed = [...mockFiles].reverse();
      const hash1 = cache.computeHash(mockFiles);
      const hash2 = cache.computeHash(reversed);
      expect(hash1).toBe(hash2);
    });

    it("devrait produire un hash différent si le contenu change", () => {
      const modified = [...mockFiles];
      modified[0] = { ...modified[0], content: "public class Service { int x; }" };
      const hash1 = cache.computeHash(mockFiles);
      const hash2 = cache.computeHash(modified);
      expect(hash1).not.toBe(hash2);
    });

    it("devrait produire un hash différent si un fichier est ajouté", () => {
      const extended = [...mockFiles, { path: "src/New.java", content: "class New {}" }];
      const hash1 = cache.computeHash(mockFiles);
      const hash2 = cache.computeHash(extended);
      expect(hash1).not.toBe(hash2);
    });
  });

  describe("get/set", () => {
    it("devrait retourner null pour un hash inconnu", () => {
      const result = cache.get("unknown-hash");
      expect(result).toBeNull();
    });

    it("devrait stocker et récupérer des insights", () => {
      const hash = cache.computeHash(mockFiles);
      cache.set(hash, mockInsights, "test-project");
      const result = cache.get(hash);
      expect(result).toEqual(mockInsights);
    });

    it("devrait respecter le TTL mémoire", () => {
      const shortTTL = new InsightsCache({ maxMemoryEntries: 5, memoryTTL: 1, dbTTL: 1, enabled: true });
      const hash = shortTTL.computeHash(mockFiles);
      shortTTL.set(hash, mockInsights, "test-project");

      // Attendre que le TTL expire (1ms)
      const start = Date.now();
      while (Date.now() - start < 5) { /* busy wait */ }

      const result = shortTTL.get(hash);
      expect(result).toBeNull();
    });

    it("devrait respecter la limite LRU (maxMemoryEntries)", () => {
      // Cache de taille 3
      const smallCache = new InsightsCache({ maxMemoryEntries: 3, memoryTTL: 60000, dbTTL: 60000, enabled: true });

      // Ajouter 4 entrées
      for (let i = 0; i < 4; i++) {
        const files = [{ path: `file${i}.java`, content: `class C${i} {}` }];
        const hash = smallCache.computeHash(files);
        smallCache.set(hash, mockInsights, `project-${i}`);
      }

      // La première entrée devrait être évincée
      const firstHash = smallCache.computeHash([{ path: "file0.java", content: "class C0 {}" }]);
      expect(smallCache.get(firstHash)).toBeNull();

      // La dernière devrait être présente
      const lastHash = smallCache.computeHash([{ path: "file3.java", content: "class C3 {}" }]);
      expect(smallCache.get(lastHash)).toEqual(mockInsights);
    });
  });

  describe("invalidate", () => {
    it("devrait invalider une entrée spécifique", () => {
      const hash = cache.computeHash(mockFiles);
      cache.set(hash, mockInsights, "test-project");
      cache.invalidate(hash);
      expect(cache.get(hash)).toBeNull();
    });

    it("devrait invalider toutes les entrées d'un projet", () => {
      const files1 = [{ path: "a.java", content: "class A {}" }];
      const files2 = [{ path: "b.java", content: "class B {}" }];
      const hash1 = cache.computeHash(files1);
      const hash2 = cache.computeHash(files2);

      cache.set(hash1, mockInsights, "project-alpha");
      cache.set(hash2, mockInsights, "project-alpha");

      cache.invalidateByProject("project-alpha");

      expect(cache.get(hash1)).toBeNull();
      expect(cache.get(hash2)).toBeNull();
    });

    it("ne devrait pas invalider les entrées d'autres projets", () => {
      const files1 = [{ path: "a.java", content: "class A {}" }];
      const files2 = [{ path: "b.java", content: "class B {}" }];
      const hash1 = cache.computeHash(files1);
      const hash2 = cache.computeHash(files2);

      cache.set(hash1, mockInsights, "project-alpha");
      cache.set(hash2, mockInsights, "project-beta");

      cache.invalidateByProject("project-alpha");

      expect(cache.get(hash1)).toBeNull();
      expect(cache.get(hash2)).toEqual(mockInsights);
    });
  });

  describe("has", () => {
    it("devrait retourner false pour un hash inconnu", () => {
      expect(cache.has("unknown")).toBe(false);
    });

    it("devrait retourner true pour un hash en cache", () => {
      const hash = cache.computeHash(mockFiles);
      cache.set(hash, mockInsights, "test-project");
      expect(cache.has(hash)).toBe(true);
    });
  });

  describe("getStats", () => {
    it("devrait retourner les statistiques du cache", () => {
      const hash = cache.computeHash(mockFiles);
      cache.set(hash, mockInsights, "test-project");

      const stats = cache.getStats();
      expect(stats.size).toBe(1);
      expect(stats.maxSize).toBe(5);
      expect(stats.oldestEntry).toBeTypeOf("number");
    });
  });

  describe("clear", () => {
    it("devrait vider tout le cache", () => {
      const hash = cache.computeHash(mockFiles);
      cache.set(hash, mockInsights, "test-project");
      cache.clear();
      expect(cache.get(hash)).toBeNull();
      expect(cache.getStats().size).toBe(0);
    });
  });

  describe("disabled cache", () => {
    it("devrait retourner null quand le cache est désactivé", () => {
      const disabled = new InsightsCache({ maxMemoryEntries: 5, memoryTTL: 60000, dbTTL: 60000, enabled: false });
      const hash = disabled.computeHash(mockFiles);
      disabled.set(hash, mockInsights, "test-project");
      expect(disabled.get(hash)).toBeNull();
    });
  });

  describe("singleton", () => {
    it("devrait retourner la même instance", () => {
      const a = getInsightsCache();
      const b = getInsightsCache();
      expect(a).toBe(b);
    });

    it("devrait se réinitialiser avec resetInsightsCache", () => {
      const a = getInsightsCache();
      resetInsightsCache();
      const b = getInsightsCache();
      expect(a).not.toBe(b);
    });
  });
});
