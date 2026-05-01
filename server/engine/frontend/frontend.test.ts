/**
 * Tests unitaires pour le module frontend :
 * - DynamicOptionsResolver : options conditionnelles basees sur l'analyse
 * - PostMigrationChecklist : checklist post-migration dynamique
 *
 * @version v10.8
 */
import { describe, it, expect } from "vitest";
import {
  DynamicOptionsResolver,
  type DetectedDomain,
} from "./DynamicOptionsResolver";
import {
  PostMigrationChecklist,
  type ChecklistInput,
} from "./PostMigrationChecklist";
import type { TechnologyType } from "../registry/types";

// ─── DynamicOptionsResolver ─────────────────────────────────────────────────

describe("DynamicOptionsResolver", () => {
  const resolver = new DynamicOptionsResolver();

  it("should return no frontend option when no IHM detected", () => {
    const result = resolver.resolve({
      technologiesDetected: ["EJB_SESSION_BEAN"] as TechnologyType[],
      detectedComponents: [
        { type: "EJB_SESSION_BEAN", technology: "EJB_SESSION_BEAN" as TechnologyType, className: "UserService" },
      ],
      aiInsights: null,
      sourceFiles: [],
    });

    const frontendOption = result.options.find((o) => o.id === "frontend");
    expect(frontendOption).toBeUndefined();
  });

  it("should propose frontend when JSP detected", () => {
    const result = resolver.resolve({
      technologiesDetected: ["EJB_SESSION_BEAN", "JSP"] as TechnologyType[],
      detectedComponents: [
        { type: "EJB_SESSION_BEAN", technology: "EJB_SESSION_BEAN" as TechnologyType, className: "UserService" },
        { type: "JSP", technology: "JSP" as TechnologyType, className: "UserListJsp" },
      ],
      aiInsights: null,
      sourceFiles: [],
    });

    const frontendOption = result.options.find((o) => o.id === "frontend");
    expect(frontendOption).toBeDefined();
    expect(frontendOption!.defaultEnabled).toBe(true);
    expect(frontendOption!.category).toBe("frontend");
  });

  it("should propose frontend when Struts detected", () => {
    const result = resolver.resolve({
      technologiesDetected: ["STRUTS_1"] as TechnologyType[],
      detectedComponents: [
        { type: "STRUTS_1", technology: "STRUTS_1" as TechnologyType, className: "LoginAction" },
      ],
      aiInsights: null,
      sourceFiles: [],
    });

    const frontendOption = result.options.find((o) => o.id === "frontend");
    expect(frontendOption).toBeDefined();
    expect(frontendOption!.defaultEnabled).toBe(true);
  });

  it("should propose frontend when jQuery AJAX detected in source files", () => {
    const result = resolver.resolve({
      technologiesDetected: ["EJB_SESSION_BEAN"] as TechnologyType[],
      detectedComponents: [
        { type: "EJB_SESSION_BEAN", technology: "EJB_SESSION_BEAN" as TechnologyType, className: "UserService" },
      ],
      aiInsights: null,
      sourceFiles: [
        { path: "webapp/js/app.js", content: '$.ajax({ url: "/api/users", type: "GET" });' },
      ],
    });

    const frontendOption = result.options.find((o) => o.id === "frontend");
    expect(frontendOption).toBeDefined();
  });

  it("should propose BIAN mapping when banking domain detected via aiInsights", () => {
    const result = resolver.resolve({
      technologiesDetected: ["EJB_SESSION_BEAN"] as TechnologyType[],
      detectedComponents: [
        { type: "EJB_SESSION_BEAN", technology: "EJB_SESSION_BEAN" as TechnologyType, className: "AccountService" },
      ],
      aiInsights: {
        domainInsights: [
          {
            domain: "banking",
            label: "Banking Services",
            businessRole: "Financial transaction processing",
            confidence: 0.9,
            indicators: ["account", "transaction", "virement"],
          },
        ],
        riskAssessment: { overallRisk: "MEDIUM", risks: [] },
        migrationStrategy: [{ description: "Migrate banking services to Spring Boot" }],
        architectureRecommendations: [],
      },
      sourceFiles: [],
    });

    const bianOption = result.options.find((o) => o.id === "bian_mapping");
    expect(bianOption).toBeDefined();
    if (bianOption) {
      expect(bianOption.category).toBe("standard");
      expect(bianOption.defaultEnabled).toBe(true);
    }
  });

  it("should propose microservices when bounded contexts detected", () => {
    const result = resolver.resolve({
      technologiesDetected: ["EJB_SESSION_BEAN"] as TechnologyType[],
      detectedComponents: [
        { type: "EJB_SESSION_BEAN", technology: "EJB_SESSION_BEAN" as TechnologyType, className: "OrderService" },
        { type: "EJB_SESSION_BEAN", technology: "EJB_SESSION_BEAN" as TechnologyType, className: "PaymentService" },
        { type: "EJB_SESSION_BEAN", technology: "EJB_SESSION_BEAN" as TechnologyType, className: "InventoryService" },
      ],
      aiInsights: {
        domainInsights: [
          {
            domain: "ecommerce",
            label: "E-Commerce Platform",
            businessRole: "Order and payment management",
            confidence: 0.8,
            indicators: ["order", "payment"],
            boundedContexts: ["order-management", "payment-processing"],
          },
          {
            domain: "inventory",
            label: "Inventory Management",
            businessRole: "Stock and warehouse management",
            confidence: 0.7,
            indicators: ["inventory", "stock"],
            boundedContexts: ["inventory"],
          },
        ],
        riskAssessment: { overallRisk: "MEDIUM", risks: [] },
        migrationStrategy: [{ description: "Extract microservices from monolith" }],
        architectureRecommendations: [],
      },
      sourceFiles: [],
    });

    const msOption = result.options.find((o) => o.id === "microservices");
    expect(msOption).toBeDefined();
    if (msOption) {
      expect(msOption.defaultEnabled).toBe(true);
      expect(msOption.category).toBe("architecture");
    }
  });

  it("should return all options with correct structure", () => {
    const result = resolver.resolve({
      technologiesDetected: ["EJB_SESSION_BEAN", "JSP"] as TechnologyType[],
      detectedComponents: [
        { type: "EJB_SESSION_BEAN", technology: "EJB_SESSION_BEAN" as TechnologyType, className: "UserService" },
        { type: "JSP", technology: "JSP" as TechnologyType, className: "UserListJsp" },
      ],
      aiInsights: null,
      sourceFiles: [],
    });

    expect(result).toHaveProperty("options");
    expect(result).toHaveProperty("detectedDomain");
    expect(result).toHaveProperty("detectionSummary");
    expect(Array.isArray(result.options)).toBe(true);

    for (const opt of result.options) {
      expect(opt).toHaveProperty("id");
      expect(opt).toHaveProperty("label");
      expect(opt).toHaveProperty("description");
      expect(opt).toHaveProperty("defaultEnabled");
      expect(opt).toHaveProperty("category");
      expect(opt).toHaveProperty("confidence");
      expect(opt).toHaveProperty("triggeredBy");
    }
  });
});

