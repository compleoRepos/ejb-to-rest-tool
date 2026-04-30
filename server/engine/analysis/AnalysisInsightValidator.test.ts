/**
 * Tests pour AnalysisInsightValidator v10.5b
 */
import { describe, it, expect } from "vitest";
import { validateInsights, type AIInsights } from "./AnalysisInsightValidator";
import type { ProjectIR } from "../../java-parser";

// ─── Mock IR ─────────────────────────────────────────────────────────────────

const mockIR: ProjectIR = {
  useCases: [
    {
      className: "AccountService",
      packageName: "com.bank.account",
      domain: "account",
      bianDomain: "CurrentAccount",
      bianAction: "Initiate",
      voInType: "AccountRequest",
      voOutType: "AccountResponse",
      useCaseDescription: "Gestion des comptes",
      javadoc: "",
      injectedServices: [],
      transactional: null,
      exceptionsCaught: [],
      exceptionsThrown: [],
      sourceFile: "src/main/java/com/bank/account/AccountService.java",
      rawSource: "",
      httpMethod: "POST",
      restPath: "/accounts",
    },
    {
      className: "TransferService",
      packageName: "com.bank.transfer",
      domain: "transfer",
      bianDomain: "PaymentExecution",
      bianAction: "Execute",
      voInType: "TransferRequest",
      voOutType: "TransferResponse",
      useCaseDescription: "Virements",
      javadoc: "",
      injectedServices: [],
      transactional: null,
      exceptionsCaught: [],
      exceptionsThrown: [],
      sourceFile: "src/main/java/com/bank/transfer/TransferService.java",
      rawSource: "",
      httpMethod: "POST",
      restPath: "/transfers",
    },
    {
      className: "NotificationService",
      packageName: "com.bank.notification",
      domain: "notification",
      bianDomain: "PartyNotification",
      bianAction: "Notify",
      voInType: "NotifRequest",
      voOutType: "NotifResponse",
      useCaseDescription: "Notifications",
      javadoc: "",
      injectedServices: [],
      transactional: null,
      exceptionsCaught: [],
      exceptionsThrown: [],
      sourceFile: "src/main/java/com/bank/notification/NotificationService.java",
      rawSource: "",
      httpMethod: "POST",
      restPath: "/notifications",
    },
  ],
  dtos: [],
  enums: [],
  exceptions: [],
  stats: {
    useCaseCount: 3,
    dtoCount: 0,
    enumCount: 0,
    exceptionCount: 0,
    totalFiles: 3,
    totalLinesOfCode: 300,
  },
} as any;

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("AnalysisInsightValidator", () => {
  it("should pass validation for correct insights", () => {
    const insights: AIInsights = {
      architectureAssessment: {
        summary: "L'architecture suit un pattern Service Layer classique avec injection de dépendances.",
        patterns: ["Service Layer", "Dependency Injection", "DTO Pattern"],
        antiPatterns: ["God Class potential in AccountService"],
        recommendations: ["Séparer les responsabilités", "Ajouter un circuit breaker"],
      },
      migrationRisks: {
        summary: "Risques modérés liés aux transactions distribuées.",
        risks: [
          { risk: "Transactions XA non supportées", severity: "high", mitigation: "Utiliser le pattern Saga" },
          { risk: "Couplage fort entre services", severity: "medium", mitigation: "Introduire un event bus" },
        ],
      },
      codeQualityInsights: {
        summary: "Qualité globale correcte.",
        hotspots: [
          { className: "AccountService", issue: "Trop de responsabilités", suggestion: "Extraire en sous-services" },
          { className: "TransferService", issue: "Pas de validation d'entrée", suggestion: "Ajouter des validators" },
        ],
      },
    };

    const { validated, report } = validateInsights(insights, mockIR);

    expect(report.failedChecks).toBe(0);
    expect(report.valid).toBe(true);
    expect(validated.architectureAssessment?.patterns).toHaveLength(3);
    expect(validated.codeQualityInsights?.hotspots).toHaveLength(2);
  });

  it("should correct invalid severities", () => {
    const insights: AIInsights = {
      migrationRisks: {
        summary: "Risques identifiés.",
        risks: [
          { risk: "Problème X", severity: "CRITIQUE", mitigation: "Fix X" },
          { risk: "Problème Y", severity: "Élevé", mitigation: "Fix Y" },
          { risk: "Problème Z", severity: "low", mitigation: "Fix Z" },
        ],
      },
    };

    const { validated, report } = validateInsights(insights, mockIR);

    expect(validated.migrationRisks!.risks[0].severity).toBe("critical");
    expect(validated.migrationRisks!.risks[1].severity).toBe("high");
    expect(validated.migrationRisks!.risks[2].severity).toBe("low");
    expect(report.corrections.length).toBeGreaterThanOrEqual(2);
  });

  it("should remove hallucinated classes from hotspots", () => {
    const insights: AIInsights = {
      codeQualityInsights: {
        summary: "Qualité à améliorer.",
        hotspots: [
          { className: "AccountService", issue: "OK", suggestion: "OK" },
          { className: "FakeClassThatDoesNotExist", issue: "Hallucination", suggestion: "N/A" },
          { className: "TransferService", issue: "OK", suggestion: "OK" },
        ],
      },
    };

    const { validated, report } = validateInsights(insights, mockIR);

    expect(validated.codeQualityInsights!.hotspots).toHaveLength(2);
    expect(validated.codeQualityInsights!.hotspots.map(h => h.className)).toContain("AccountService");
    expect(validated.codeQualityInsights!.hotspots.map(h => h.className)).toContain("TransferService");
    expect(report.warnings.some(w => w.includes("FakeClassThatDoesNotExist"))).toBe(true);
  });

  it("should remove domains with all hallucinated classes", () => {
    const insights: AIInsights = {
      domainBoundaries: {
        summary: "Domaines suggérés.",
        suggestedDomains: [
          { name: "Account Domain", classes: ["AccountService", "TransferService"], rationale: "Gestion financière" },
          { name: "Fake Domain", classes: ["NonExistentClass1", "NonExistentClass2"], rationale: "Hallucination" },
        ],
      },
    };

    const { validated, report } = validateInsights(insights, mockIR);

    expect(validated.domainBoundaries!.suggestedDomains).toHaveLength(1);
    expect(validated.domainBoundaries!.suggestedDomains[0].name).toBe("Account Domain");
    expect(report.warnings.some(w => w.includes("Fake Domain"))).toBe(true);
  });

  it("should correct invalid effort values", () => {
    const insights: AIInsights = {
      modernizationStrategy: {
        summary: "Stratégie en 3 phases.",
        phases: [
          { phase: "Phase 1", description: "Extraction", effort: "3 semaines" },
          { phase: "Phase 2", description: "Migration", effort: "très élevé" },
          { phase: "Phase 3", description: "Tests", effort: "low" },
        ],
      },
    };

    const { validated, report } = validateInsights(insights, mockIR);

    // "3 semaines" ne contient aucun mot-clé → corrigé en "low"
    expect(validated.modernizationStrategy!.phases[0].effort).toBe("low");
    // "très élevé" → "very-high"
    expect(validated.modernizationStrategy!.phases[1].effort).toBe("very-high");
    // "low" → inchangé
    expect(validated.modernizationStrategy!.phases[2].effort).toBe("low");
  });

  it("should handle case-insensitive class matching", () => {
    const insights: AIInsights = {
      codeQualityInsights: {
        summary: "Test case-insensitive.",
        hotspots: [
          { className: "accountservice", issue: "Casse incorrecte", suggestion: "OK" },
          { className: "TRANSFERSERVICE", issue: "Majuscules", suggestion: "OK" },
        ],
      },
    };

    const { validated, report } = validateInsights(insights, mockIR);

    // Les classes doivent être corrigées vers la bonne casse
    expect(validated.codeQualityInsights!.hotspots).toHaveLength(2);
    expect(validated.codeQualityInsights!.hotspots[0].className).toBe("AccountService");
    expect(validated.codeQualityInsights!.hotspots[1].className).toBe("TransferService");
  });

  it("should handle empty insights gracefully", () => {
    const insights: AIInsights = {};
    const { validated, report } = validateInsights(insights, mockIR);

    expect(report.totalChecks).toBe(0);
    expect(report.valid).toBe(true);
    expect(validated).toEqual({});
  });
});
