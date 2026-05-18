/**
 * Tests for Workspace Intelligence Module.
 *
 * Covers:
 * - RedundancyDetector: duplicate/overlap detection
 * - MutualizationRecommender: recommendation generation
 * - WorkspaceIntelligenceEngine: full orchestration
 *
 * @author Compleo
 */

import { describe, it, expect } from "vitest";
import { RedundancyDetector } from "./RedundancyDetector";
import { MutualizationRecommender } from "./MutualizationRecommender";
import { WorkspaceIntelligenceEngine } from "./WorkspaceIntelligenceEngine";
import type { ProjectIR, UseCaseIR, ServiceIR, DtoIR } from "../../java-parser";

// ─── Test Helpers ──────────────────────────────────────────────────────────

function makeUseCase(overrides: Partial<UseCaseIR> = {}): UseCaseIR {
  return {
    className: "TestUseCase",
    packageName: "com.test",
    domain: "test",
    bianDomain: "test",
    bianAction: "Execute",
    voInType: "TestInput",
    voOutType: "TestOutput",
    useCaseDescription: "Test use case",
    javadoc: "",
    injectedServices: [],
    transactional: null,
    exceptionsCaught: [],
    exceptionsThrown: [],
    sourceFile: "TestUseCase.java",
    rawSource: "public class TestUseCase { public void execute() {} }",
    httpMethod: "POST",
    restPath: "/test",
    ...overrides,
  };
}

function makeService(overrides: Partial<ServiceIR> = {}): ServiceIR {
  return {
    className: "TestService",
    packageName: "com.test",
    methods: [],
    injectedDependencies: [],
    sourceFile: "TestService.java",
    ...overrides,
  };
}

function makeDto(overrides: Partial<DtoIR> = {}): DtoIR {
  return {
    className: "TestDto",
    packageName: "com.test",
    fields: [],
    sourceFile: "TestDto.java",
    ...overrides,
  } as DtoIR;
}

