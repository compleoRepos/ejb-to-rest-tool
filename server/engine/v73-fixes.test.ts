/**
 * Tests unitaires — COMPLEO v7.3 FIX E/F/G/H
 *
 * FIX E: Paramètres méthodes propagés depuis le legacy
 * FIX F: Object n'est jamais acceptable comme type retour
 * FIX G: Toutes les méthodes business d'un bean générées
 * FIX H: Quality scorer avec 8 checks
 */
import { describe, it, expect } from "vitest";
import { generateSpringBootProject } from "../spring-generator";
import type { ProjectIR, UseCaseIR, DtoIR, Ejb2xBeanIR } from "../java-parser";
import { scoreGeneration, type QualityReport, type TestRegressionResult, type CheckId } from "./quality-scorer";
import type { GeneratedFile } from "../spring/shared";

// ── Helpers ──────────────────────────────────────────────────────────

function makeIR(overrides: Partial<ProjectIR> = {}): ProjectIR {
  return {
    projectName: "test-project",
    groupId: "com.test",
    artifactId: "test-project",
    version: "1.0.0",
    packaging: "jar",
    description: "Test project",
    javaVersion: "17",
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
    stats: { totalFiles: 0, totalLines: 0, useCaseCount: 0, dtoCount: 0, enumCount: 0 } as any,
    warnings: [],
    ejb2xBeans: [],
    batchJobs: [],
    ...overrides,
  } as ProjectIR;
}

function makeUseCase(overrides: Partial<UseCaseIR> = {}): UseCaseIR {
  return {
    className: "TestUseCase",
    voInType: "Void",
    voOutType: "Void",
    rawSource: "",
    bianDomain: "",
    bianAction: "",
    injectedServices: [],
    sqlQueries: [],
    jndiLookups: [],
    javadoc: "",
    httpMethod: "",
    ...overrides,
  } as UseCaseIR;
}

function makeDto(className: string, fields: { name: string; type: string; required?: boolean }[]): DtoIR {
  return {
    className,
    fields: fields.map(f => ({
      name: f.name,
      type: f.type,
      resolvedType: f.type,
      required: f.required ?? true,
      javadoc: "",
    })),
    javadoc: "",
  };
}

function getCheck(report: QualityReport, id: CheckId) {
  return report.checks.find(c => c.id === id)!;
}

// ── FIX E: Paramètres méthodes propagés ─────────────────────────────

describe("FIX E — Paramètres méthodes propagés depuis le legacy", () => {
  it("devrait propager les paramètres quand methodParameters est défini et voInType est Void", () => {
    const uc = makeUseCase({
      className: "GetCartesActives",
      voInType: "Void",
      voOutType: "List<String>",
      rawSource: "public List<String> getCartesActives(String numCompte) { return null; }",
      methodParameters: [{ name: "numCompte", type: "String" }],
    });

    const ir = makeIR({ useCases: [uc] });
    const result = generateSpringBootProject(ir);

    // Service should have the parameter
    const serviceFile = result.files.find(f =>
      f.category === "service" && f.path.includes("Service.java")
    );
    expect(serviceFile).toBeDefined();
    expect(serviceFile!.content).toContain("String numCompte");
    // Should NOT have an empty parameter list
    expect(serviceFile!.content).not.toMatch(/getCartesActives\s*\(\s*\)/);
  });

  it("devrait propager plusieurs paramètres (getHistoriqueClientComplet)", () => {
    const uc = makeUseCase({
      className: "GetHistoriqueClientComplet",
      voInType: "Void",
      voOutType: "Void",
      rawSource: "public void getHistoriqueClientComplet(String codeClient, String dateDebut, String dateFin) {}",
      methodParameters: [
        { name: "codeClient", type: "String" },
        { name: "dateDebut", type: "String" },
        { name: "dateFin", type: "String" },
      ],
    });

    const ir = makeIR({ useCases: [uc] });
    const result = generateSpringBootProject(ir);

    const serviceFile = result.files.find(f =>
      f.category === "service" && f.path.includes("Service.java")
    );
    expect(serviceFile).toBeDefined();
    expect(serviceFile!.content).toContain("codeClient");
    expect(serviceFile!.content).toContain("dateDebut");
    expect(serviceFile!.content).toContain("dateFin");
  });

  it("devrait aussi propager les paramètres dans le controller", () => {
    const uc = makeUseCase({
      className: "GetCartesActives",
      voInType: "Void",
      voOutType: "List<String>",
      rawSource: "public List<String> getCartesActives(String numCompte) { return null; }",
      methodParameters: [{ name: "numCompte", type: "String" }],
    });

    const ir = makeIR({ useCases: [uc] });
    const result = generateSpringBootProject(ir);

    const controllerFile = result.files.find(f =>
      f.category === "controller" && f.path.includes("Controller.java")
    );
    expect(controllerFile).toBeDefined();
    expect(controllerFile!.content).toContain("numCompte");
  });
});