// ─── PostMigrationChecklist ─────────────────────────────────────────────────

describe("PostMigrationChecklist", () => {
  const checklist = new PostMigrationChecklist();

  const baseInput: ChecklistInput = {
    projectName: "test-project",
    technologiesDetected: ["EJB_SESSION_BEAN"] as TechnologyType[],
    detectedDomain: { primary: "GENERIC", confidence: "medium" as any, indicators: [], industry: "generic" } as DetectedDomain,
    hasFrontend: false,
    hasMicroservices: false,
    hasSaga: false,
    hasMessaging: false,
    hasBatch: false,
    hasSOAP: false,
    generatedBackendFiles: 10,
    generatedFrontendFiles: 0,
    compilationErrors: 0,
  };

  it("should generate checklist items for a basic EJB project", () => {
    const result = checklist.generate(baseInput);

    expect(result).toHaveProperty("items");
    expect(result).toHaveProperty("summary");
    expect(result).toHaveProperty("markdownContent");
    expect(Array.isArray(result.items)).toBe(true);
    expect(result.items.length).toBeGreaterThan(0);

    for (const item of result.items) {
      expect(item).toHaveProperty("id");
      expect(item).toHaveProperty("title");
      expect(item).toHaveProperty("what");
      expect(item).toHaveProperty("why");
      expect(item).toHaveProperty("how");
      expect(item).toHaveProperty("priority");
      expect(item).toHaveProperty("category");
      expect(["critical", "high", "medium", "low"]).toContain(item.priority);
    }
  });

  it("should include frontend-specific items when frontend is enabled", () => {
    const result = checklist.generate({
      ...baseInput,
      technologiesDetected: ["EJB_SESSION_BEAN", "JSP"] as TechnologyType[],
      hasFrontend: true,
      frontendFramework: "react",
      generatedFrontendFiles: 15,
    });

    const frontendItems = result.items.filter(
      (i) => i.category === "frontend" || i.tags.includes("frontend")
    );
    expect(frontendItems.length).toBeGreaterThan(0);
  });

  it("should include microservices-specific items when microservices enabled", () => {
    const result = checklist.generate({
      ...baseInput,
      hasMicroservices: true,
    });

    // Check for any items related to microservices (could be in any category)
    const msItems = result.items.filter(
      (i) =>
        i.tags.includes("microservices") ||
        i.tags.includes("microservice") ||
        i.title.toLowerCase().includes("microservice") ||
        i.what.toLowerCase().includes("microservice") ||
        i.category === "deployment"
    );
    expect(msItems.length).toBeGreaterThan(0);
  });

  it("should calculate correct summary totals", () => {
    const result = checklist.generate(baseInput);

    expect(result.summary.total).toBe(result.items.length);
    const sumPriorities =
      result.summary.critical +
      result.summary.high +
      result.summary.medium +
      result.summary.low;
    expect(sumPriorities).toBe(result.summary.total);
  });

  it("should generate markdown content", () => {
    const result = checklist.generate(baseInput);

    expect(result.markdownContent).toBeTruthy();
    expect(result.markdownContent.length).toBeGreaterThan(100);
  });

  it("should include BIAN items when banking domain detected", () => {
    const result = checklist.generate({
      ...baseInput,
      detectedDomain: { primary: "BIAN", confidence: "high" as any, indicators: ["account", "transaction"], industry: "banking" } as DetectedDomain,
      industryStandard: "BIAN" as any,
    });

    const bianItems = result.items.filter(
      (i) => i.tags.includes("bian") || i.title.toLowerCase().includes("bian")
    );
    expect(bianItems.length).toBeGreaterThan(0);
  });

  it("should include messaging items when JMS detected", () => {
    const result = checklist.generate({
      ...baseInput,
      technologiesDetected: ["EJB_SESSION_BEAN", "JMS_MDB"] as TechnologyType[],
      hasMessaging: true,
    });

    const msgItems = result.items.filter(
      (i) =>
        i.tags.includes("messaging") ||
        i.tags.includes("jms") ||
        i.title.toLowerCase().includes("messag") ||
        i.what.toLowerCase().includes("messag")
    );
    expect(msgItems.length).toBeGreaterThan(0);
  });
});