function makeProjectIR(overrides: Partial<ProjectIR> = {}): ProjectIR {
  return {
    projectName: "test-project",
    groupId: "com.test",
    artifactId: "test-project",
    version: "1.0.0",
    packaging: "jar",
    description: "Test project",
    javaVersion: "8",
    dependencies: [],
    useCases: [],
    dtos: [],
    services: [],
    enums: [],
    exceptions: [],
    validators: [],
    remoteInterfaces: [],
    baseClasses: [],
    constants: null,
    bianMapping: [],
    stats: { totalFiles: 0, totalUseCases: 0, totalServices: 0, totalDtos: 0, totalEnums: 0 } as any,
    warnings: [],
    ejb2xBeans: [],
    batchJobs: [],
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// RedundancyDetector Tests
// ═══════════════════════════════════════════════════════════════════════════

describe("RedundancyDetector", () => {
  const detector = new RedundancyDetector();

  it("should return empty report for single project", () => {
    const result = detector.detect([
      {
        sessionId: "s1",
        projectName: "project-a",
        ir: makeProjectIR({ useCases: [makeUseCase()] }),
      },
    ]);

    expect(result.totalProjectsAnalyzed).toBe(1);
    expect(result.matches).toHaveLength(0);
  });

  it("should detect exact duplicate use cases across projects", () => {
    const uc = makeUseCase({
      className: "ConsulterSoldeUC",
      domain: "compte",
      voInType: "CompteInput",
      voOutType: "SoldeOutput",
      rawSource: `public class ConsulterSoldeUC {
        public SoldeOutput execute(CompteInput input) {
          return soldeService.consulter(input);
        }
      }`,
    });

    const result = detector.detect([
      {
        sessionId: "s1",
        projectName: "activation-carte",
        ir: makeProjectIR({ useCases: [uc] }),
      },
      {
        sessionId: "s2",
        projectName: "mise-disposition",
        ir: makeProjectIR({
          useCases: [
            makeUseCase({
              className: "ConsulterSoldeUC",
              domain: "compte",
              voInType: "CompteInput",
              voOutType: "SoldeOutput",
              rawSource: `public class ConsulterSoldeUC {
                public SoldeOutput execute(CompteInput input) {
                  return soldeService.consulter(input);
                }
              }`,
            }),
          ],
        }),
      },
    ]);

    expect(result.matches.length).toBeGreaterThan(0);
    const match = result.matches[0];
    expect(match.confidence).toBe("HIGH");
    expect(match.type).toBe("EXACT_DUPLICATE");
    expect(match.similarityScore).toBeGreaterThanOrEqual(80);
    expect(match.projectA.projectName).not.toBe(match.projectB.projectName);
  });

  it("should detect near-duplicate use cases with similar names", () => {
    const result = detector.detect([
      {
        sessionId: "s1",
        projectName: "project-a",
        ir: makeProjectIR({
          useCases: [
            makeUseCase({
              className: "GetBeneficiariesHandler",
              domain: "beneficiaire",
              voInType: "Envelope",
              voOutType: "Envelope",
              injectedServices: [{ type: "BeneficiaireDao", name: "dao" }],
            }),
          ],
        }),
      },
      {
        sessionId: "s2",
        projectName: "project-b",
        ir: makeProjectIR({
          useCases: [
            makeUseCase({
              className: "GetBeneficiariesUC",
              domain: "beneficiaire",
              voInType: "BeneficiaireInput",
              voOutType: "BeneficiaireOutput",
              injectedServices: [{ type: "BeneficiaireDao", name: "dao" }],
            }),
          ],
        }),
      },
    ]);

    expect(result.matches.length).toBeGreaterThan(0);
    const match = result.matches[0];
    expect(match.similarityScore).toBeGreaterThanOrEqual(40);
  });

  it("should detect service redundancy by method signatures", () => {
    const result = detector.detect([
      {
        sessionId: "s1",
        projectName: "project-a",
        ir: makeProjectIR({
          services: [
            makeService({
              className: "ClientService",
              methods: [
                { name: "findById", returnType: "Client", parameters: [{ name: "id", type: "Long" }], throwsExceptions: [] },
                { name: "save", returnType: "void", parameters: [{ name: "client", type: "Client" }], throwsExceptions: [] },
              ],
            }),
          ],
        }),
      },
      {
        sessionId: "s2",
        projectName: "project-b",
        ir: makeProjectIR({
          services: [
            makeService({
              className: "ClientService",
              methods: [
                { name: "findById", returnType: "Client", parameters: [{ name: "id", type: "Long" }], throwsExceptions: [] },
                { name: "save", returnType: "void", parameters: [{ name: "client", type: "Client" }], throwsExceptions: [] },
                { name: "delete", returnType: "void", parameters: [{ name: "id", type: "Long" }], throwsExceptions: [] },
              ],
            }),
          ],
        }),
      },
    ]);

    expect(result.matches.length).toBeGreaterThan(0);
    const match = result.matches[0];
    expect(["HIGH", "MEDIUM"]).toContain(match.confidence);
    expect(match.sharedMethods.length).toBeGreaterThanOrEqual(2);
  });

  it("should not match unrelated use cases", () => {
    const result = detector.detect([
      {
        sessionId: "s1",
        projectName: "project-a",
        ir: makeProjectIR({
          useCases: [
            makeUseCase({
              className: "ActivateCardUC",
              domain: "carte",
              voInType: "CardInput",
              voOutType: "CardOutput",
            }),
          ],
        }),
      },
      {
        sessionId: "s2",
        projectName: "project-b",
        ir: makeProjectIR({
          useCases: [
            makeUseCase({
              className: "TransferFundsUC",
              domain: "virement",
              voInType: "TransferInput",
              voOutType: "TransferOutput",
            }),
          ],
        }),
      },
    ]);

    expect(result.matches).toHaveLength(0);
  });

  it("should group results by domain", () => {
    const result = detector.detect([
      {
        sessionId: "s1",
        projectName: "project-a",
        ir: makeProjectIR({
          useCases: [
            makeUseCase({ className: "BeneficiaireUC", domain: "beneficiaire" }),
          ],
        }),
      },
      {
        sessionId: "s2",
        projectName: "project-b",
        ir: makeProjectIR({
          useCases: [
            makeUseCase({ className: "BeneficiaireHandler", domain: "beneficiaire" }),
          ],
        }),
      },
    ]);

    if (result.matches.length > 0) {
      expect(result.byDomain).toBeDefined();
      expect(Object.keys(result.byDomain).length).toBeGreaterThan(0);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MutualizationRecommender Tests
// ═══════════════════════════════════════════════════════════════════════════

describe("MutualizationRecommender", () => {
  const recommender = new MutualizationRecommender();

  it("should generate MERGE_SERVICES for high-confidence redundancies", () => {
    const redundancyReport = {
      totalProjectsAnalyzed: 2,
      totalUseCasesScanned: 2,
      totalServicesScanned: 0,
      matches: [
        {
          id: "RD-1",
          confidence: "HIGH" as const,
          type: "EXACT_DUPLICATE" as const,
          similarityScore: 90,
          projectA: {
            sessionId: "s1",
            projectName: "activation-carte",
            className: "ConsulterSoldeUC",
            domain: "compte",
            methods: ["execute", "consulter"],
          },
          projectB: {
            sessionId: "s2",
            projectName: "mise-disposition",
            className: "ConsulterSoldeUC",
            domain: "compte",
            methods: ["execute", "consulter"],
          },
          sharedMethods: ["execute", "consulter"],
          explanation: "Même nom de classe normalisé",
        },
      ],
      highConfidenceCount: 1,
      mediumConfidenceCount: 0,
      lowConfidenceCount: 0,
      byDomain: {},
    };

    const projects = [
      { sessionId: "s1", projectName: "activation-carte", ir: makeProjectIR() },
      { sessionId: "s2", projectName: "mise-disposition", ir: makeProjectIR() },
    ];

    const result = recommender.recommend(projects, redundancyReport, [], []);

    expect(result.recommendations.length).toBeGreaterThan(0);
    const mergeRec = result.recommendations.find(r => r.type === "MERGE_SERVICES");
    expect(mergeRec).toBeDefined();
    expect(mergeRec!.priority).toBe("CRITICAL");
    expect(mergeRec!.affectedProjects.length).toBe(2);
    expect(mergeRec!.actionItems.length).toBeGreaterThan(0);
  });

  it("should generate API_GATEWAY for strongly coupled projects", () => {
    const resolvedLinks = [
      { jndiPath: "java:global/ejb-carte/ActivateCardUC", sourceSessionId: "s1", sourceClass: "MadUC", targetSessionId: "s2", targetClass: "ActivateCardUC", targetServiceClass: "ActivateCardService", status: "RESOLVED" as const },
      { jndiPath: "java:global/ejb-carte/ConsulterCarteUC", sourceSessionId: "s1", sourceClass: "ConsultUC", targetSessionId: "s2", targetClass: "ConsulterCarteUC", targetServiceClass: "ConsulterCarteService", status: "RESOLVED" as const },
      { jndiPath: "java:global/ejb-carte/ValiderCarteUC", sourceSessionId: "s1", sourceClass: "ValidUC", targetSessionId: "s2", targetClass: "ValiderCarteUC", targetServiceClass: "ValiderCarteService", status: "RESOLVED" as const },
    ];

    const projects = [
      { sessionId: "s1", projectName: "mise-disposition", ir: makeProjectIR() },
      { sessionId: "s2", projectName: "activation-carte", ir: makeProjectIR() },
    ];

    const emptyRedundancy = {
      totalProjectsAnalyzed: 2, totalUseCasesScanned: 0, totalServicesScanned: 0,
      matches: [], highConfidenceCount: 0, mediumConfidenceCount: 0, lowConfidenceCount: 0, byDomain: {},
    };

    const result = recommender.recommend(projects, emptyRedundancy, resolvedLinks, []);

    const gatewayRec = result.recommendations.find(r => r.type === "CREATE_API_GATEWAY");
    expect(gatewayRec).toBeDefined();
    expect(gatewayRec!.affectedProjects.length).toBe(2);
    expect(result.dependencyGraph.resolvedLinks).toBe(3);
  });

  it("should detect duplicate entities across projects", () => {
    const projects = [
      {
        sessionId: "s1",
        projectName: "project-a",
        ir: makeProjectIR({
          dtos: [makeDto({ className: "ClientVO" }), makeDto({ className: "CompteVO" })],
        }),
      },
      {
        sessionId: "s2",
        projectName: "project-b",
        ir: makeProjectIR({
          dtos: [makeDto({ className: "ClientDto" }), makeDto({ className: "AdresseVO" })],
        }),
      },
    ];

    const emptyRedundancy = {
      totalProjectsAnalyzed: 2, totalUseCasesScanned: 0, totalServicesScanned: 0,
      matches: [], highConfidenceCount: 0, mediumConfidenceCount: 0, lowConfidenceCount: 0, byDomain: {},
    };

    const result = recommender.recommend(projects, emptyRedundancy, [], []);

    const entityRec = result.recommendations.find(r => r.type === "CONSOLIDATE_ENTITIES");
    expect(entityRec).toBeDefined();
    expect(entityRec!.title).toContain("Client");
  });

  it("should return empty recommendations for single project", () => {
    const projects = [
      { sessionId: "s1", projectName: "solo", ir: makeProjectIR() },
    ];

    const emptyRedundancy = {
      totalProjectsAnalyzed: 1, totalUseCasesScanned: 0, totalServicesScanned: 0,
      matches: [], highConfidenceCount: 0, mediumConfidenceCount: 0, lowConfidenceCount: 0, byDomain: {},
    };

    const result = recommender.recommend(projects, emptyRedundancy, [], []);
    expect(result.recommendations).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// WorkspaceIntelligenceEngine Tests
// ═══════════════════════════════════════════════════════════════════════════

describe("WorkspaceIntelligenceEngine", () => {
  const engine = new WorkspaceIntelligenceEngine();

  it("should return empty insight for empty workspace", () => {
    const result = engine.analyze("ws-1", []);

    expect(result.workspaceId).toBe("ws-1");
    expect(result.projectCount).toBe(0);
    expect(result.healthScore).toBe(100);
    expect(result.keyInsights.length).toBeGreaterThan(0);
  });

  it("should analyze single project without errors", () => {
    const result = engine.analyze("ws-1", [
      {
        sessionId: "s1",
        projectName: "activation-carte",
        ir: makeProjectIR({
          useCases: [
            makeUseCase({ className: "ActivateCardUC", domain: "carte" }),
          ],
          services: [
            makeService({ className: "CardService" }),
          ],
        }),
      },
    ]);

    expect(result.projectCount).toBe(1);
    expect(result.projects[0].useCaseCount).toBe(1);
    expect(result.projects[0].serviceCount).toBe(1);
    expect(result.redundancy.matches).toHaveLength(0);
    expect(result.healthScore).toBe(100);
  });

  it("should detect cross-project JNDI dependencies", () => {
    const result = engine.analyze("ws-1", [
      {
        sessionId: "s1",
        projectName: "mise-disposition",
        ir: makeProjectIR({
          artifactId: "ejb-mad",
          useCases: [
            makeUseCase({
              className: "TraitementMadUC",
              rawSource: `@EJB(lookup = "java:global/ejb-carte/ActivateCardUC")
                private ActivateCardRemote activateCard;`,
            }),
          ],
        }),
      },
      {
        sessionId: "s2",
        projectName: "activation-carte",
        ir: makeProjectIR({
          artifactId: "ejb-carte",
          useCases: [
            makeUseCase({ className: "ActivateCardUC" }),
          ],
        }),
      },
    ]);

    expect(result.crossModuleResolution.resolvedLinks.length).toBeGreaterThan(0);
    expect(result.crossModuleResolution.resolutionRate).toBeGreaterThan(0);
  });

  it("should detect redundancies and generate mutualization recommendations", () => {
    const sharedUC = makeUseCase({
      className: "ConsulterSoldeUC",
      domain: "compte",
      voInType: "CompteInput",
      voOutType: "SoldeOutput",
      rawSource: "public class ConsulterSoldeUC { public SoldeOutput execute(CompteInput in) { return service.getSolde(in); } }",
    });

    const result = engine.analyze("ws-1", [
      {
        sessionId: "s1",
        projectName: "activation-carte",
        ir: makeProjectIR({ useCases: [sharedUC] }),
      },
      {
        sessionId: "s2",
        projectName: "mise-disposition",
        ir: makeProjectIR({
          useCases: [
            makeUseCase({
              className: "ConsulterSoldeUC",
              domain: "compte",
              voInType: "CompteInput",
              voOutType: "SoldeOutput",
              rawSource: "public class ConsulterSoldeUC { public SoldeOutput execute(CompteInput in) { return service.getSolde(in); } }",
            }),
          ],
        }),
      },
    ]);

    expect(result.redundancy.matches.length).toBeGreaterThan(0);
    expect(result.redundancy.highConfidenceCount).toBeGreaterThan(0);
    expect(result.mutualization.recommendations.length).toBeGreaterThan(0);
    expect(result.healthScore).toBeLessThan(100);
  });

  it("should detect technologies from dependencies and source code", () => {
    const result = engine.analyze("ws-1", [
      {
        sessionId: "s1",
        projectName: "legacy-app",
        ir: makeProjectIR({
          dependencies: [
            { groupId: "javax.ejb", artifactId: "javax.ejb-api", version: "3.2", scope: "provided" } as any,
            { groupId: "org.hibernate", artifactId: "hibernate-core", version: "5.6", scope: "compile" } as any,
          ],
          useCases: [
            makeUseCase({
              rawSource: `@Stateless
                public class MyUC {
                  @PersistenceContext private EntityManager em;
                  public void execute() { PreparedStatement ps = conn.prepareStatement("SELECT 1"); }
                }`,
            }),
          ],
        }),
      },
    ]);

    const techs = result.projects[0].technologies;
    expect(techs).toContain("EJB");
    expect(techs).toContain("Hibernate");
    expect(techs).toContain("JDBC");
  });

  it("should generate key insights with actionable messages", () => {
    const result = engine.analyze("ws-1", [
      {
        sessionId: "s1",
        projectName: "project-a",
        ir: makeProjectIR({
          useCases: [makeUseCase({ className: "TestUC" })],
        }),
      },
      {
        sessionId: "s2",
        projectName: "project-b",
        ir: makeProjectIR({
          useCases: [makeUseCase({ className: "TestUC" })],
        }),
      },
    ]);

    expect(result.keyInsights.length).toBeGreaterThan(0);
    expect(result.keyInsights[0]).toContain("2 projets analysés");
  });

  it("should handle incremental analysis", () => {
    const existing = [
      {
        sessionId: "s1",
        projectName: "project-a",
        ir: makeProjectIR({ useCases: [makeUseCase()] }),
      },
    ];

    const newProject = {
      sessionId: "s2",
      projectName: "project-b",
      ir: makeProjectIR({ useCases: [makeUseCase()] }),
    };

    const result = engine.analyzeIncremental("ws-1", existing, newProject);

    expect(result.projectCount).toBe(2);
    expect(result.projects.length).toBe(2);
  });
});