// ── FIX F: Object n'est jamais acceptable comme type retour ─────────

describe("FIX F — Object interdit comme type retour", () => {
  it("devrait inférer le type retour depuis rawSource quand voOutType est Object", () => {
    const uc = makeUseCase({
      className: "HandlePostConnexion",
      voInType: "Void",
      voOutType: "Object",
      rawSource: `
        public AuthResponseDTO handlePostConnexion(String login, String password) {
          AuthResponseDTO response = new AuthResponseDTO();
          response.setToken(generateToken(login));
          return response;
        }
      `,
    });

    const ir = makeIR({ useCases: [uc] });
    const result = generateSpringBootProject(ir);

    const serviceFile = result.files.find(f =>
      f.category === "service" && f.path.includes("Service.java")
    );
    expect(serviceFile).toBeDefined();
    // Should NOT return Object
    expect(serviceFile!.content).not.toMatch(/public\s+Object\s+/);
    // Should return AuthResponseDTO
    expect(serviceFile!.content).toContain("AuthResponseDTO");
  });

  it("devrait retourner void pour les méthodes de déconnexion", () => {
    const uc = makeUseCase({
      className: "HandlePostDeconnexion",
      voInType: "Void",
      voOutType: "Object",
      rawSource: `
        public void handlePostDeconnexion(String token) {
          invalidateSession(token);
        }
      `,
    });

    const ir = makeIR({ useCases: [uc] });
    const result = generateSpringBootProject(ir);

    const serviceFile = result.files.find(f =>
      f.category === "service" && f.path.includes("Service.java")
    );
    expect(serviceFile).toBeDefined();
    // Should NOT return Object
    expect(serviceFile!.content).not.toMatch(/public\s+Object\s+/);
  });

  it("devrait inférer le type depuis un pattern return new XxxDTO()", () => {
    const uc = makeUseCase({
      className: "GetSolde",
      voInType: "Void",
      voOutType: "Object",
      rawSource: `
        public Object getSolde(String numCompte) {
          return new SoldeResponseDTO(numCompte, montant);
        }
      `,
    });

    const ir = makeIR({ useCases: [uc] });
    const result = generateSpringBootProject(ir);

    const serviceFile = result.files.find(f =>
      f.category === "service" && f.path.includes("Service.java")
    );
    expect(serviceFile).toBeDefined();
    expect(serviceFile!.content).toContain("SoldeResponseDTO");
    expect(serviceFile!.content).not.toMatch(/public\s+Object\s+/);
  });
});

// ── FIX G: Toutes les méthodes business générées ────────────────────

describe("FIX G — Toutes les méthodes business d'un bean", () => {
  it("devrait générer validerSession(String token) → boolean", () => {
    const uc = makeUseCase({
      className: "ValiderSession",
      voInType: "Void",
      voOutType: "boolean",
      rawSource: "public boolean validerSession(String token) { return isValid(token); }",
      methodParameters: [{ name: "token", type: "String" }],
    });

    const ir = makeIR({ useCases: [uc] });
    const result = generateSpringBootProject(ir);

    const serviceFile = result.files.find(f =>
      f.category === "service" && f.path.includes("Service.java")
    );
    expect(serviceFile).toBeDefined();
    expect(serviceFile!.content).toContain("validerSession");
    expect(serviceFile!.content).toContain("token");
  });

  it("ne devrait PAS filtrer getCartesActives() comme un simple getter", () => {
    const uc = makeUseCase({
      className: "GetCartesActives",
      voInType: "Void",
      voOutType: "List<String>",
      rawSource: "public List<String> getCartesActives(String numCompte) { return dao.findActives(numCompte); }",
      methodParameters: [{ name: "numCompte", type: "String" }],
    });

    const ir = makeIR({ useCases: [uc] });
    const result = generateSpringBootProject(ir);

    const serviceFile = result.files.find(f =>
      f.category === "service" && f.path.includes("Service.java")
    );
    expect(serviceFile).toBeDefined();
    expect(serviceFile!.content).toContain("getCartesActives");
  });
});

// ── FIX H: Quality scorer avec 8 checks ────────────────────────────

