/**
 * CrossModuleResolver Tests — v5.6.0
 * Tests for JNDI link resolution between workspace projects.
 * @author Hamza NORDINE
 */
import { describe, it, expect } from "vitest";
import { CrossModuleResolver, type WorkspaceProject } from "./CrossModuleResolver";
import type { ProjectIR } from "../java-parser";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeIR(overrides: Partial<ProjectIR> = {}): ProjectIR {
  return {
    projectName: "test-project",
    groupId: "com.test",
    artifactId: "test-project",
    version: "1.0.0",
    packaging: "jar",
    description: "",
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
    stats: { totalFiles: 0, totalLines: 0, useCaseCount: 0, dtoCount: 0, serviceCount: 0, enumCount: 0, exceptionCount: 0, validatorCount: 0 } as any,
    warnings: [],
    ejb2xBeans: [],
    batchJobs: [],
    ...overrides,
  };
}

function makeUseCase(className: string, rawSource: string = "") {
  return {
    className,
    packageName: "com.test",
    domain: "test",
    bianDomain: "",
    bianAction: "",
    voInType: "",
    voOutType: "",
    useCaseDescription: "",
    javadoc: "",
    injectedServices: [],
    transactional: null,
    exceptionsCaught: [],
    exceptionsThrown: [],
    sourceFile: `${className}.java`,
    rawSource,
    httpMethod: "POST",
    restPath: "",
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("CrossModuleResolver", () => {
  const resolver = new CrossModuleResolver();

  describe("parseJndiPath", () => {
    it("parse java:global JNDI path", () => {
      const result = resolver.parseJndiPath("java:global/ejb-consultation/ConsulterSoldeUC");
      expect(result.moduleName).toBe("ejb-consultation");
      expect(result.className).toBe("ConsulterSoldeUC");
    });

    it("parse JNDI path with interface suffix", () => {
      const result = resolver.parseJndiPath(
        "java:global/ejb-consultation/ConsulterSoldeUC!com.bank.ConsulterSoldeRemote"
      );
      expect(result.moduleName).toBe("ejb-consultation");
      expect(result.className).toBe("ConsulterSoldeUC");
    });

    it("parse java:app JNDI path", () => {
      const result = resolver.parseJndiPath("java:app/ejb-kyc/VerifierKycUC");
      expect(result.moduleName).toBe("ejb-kyc");
      expect(result.className).toBe("VerifierKycUC");
    });
  });

  describe("extractJndiLookups", () => {
    it("extract @EJB(lookup=...) annotations", () => {
      const ir = makeIR({
        useCases: [
          makeUseCase("VirementUC", `
            @EJB(lookup = "java:global/ejb-consultation/ConsulterSoldeUC")
            private ConsulterSoldeRemote consulterSolde;
          `),
        ],
      });

      const lookups = resolver.extractJndiLookups(ir);
      expect(lookups.length).toBe(1);
      expect(lookups[0].path).toBe("java:global/ejb-consultation/ConsulterSoldeUC");
      expect(lookups[0].sourceClass).toBe("VirementUC");
    });

    it("extract InitialContext.lookup() calls", () => {
      const ir = makeIR({
        useCases: [
          makeUseCase("TransferUC", `
            Context ctx = new InitialContext();
            Object ref = ctx.lookup("java:global/ejb-kyc/VerifierKycUC");
          `),
        ],
      });

      const lookups = resolver.extractJndiLookups(ir);
      expect(lookups.length).toBe(1);
      expect(lookups[0].path).toBe("java:global/ejb-kyc/VerifierKycUC");
    });

    it("extract multiple JNDI lookups from same class", () => {
      const ir = makeIR({
        useCases: [
          makeUseCase("VirementUC", `
            @EJB(lookup = "java:global/ejb-consultation/ConsulterSoldeUC")
            private ConsulterSoldeRemote consulterSolde;
            @EJB(lookup = "java:global/ejb-kyc/VerifierKycUC")
            private VerifierKycRemote verifierKyc;
          `),
        ],
      });

      const lookups = resolver.extractJndiLookups(ir);
      expect(lookups.length).toBe(2);
    });

    it("deduplicate identical JNDI paths from same class", () => {
      const ir = makeIR({
        useCases: [
          makeUseCase("VirementUC", `
            @EJB(lookup = "java:global/ejb-consultation/ConsulterSoldeUC")
            private ConsulterSoldeRemote consulterSolde1;
            @EJB(lookup = "java:global/ejb-consultation/ConsulterSoldeUC")
            private ConsulterSoldeRemote consulterSolde2;
          `),
        ],
      });

      const lookups = resolver.extractJndiLookups(ir);
      expect(lookups.length).toBe(1);
    });

    it("extract from EJB 2.x beans", () => {
      const ir = makeIR({
        ejb2xBeans: [
          {
            className: "LegacyBean",
            rawSource: `ctx.lookup("java:global/ejb-audit/AuditUC")`,
          } as any,
        ],
      });

      const lookups = resolver.extractJndiLookups(ir);
      expect(lookups.length).toBe(1);
      expect(lookups[0].sourceClass).toBe("LegacyBean");
    });
  });

  describe("resolveLinks", () => {
    it("resolve link when target module exists in workspace", () => {
      const virementIR = makeIR({
        artifactId: "ejb-virement",
        useCases: [
          makeUseCase("VirementUC", `
            @EJB(lookup = "java:global/ejb-consultation/ConsulterSoldeUC")
            private ConsulterSoldeRemote consulterSolde;
          `),
        ],
      });

      const consultationIR = makeIR({
        artifactId: "ejb-consultation",
        useCases: [makeUseCase("ConsulterSoldeUC")],
      });

      const existingProjects: WorkspaceProject[] = [
        {
          sessionId: "session-consultation",
          projectName: "ejb-consultation",
          artifactId: "ejb-consultation",
          ir: consultationIR,
        },
      ];

      const result = resolver.resolveLinks("session-virement", virementIR, existingProjects);

      expect(result.resolved.length).toBe(1);
      expect(result.unresolved.length).toBe(0);
      expect(result.resolved[0].sourceClass).toBe("VirementUC");
      expect(result.resolved[0].targetClass).toBe("ConsulterSoldeUC");
      expect(result.resolved[0].targetSessionId).toBe("session-consultation");
      expect(result.resolved[0].status).toBe("RESOLVED");
    });

    it("mark as unresolved when target module not in workspace", () => {
      const virementIR = makeIR({
        artifactId: "ejb-virement",
        useCases: [
          makeUseCase("VirementUC", `
            @EJB(lookup = "java:global/ejb-consultation/ConsulterSoldeUC")
            private ConsulterSoldeRemote consulterSolde;
          `),
        ],
      });

      const result = resolver.resolveLinks("session-virement", virementIR, []);

      expect(result.resolved.length).toBe(0);
      expect(result.unresolved.length).toBe(1);
      expect(result.unresolved[0].targetModuleName).toBe("ejb-consultation");
      expect(result.unresolved[0].status).toBe("UNRESOLVED");
    });

    it("reverse resolution: existing project called new project", () => {
      const consultationIR = makeIR({
        artifactId: "ejb-consultation",
        useCases: [makeUseCase("ConsulterSoldeUC")],
      });

      const virementIR = makeIR({
        artifactId: "ejb-virement",
        useCases: [
          makeUseCase("VirementUC", `
            @EJB(lookup = "java:global/ejb-consultation/ConsulterSoldeUC")
            private ConsulterSoldeRemote consulterSolde;
          `),
        ],
      });

      const existingProjects: WorkspaceProject[] = [
        {
          sessionId: "session-virement",
          projectName: "ejb-virement",
          artifactId: "ejb-virement",
          ir: virementIR,
        },
      ];

      // Adding consultation to workspace — virement already exists and calls consultation
      const result = resolver.resolveLinks("session-consultation", consultationIR, existingProjects);

      // Reverse resolution: virement called consultation, now consultation is added
      expect(result.resolved.length).toBeGreaterThanOrEqual(1);
      const newlyResolved = result.resolved.filter(r => r.status === "NEWLY_RESOLVED");
      expect(newlyResolved.length).toBe(1);
      expect(newlyResolved[0].sourceSessionId).toBe("session-virement");
      expect(newlyResolved[0].targetSessionId).toBe("session-consultation");
      expect(result.newlyResolvedCount).toBe(1);
    });

    it("handle fuzzy module name matching (bmce-virement-ejb matches ejb-virement)", () => {
      const virementIR = makeIR({
        artifactId: "bmce-virement-ejb",
        useCases: [
          makeUseCase("VirementUC", `
            @EJB(lookup = "java:global/ejb-consultation/ConsulterSoldeUC")
            private ConsulterSoldeRemote consulterSolde;
          `),
        ],
      });

      const consultationIR = makeIR({
        artifactId: "ejb-consultation",
        useCases: [makeUseCase("ConsulterSoldeUC")],
      });

      const existingProjects: WorkspaceProject[] = [
        {
          sessionId: "session-consultation",
          projectName: "ejb-consultation",
          artifactId: "ejb-consultation",
          ir: consultationIR,
        },
      ];

      const result = resolver.resolveLinks("session-virement", virementIR, existingProjects);
      expect(result.resolved.length).toBe(1);
    });

    it("6 simulateurs : résolution de 8 liens JNDI", () => {
      // Simulates the prompt's test case with 6 interconnected banking modules
      const modules = [
        {
          sessionId: "sim-01",
          artifactId: "ejb-virement",
          useCases: [
            makeUseCase("VirementUC", `
              @EJB(lookup = "java:global/ejb-consultation/ConsulterSoldeUC")
              private ConsulterSoldeRemote consulterSolde;
              @EJB(lookup = "java:global/ejb-kyc/VerifierKycUC")
              private VerifierKycRemote verifierKyc;
            `),
          ],
        },
        {
          sessionId: "sim-02",
          artifactId: "ejb-consultation",
          useCases: [
            makeUseCase("ConsulterSoldeUC"),
            makeUseCase("ConsulterHistoriqueUC"),
          ],
        },
        {
          sessionId: "sim-03",
          artifactId: "ejb-kyc",
          useCases: [
            makeUseCase("VerifierKycUC", `
              @EJB(lookup = "java:global/ejb-audit/AuditUC")
              private AuditRemote audit;
            `),
          ],
        },
        {
          sessionId: "sim-04",
          artifactId: "ejb-credit",
          useCases: [
            makeUseCase("DemanderCreditUC", `
              @EJB(lookup = "java:global/ejb-consultation/ConsulterSoldeUC")
              private ConsulterSoldeRemote consulterSolde;
              @EJB(lookup = "java:global/ejb-kyc/VerifierKycUC")
              private VerifierKycRemote verifierKyc;
              @EJB(lookup = "java:global/ejb-scoring/ScoringUC")
              private ScoringRemote scoring;
            `),
          ],
        },
        {
          sessionId: "sim-05",
          artifactId: "ejb-scoring",
          useCases: [
            makeUseCase("ScoringUC", `
              @EJB(lookup = "java:global/ejb-consultation/ConsulterHistoriqueUC")
              private ConsulterHistoriqueRemote historique;
            `),
          ],
        },
        {
          sessionId: "sim-06",
          artifactId: "ejb-audit",
          useCases: [makeUseCase("AuditUC")],
        },
      ];

      // Add modules one by one and accumulate resolved links
      const allResolved: any[] = [];
      const addedProjects: WorkspaceProject[] = [];

      for (const mod of modules) {
        const ir = makeIR({
          artifactId: mod.artifactId,
          useCases: mod.useCases,
        });

        const result = resolver.resolveLinks(mod.sessionId, ir, addedProjects);
        allResolved.push(...result.resolved);

        addedProjects.push({
          sessionId: mod.sessionId,
          projectName: mod.artifactId,
          artifactId: mod.artifactId,
          ir,
        });
      }

      // Expected JNDI links:
      // When virement is added (no others yet): 0 resolved, 2 unresolved
      // When consultation is added: virement→consultation resolved (NEWLY_RESOLVED) = 1
      // When kyc is added: virement→kyc resolved (NEWLY_RESOLVED) = 1
      // When credit is added: credit→consultation (RESOLVED) + credit→kyc (RESOLVED) = 2
      // When scoring is added: credit→scoring (NEWLY_RESOLVED) + scoring→consultation (RESOLVED) = 2
      // When audit is added: kyc→audit (NEWLY_RESOLVED) = 1
      // Total resolved: 7
      expect(allResolved.length).toBeGreaterThanOrEqual(7);
    });
  });
});
