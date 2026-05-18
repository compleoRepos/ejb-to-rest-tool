/**
 * Tests — MissingModuleAnalyzer v5.6.1
 * Détection proactive des dépendances manquantes + inférence de contrats.
 * @author Compleo
 */

import { describe, it, expect } from "vitest";
import { MissingModuleAnalyzer } from "./MissingModuleAnalyzer";
import type { ProjectIR } from "../java-parser";

// ─── Test Helpers ──────────────────────────────────────────────────────────

function makeIR(overrides: Partial<ProjectIR> = {}): ProjectIR {
  return {
    groupId: "com.bank",
    artifactId: "ejb-virement",
    version: "1.0",
    packageName: "com.bank.virement",
    useCases: [],
    dtos: [],
    enums: [],
    exceptions: [],
    validators: [],
    remoteInterfaces: [],
    ejb2xBeans: [],
    stats: {
      totalFiles: 0,
      totalLines: 0,
      useCaseCount: 0,
      dtoCount: 0,
      serviceCount: 0,
      enumCount: 0,
      exceptionCount: 0,
      validatorCount: 0,
      remoteInterfaceCount: 0,
      domainCount: 0,
      domains: [],
    },
    warnings: [],
    ...overrides,
  } as ProjectIR;
}

function makeUseCase(className: string, rawSource: string) {
  return {
    className,
    domain: "VIREMENT",
    httpMethod: "POST",
    voInType: "VirementVoIn",
    voOutType: "VirementVoOut",
    rawSource,
    injectedServices: [],
    fields: [],
    restPath: "/virement",
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("MissingModuleAnalyzer", () => {
  const analyzer = new MissingModuleAnalyzer();

  describe("extractAllJndiLookups", () => {
    it("extracts @EJB(lookup=...) annotations", () => {
      const ir = makeIR({
        useCases: [
          makeUseCase("VirementUC", `
            @EJB(lookup = "java:global/ejb-consultation/ConsulterSoldeUC")
            private ConsulterSoldeRemote consulterSolde;
          `),
        ] as any,
      });

      const lookups = analyzer.extractAllJndiLookups(ir);
      expect(lookups.length).toBe(1);
      expect(lookups[0].path).toBe("java:global/ejb-consultation/ConsulterSoldeUC");
      expect(lookups[0].sourceClass).toBe("VirementUC");
    });

    it("extracts ctx.lookup() calls", () => {
      const ir = makeIR({
        useCases: [
          makeUseCase("VirementUC", `
            InitialContext ctx = new InitialContext();
            Object ref = ctx.lookup("java:global/ejb-kyc/VerifierKycUC");
          `),
        ] as any,
      });

      const lookups = analyzer.extractAllJndiLookups(ir);
      expect(lookups.length).toBe(1);
      expect(lookups[0].path).toBe("java:global/ejb-kyc/VerifierKycUC");
    });

    it("extracts multiple lookups from the same class", () => {
      const ir = makeIR({
        useCases: [
          makeUseCase("VirementUC", `
            @EJB(lookup = "java:global/ejb-consultation/ConsulterSoldeUC")
            private ConsulterSoldeRemote consulterSolde;
            @EJB(lookup = "java:global/ejb-kyc/VerifierKycUC")
            private VerifierKycRemote verifierKyc;
          `),
        ] as any,
      });

      const lookups = analyzer.extractAllJndiLookups(ir);
      expect(lookups.length).toBe(2);
    });

    it("deduplicates identical lookups from the same class", () => {
      const ir = makeIR({
        useCases: [
          makeUseCase("VirementUC", `
            @EJB(lookup = "java:global/ejb-consultation/ConsulterSoldeUC")
            private ConsulterSoldeRemote consulterSolde;
            @EJB(lookup = "java:global/ejb-consultation/ConsulterSoldeUC")
            private ConsulterSoldeRemote consulterSolde2;
          `),
        ] as any,
      });

      const lookups = analyzer.extractAllJndiLookups(ir);
      expect(lookups.length).toBe(1);
    });

    it("ignores non-java: lookups", () => {
      const ir = makeIR({
        useCases: [
          makeUseCase("VirementUC", `
            Object ref = ctx.lookup("ldap://server/cn=admin");
          `),
        ] as any,
      });

      const lookups = analyzer.extractAllJndiLookups(ir);
      expect(lookups.length).toBe(0);
    });
  });

  describe("parseJndi", () => {
    it("parses java:global/module/class pattern", () => {
      const result = analyzer.parseJndi("java:global/ejb-consultation/ConsulterSoldeUC");
      expect(result.moduleName).toBe("ejb-consultation");
      expect(result.className).toBe("ConsulterSoldeUC");
    });

    it("parses java:global/module/class!interface pattern", () => {
      const result = analyzer.parseJndi("java:global/ejb-consultation/ConsulterSoldeUC!com.bank.ConsulterSoldeRemote");
      expect(result.moduleName).toBe("ejb-consultation");
      expect(result.className).toBe("ConsulterSoldeUC");
    });

    it("parses java:app/class pattern", () => {
      const result = analyzer.parseJndi("java:app/ConsulterSoldeUC");
      expect(result.moduleName).toBe("");
      expect(result.className).toBe("ConsulterSoldeUC");
    });
  });

  describe("analyze — full pipeline", () => {
    it("detects missing modules from @EJB lookups", () => {
      const ir = makeIR({
        useCases: [
          makeUseCase("VirementUC", `
            @EJB(lookup = "java:global/ejb-consultation/ConsulterSoldeUC")
            private ConsulterSoldeRemote consulterSolde;

            public void execute() {
              String solde = consulterSolde.consulterSolde(numCompte);
            }
          `),
        ] as any,
      });

      const result = analyzer.analyze(ir, []);
      expect(result.length).toBe(1);
      expect(result[0].moduleName).toBe("ejb-consultation");
      expect(result[0].inferredClasses[0].className).toBe("ConsulterSoldeUC");
      expect(result[0].inferredClasses[0].inferredMethodName).toBe("consulterSolde");
    });

    it("does NOT flag modules that are already present", () => {
      const ir = makeIR({
        useCases: [
          makeUseCase("VirementUC", `
            @EJB(lookup = "java:global/ejb-consultation/ConsulterSoldeUC")
            private ConsulterSoldeRemote consulterSolde;
          `),
        ] as any,
      });

      const existingModule = makeIR({
        artifactId: "ejb-consultation",
        useCases: [makeUseCase("ConsulterSoldeUC", "public class ConsulterSoldeUC {}")] as any,
      });

      const result = analyzer.analyze(ir, [existingModule]);
      expect(result.length).toBe(0);
    });

    it("detects multiple missing modules", () => {
      const ir = makeIR({
        useCases: [
          makeUseCase("VirementUC", `
            @EJB(lookup = "java:global/ejb-consultation/ConsulterSoldeUC")
            private ConsulterSoldeRemote consulterSolde;
            @EJB(lookup = "java:global/ejb-kyc/VerifierKycUC")
            private VerifierKycRemote verifierKyc;
          `),
        ] as any,
      });

      const result = analyzer.analyze(ir, []);
      expect(result.length).toBe(2);
      const moduleNames = result.map(r => r.moduleName).sort();
      expect(moduleNames).toEqual(["ejb-consultation", "ejb-kyc"]);
    });

    it("groups multiple lookups to the same module", () => {
      const ir = makeIR({
        useCases: [
          makeUseCase("VirementUC", `
            @EJB(lookup = "java:global/ejb-consultation/ConsulterSoldeUC")
            private ConsulterSoldeRemote consulterSolde;
            @EJB(lookup = "java:global/ejb-consultation/HistoriqueUC")
            private HistoriqueRemote historique;
          `),
        ] as any,
      });

      const result = analyzer.analyze(ir, []);
      expect(result.length).toBe(1);
      expect(result[0].moduleName).toBe("ejb-consultation");
      expect(result[0].inferredClasses.length).toBe(2);
    });

    it("returns empty when no JNDI lookups exist", () => {
      const ir = makeIR({
        useCases: [
          makeUseCase("VirementUC", `
            public class VirementUC {
              public void execute() { /* no external calls */ }
            }
          `),
        ] as any,
      });

      const result = analyzer.analyze(ir, []);
      expect(result.length).toBe(0);
    });
  });

  describe("inferDomain", () => {
    it("infers CONSULTATION domain", () => {
      expect(analyzer.inferDomain("ConsulterSoldeUC", "ejb-consultation")).toBe("CONSULTATION");
    });

    it("infers KYC domain", () => {
      expect(analyzer.inferDomain("VerifierKycUC", "ejb-kyc")).toBe("KYC");
    });

    it("infers VIREMENT domain", () => {
      expect(analyzer.inferDomain("InitierVirementUC", "ejb-virement")).toBe("VIREMENT");
    });

    it("falls back to module name when no keyword matches", () => {
      expect(analyzer.inferDomain("SomeUC", "ejb-reporting")).toBe("REPORTING");
    });
  });

  describe("assessCriticality", () => {
    it("returns BLOCKING when callers use throw/return and count >= 2", () => {
      const callers = [
        { callerClass: "A", callerMethod: "m1", callSiteCode: "throw new Ex()", surroundingCode: "" },
        { callerClass: "B", callerMethod: "m2", callSiteCode: "return result", surroundingCode: "" },
      ];
      expect(analyzer.assessCriticality(callers, [])).toBe("BLOCKING");
    });

    it("returns HIGH when 3+ callers", () => {
      const callers = [
        { callerClass: "A", callerMethod: "m1", callSiteCode: "x = svc.call()", surroundingCode: "" },
        { callerClass: "B", callerMethod: "m2", callSiteCode: "y = svc.call()", surroundingCode: "" },
        { callerClass: "C", callerMethod: "m3", callSiteCode: "z = svc.call()", surroundingCode: "" },
      ];
      expect(analyzer.assessCriticality(callers, [])).toBe("HIGH");
    });

    it("returns MEDIUM when 2 callers without blocking evidence", () => {
      const callers = [
        { callerClass: "A", callerMethod: "m1", callSiteCode: "x = svc.call()", surroundingCode: "" },
        { callerClass: "B", callerMethod: "m2", callSiteCode: "y = svc.call()", surroundingCode: "" },
      ];
      expect(analyzer.assessCriticality(callers, [])).toBe("MEDIUM");
    });

    it("returns LOW when 1 caller", () => {
      const callers = [
        { callerClass: "A", callerMethod: "m1", callSiteCode: "x = svc.call()", surroundingCode: "" },
      ];
      expect(analyzer.assessCriticality(callers, [])).toBe("LOW");
    });
  });

  describe("calculateConfidence", () => {
    it("returns 0.3 for empty callers", () => {
      expect(analyzer.calculateConfidence([])).toBe(0.3);
    });

    it("increases with more callers", () => {
      const c1 = analyzer.calculateConfidence([
        { callerClass: "A", callerMethod: "m", callSiteCode: "", surroundingCode: "" },
      ]);
      const c2 = analyzer.calculateConfidence([
        { callerClass: "A", callerMethod: "m", callSiteCode: "", surroundingCode: "" },
        { callerClass: "B", callerMethod: "m", callSiteCode: "", surroundingCode: "" },
      ]);
      expect(c2).toBeGreaterThan(c1);
    });

    it("increases when call sites have assignments", () => {
      const c1 = analyzer.calculateConfidence([
        { callerClass: "A", callerMethod: "m", callSiteCode: "svc.call()", surroundingCode: "" },
      ]);
      const c2 = analyzer.calculateConfidence([
        { callerClass: "A", callerMethod: "m", callSiteCode: "x = svc.call()", surroundingCode: "" },
      ]);
      expect(c2).toBeGreaterThan(c1);
    });

    it("never exceeds 0.95", () => {
      const callers = Array.from({ length: 20 }, (_, i) => ({
        callerClass: `C${i}`, callerMethod: "m",
        callSiteCode: "x = svc.call(a, b)", surroundingCode: "",
      }));
      expect(analyzer.calculateConfidence(callers)).toBeLessThanOrEqual(0.95);
    });
  });

  describe("generateContract", () => {
    it("generates Java interface code", () => {
      const ir = makeIR();
      const cls = {
        className: "ConsulterSoldeUC",
        inferredMethodName: "consulterSolde",
        inferredReturnType: "Object",
        inferredParams: [{ name: "numCompte", type: "String" }],
        evidences: ["@EJB lookup dans VirementUC"],
      };

      const contract = analyzer.generateContract("ejb-consultation", [cls], ir);
      expect(contract.interfaceCode).toContain("interface ConsulterSoldeService");
      expect(contract.interfaceCode).toContain("consulterSolde");
      expect(contract.interfaceCode).toContain("String numCompte");
    });

    it("generates Spring Boot stub code", () => {
      const ir = makeIR();
      const cls = {
        className: "ConsulterSoldeUC",
        inferredMethodName: "consulterSolde",
        inferredReturnType: "Object",
        inferredParams: [{ name: "numCompte", type: "String" }],
        evidences: [],
      };

      const contract = analyzer.generateContract("ejb-consultation", [cls], ir);
      expect(contract.stubCode).toContain("class ConsulterSoldeServiceStub");
      expect(contract.stubCode).toContain("@Service");
      expect(contract.stubCode).toContain("@ConditionalOnMissingBean");
      expect(contract.stubCode).toContain("UnsupportedOperationException");
    });

    it("generates documentation markdown", () => {
      const ir = makeIR();
      const cls = {
        className: "ConsulterSoldeUC",
        inferredMethodName: "consulterSolde",
        inferredReturnType: "Object",
        inferredParams: [{ name: "numCompte", type: "String" }],
        evidences: ["Evidence 1"],
      };

      const contract = analyzer.generateContract("ejb-consultation", [cls], ir);
      expect(contract.documentationMd).toContain("ejb-consultation");
      expect(contract.documentationMd).toContain("ConsulterSoldeService");
      expect(contract.documentationMd).toContain("Evidence 1");
    });
  });

  describe("fuzzy module matching", () => {
    it("matches normalized module names (ejb-consultation vs ejbconsultation)", () => {
      const ir = makeIR({
        useCases: [
          makeUseCase("VirementUC", `
            @EJB(lookup = "java:global/ejb-consultation/ConsulterSoldeUC")
            private ConsulterSoldeRemote consulterSolde;
          `),
        ] as any,
      });

      // Module with slightly different name format
      const existingModule = makeIR({
        artifactId: "ejbconsultation",
        useCases: [makeUseCase("ConsulterSoldeUC", "")] as any,
      });

      const result = analyzer.analyze(ir, [existingModule]);
      expect(result.length).toBe(0); // Should match and not flag as missing
    });
  });
});