describe("FIX H — Quality scorer v7.3 avec 8 checks", () => {
  it("devrait avoir 8 checks", () => {
    const files: GeneratedFile[] = [
      {
        path: "src/main/java/com/test/service/TestService.java",
        content: `
          public class TestService {
            private static final String SQL_QUERY = "SELECT * FROM users";
            public String getData(String id) {
              return repository.findById(id);
            }
          }
        `,
        category: "service",
      },
    ];

    const report = scoreGeneration(files);
    expect(report.checks).toHaveLength(12); // v7.9: 8 original + 3 v7.8 + 1 v7.9 SAGA
    const checkIds = report.checks.map(c => c.id);
    expect(checkIds).toContain("SQL_CONSTANTS");
    expect(checkIds).toContain("NO_VOID_BUILDER");
    expect(checkIds).toContain("NO_OBJECT_RETURN");
    expect(checkIds).toContain("METHOD_PARAMS");
    expect(checkIds).toContain("MS_NAMES");
    expect(checkIds).toContain("ORACLE_KEYWORDS");
    expect(checkIds).toContain("URL_CONFLICTS");
    expect(checkIds).toContain("USECASES_DETECTED");
    // v7.8 new checks
    expect(checkIds).toContain("NO_VOID_VARIABLES");
    expect(checkIds).toContain("NO_DUPLICATE_SERVICES");
    expect(checkIds).toContain("NO_DTO_SERVICES");
  });

  it("devrait détecter Object comme violation dans NO_OBJECT_RETURN", () => {
    const files: GeneratedFile[] = [
      {
        path: "src/main/java/com/test/service/AuthService.java",
        content: `
          public class AuthService {
            public Object handlePostConnexion(String login) {
              return new AuthResponseDTO();
            }
          }
        `,
        category: "service",
      },
    ];

    const report = scoreGeneration(files);
    const check = getCheck(report, "NO_OBJECT_RETURN");
    expect(check.passed).toBe(false);
    expect(check.points).toBe(0);
  });

  it("devrait intégrer les résultats de tests de régression dans le rapport", () => {
    const files: GeneratedFile[] = [
      {
        path: "src/main/java/com/test/service/TestService.java",
        content: `
          public class TestService {
            public String getData() { return "ok"; }
          }
        `,
        category: "service",
      },
    ];

    const testResults: TestRegressionResult = {
      totalTests: 100,
      passedTests: 95,
      failedTests: 5,
      skippedTests: 0,
      failedNames: ["test1", "test2", "test3", "test4", "test5"],
    };

    const report = scoreGeneration(files, undefined, undefined, undefined, testResults);
    expect(report.testResults).toBeDefined();
    expect(report.testResults!.totalTests).toBe(100);
    expect(report.testResults!.passedTests).toBe(95);
    expect(report.summary).toContain("tests de régression");
    expect(report.summary).toContain("95");
  });

  it("devrait compter les UseCases détectés dans USECASES_DETECTED", () => {
    const files: GeneratedFile[] = [
      {
        path: "src/main/java/com/test/service/SessionService.java",
        content: `
          public class SessionService {
            public void creerSession(String login) { }
            public void fermerSession(String token) { }
          }
        `,
        category: "service",
      },
    ];

    // Legacy had 5 methods but only 2 were generated
    const report = scoreGeneration(files, undefined, undefined, 5);
    const check = getCheck(report, "USECASES_DETECTED");
    expect(check.passed).toBe(true); // count > 0
    // Points should be proportional: 2/5 * 10 = 4
    expect(check.points).toBe(4);
  });

  it("devrait donner un score parfait quand tout est correct", () => {
    const files: GeneratedFile[] = [
      {
        path: "src/main/java/com/test/service/CompteService.java",
        content: `
          public class CompteService {
            private static final String SQL_SOLDE = "SELECT solde FROM comptes WHERE num = ?";
            public SoldeDTO consulterSolde(String numCompte) {
              return repository.findSolde(numCompte);
            }
            public List<MouvementDTO> consulterMouvements(String numCompte, String dateDebut) {
              return repository.findMouvements(numCompte, dateDebut);
            }
          }
        `,
        category: "service",
      },
    ];

    const report = scoreGeneration(files, ["compte-service", "carte-service"], ["COMPTES", "MOUVEMENTS"], 2);
    expect(report.grade).toBe("A+");
    expect(report.totalScore).toBe(120); // v7.9: 100 + 3 v7.8 checks (5+5+5) + 1 v7.9 SAGA (5)
  });

  // Legacy backward compat: criteria should still be available
  it("devrait exposer les criteria legacy pour compatibilité", () => {
    const report = scoreGeneration([], [], []);
    expect(report.criteria).toBeDefined();
    expect(report.criteria.length).toBe(12); // v7.9: 8 original + 3 v7.8 + 1 v7.9 SAGA
    expect(report.criteria[0].id).toBe("A");
  });
});
