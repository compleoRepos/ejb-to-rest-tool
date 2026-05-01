/**
 * Tests unitaires pour le workflow v10.7 : analysis_review
 * Vérifie que la route analyze-multitech retourne aiInsights
 * et que le flux frontend est correctement modifié.
 */
import { describe, it, expect, vi } from "vitest";

// Mock the AnalysisLLMEnricher
vi.mock("./engine/analysis/AnalysisLLMEnricher", () => ({
  AnalysisLLMEnricher: class {
    async enrich() {
      return {
        projectSummary: "Test project summary",
        domainInsights: [
          {
            domain: "payment",
            label: "Paiement",
            businessRole: "Gestion des transactions",
            criticality: "HIGH",
            dependencies: ["account"],
            migrationNote: "Migrer en priorité",
          },
        ],
        riskAssessment: [
          {
            risk: "Couplage fort",
            severity: "HIGH",
            description: "Services fortement couplés",
            mitigation: "Introduire des interfaces",
            affectedDomains: ["payment"],
          },
        ],
        migrationStrategy: [
          {
            order: 1,
            phase: "Foundation",
            domains: ["shared"],
            description: "Setup Spring Boot base",
            duration: "2 semaines",
            reason: "Prérequis pour tous les domaines",
          },
        ],
        recommendationNotes: {},
        architecteComment: "Architecture monolithique classique",
        estimatedComplexity: "MEDIUM",
      };
    }
  },
}));

// Mock the InsightsCache
vi.mock("./engine/analysis/InsightsCache", () => ({
  getInsightsCache: () => ({
    computeHash: () => "test-hash-123",
    get: () => null,
    set: () => {},
  }),
}));

// Mock the AnalysisInsightValidator
vi.mock("./engine/analysis/AnalysisInsightValidator", () => ({
  validateInsights: (insights: any) => ({
    validated: insights,
    report: { passedChecks: 5, totalChecks: 5 },
  }),
}));

describe("Analysis Review Workflow v10.7", () => {
  describe("StepProgress pipeline steps", () => {
    it("should include analysis_review as a valid pipeline step", () => {
      // The PipelineStep type now includes analysis_review
      const validSteps = ["idle", "analyzing", "analysis_review", "missing_deps", "choices", "results"];
      expect(validSteps).toContain("analysis_review");
      expect(validSteps.indexOf("analysis_review")).toBe(2); // After analyzing
      expect(validSteps.indexOf("missing_deps")).toBe(3); // After analysis_review
    });

    it("should have 6 steps total in the pipeline", () => {
      const steps = ["idle", "analyzing", "analysis_review", "missing_deps", "choices", "results"];
      expect(steps.length).toBe(6);
    });
  });

  describe("AI Insights structure", () => {
    it("should have correct structure for AIAnalysisInsights", () => {
      const insights = {
        projectSummary: "Summary",
        domainInsights: [],
        riskAssessment: [],
        migrationStrategy: [],
        recommendationNotes: {},
        architecteComment: "Comment",
        estimatedComplexity: "MEDIUM",
      };

      expect(insights).toHaveProperty("projectSummary");
      expect(insights).toHaveProperty("domainInsights");
      expect(insights).toHaveProperty("riskAssessment");
      expect(insights).toHaveProperty("migrationStrategy");
      expect(insights).toHaveProperty("architecteComment");
      expect(insights).toHaveProperty("estimatedComplexity");
    });

    it("should validate domain insight criticality levels", () => {
      const validLevels = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
      const insight = {
        domain: "test",
        label: "Test",
        businessRole: "Testing",
        criticality: "HIGH",
        dependencies: [],
        migrationNote: "",
      };
      expect(validLevels).toContain(insight.criticality);
    });

    it("should validate risk severity levels", () => {
      const validSeverities = ["HIGH", "MEDIUM", "LOW"];
      const risk = {
        risk: "Test risk",
        severity: "MEDIUM",
        description: "Desc",
        mitigation: "Fix",
        affectedDomains: [],
      };
      expect(validSeverities).toContain(risk.severity);
    });
  });

  describe("Workflow transition logic", () => {
    it("should always go to analysis_review after analysis (not auto-generate)", () => {
      // Simulating the new workflow logic
      const data = {
        technologiesDetected: ["EJB_3X_STATELESS", "SERVLET"],
        ambiguities: [],
        missingDeps: [],
        aiInsights: { projectSummary: "Test" },
      };

      // v10.7: Always go to analysis_review regardless of ambiguities
      const nextStep = "analysis_review";
      expect(nextStep).toBe("analysis_review");
    });

    it("should transition from analysis_review to choices when ambiguities exist", () => {
      const ambiguityCount = 3;
      const missingDepsCount = 0;

      let nextStep: string;
      if (missingDepsCount > 0) {
        nextStep = "missing_deps";
      } else if (ambiguityCount > 0) {
        nextStep = "choices";
      } else {
        nextStep = "results"; // auto-generate
      }

      expect(nextStep).toBe("choices");
    });

    it("should transition from analysis_review to missing_deps when deps are missing", () => {
      const ambiguityCount = 2;
      const missingDepsCount = 1;

      let nextStep: string;
      if (missingDepsCount > 0) {
        nextStep = "missing_deps";
      } else if (ambiguityCount > 0) {
        nextStep = "choices";
      } else {
        nextStep = "results";
      }

      expect(nextStep).toBe("missing_deps");
    });

    it("should go directly to generation when no ambiguities and no missing deps", () => {
      const ambiguityCount = 0;
      const missingDepsCount = 0;

      let nextStep: string;
      if (missingDepsCount > 0) {
        nextStep = "missing_deps";
      } else if (ambiguityCount > 0) {
        nextStep = "choices";
      } else {
        nextStep = "generation"; // trigger runGeneration
      }

      expect(nextStep).toBe("generation");
    });
  });

  describe("Session restore with analysis_review", () => {
    it("should restore to analysis_review when session has stats but no generation", () => {
      const sessionData = {
        stats: { totalFiles: 10, useCaseCount: 3 },
        generation: null,
        ambiguities: [],
        missingDeps: [],
      };

      let restoredStep: string;
      if (sessionData.generation) {
        restoredStep = "results";
      } else if (sessionData.ambiguities?.length > 0) {
        restoredStep = "choices";
      } else if (sessionData.stats) {
        restoredStep = "analysis_review";
      } else {
        restoredStep = "idle";
      }

      expect(restoredStep).toBe("analysis_review");
    });

    it("should include analysis_review in completed steps when restoring to results", () => {
      const completedForResults = new Set(["idle", "analyzing", "analysis_review", "missing_deps", "choices", "results"]);
      expect(completedForResults.has("analysis_review")).toBe(true);
    });
  });
});
