/**
 * Tests de régression v8.7 — Auto-Validation Pipeline.
 *
 * Couvre :
 *   - ProjectRegistry : CRUD, stats, persistance, historique
 *   - ProjectGenerator : templates, fichiers générés, assertions
 *   - ValidationRunner : assertions structurelles, score
 *   - RegressionDetector : diff, détection de régressions
 *   - init-registry : projets de référence
 *
 * @since v8.7
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// ─── ProjectRegistry ────────────────────────────────────────────────────────

import {
  ProjectRegistry,
  type TestProject,
  type ValidationResult,
} from "../../server/engine/validation/ProjectRegistry";

describe("v8.7 — ProjectRegistry", () => {
  let registry: ProjectRegistry;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "v87-registry-"));
    registry = new ProjectRegistry(path.join(tmpDir, "registry.json"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const makeProject = (id: string, type: "REFERENCE" | "GENERATED" = "REFERENCE"): TestProject => ({
    id,
    name: `Test Project ${id}`,
    type,
    sourcePath: `/test/${id}`,
    testedPatterns: ["EJB_STATELESS"],
    assertions: [{ type: "BUILD_SUCCESS", expected: 1, description: "Build OK" }],
    history: [],
  });

  it("register + get : enregistre et récupère un projet", () => {
    const project = makeProject("p1");
    registry.register(project);
    expect(registry.get("p1")).toBeDefined();
    expect(registry.get("p1")!.name).toBe("Test Project p1");
  });

  it("getAll : retourne tous les projets", () => {
    registry.register(makeProject("p1"));
    registry.register(makeProject("p2"));
    registry.register(makeProject("p3", "GENERATED"));
    expect(registry.getAll()).toHaveLength(3);
  });

  it("getByType : filtre par type REFERENCE vs GENERATED", () => {
    registry.register(makeProject("p1", "REFERENCE"));
    registry.register(makeProject("p2", "GENERATED"));
    registry.register(makeProject("p3", "GENERATED"));
    expect(registry.getByType("REFERENCE")).toHaveLength(1);
    expect(registry.getByType("GENERATED")).toHaveLength(2);
  });

  it("getByPattern : filtre par pattern testé", () => {
    const p1 = makeProject("p1");
    p1.testedPatterns = ["EJB_STATELESS", "JNDI_LOOKUP"];
    const p2 = makeProject("p2");
    p2.testedPatterns = ["SERVLET", "JSP"];
    registry.register(p1);
    registry.register(p2);
    expect(registry.getByPattern("jndi")).toHaveLength(1);
    expect(registry.getByPattern("SERVLET")).toHaveLength(1);
  });

  it("recordResult : enregistre un résultat et maintient l'historique (max 10)", () => {
    registry.register(makeProject("p1"));
    for (let i = 0; i < 12; i++) {
      const result: ValidationResult = {
        date: new Date().toISOString(),
        score: 50 + i,
        buildSuccess: true,
        buildErrors: 0,
        autoFixedErrors: 0,
        assertionsPassed: 1,
        assertionsTotal: 1,
        failedAssertions: [],
        regressions: [],
        filesGenerated: 10,
      };
      registry.recordResult("p1", result);
    }
    const p = registry.get("p1")!;
    expect(p.history).toHaveLength(10);
    expect(p.lastResult!.score).toBe(61); // Dernier score (50+11)
  });

  it("stats : calcule les statistiques correctement", () => {
    registry.register(makeProject("p1", "REFERENCE"));
    registry.register(makeProject("p2", "GENERATED"));
    registry.recordResult("p1", {
      date: new Date().toISOString(),
      score: 80,
      buildSuccess: true,
      buildErrors: 0,
      autoFixedErrors: 0,
      assertionsPassed: 1,
      assertionsTotal: 1,
      failedAssertions: [],
      regressions: [],
      filesGenerated: 10,
    });
    const stats = registry.stats();
    expect(stats.total).toBe(2);
    expect(stats.reference).toBe(1);
    expect(stats.generated).toBe(1);
    expect(stats.lastValidated).toBe(1);
    expect(stats.avgScore).toBe(80);
  });

  it("save + load : persiste et recharge le registre", () => {
    registry.register(makeProject("p1"));
    registry.recordResult("p1", {
      date: "2026-01-01T00:00:00Z",
      score: 90,
      buildSuccess: true,
      buildErrors: 0,
      autoFixedErrors: 0,
      assertionsPassed: 1,
      assertionsTotal: 1,
      failedAssertions: [],
      regressions: [],
      filesGenerated: 15,
    });
    registry.save();

    // Nouveau registre depuis le même fichier
    const registry2 = new ProjectRegistry(path.join(tmpDir, "registry.json"));
    registry2.load();
    expect(registry2.count()).toBe(1);
    expect(registry2.get("p1")!.lastResult!.score).toBe(90);
  });

  it("register merge : préserve l'historique lors de la ré-inscription", () => {
    registry.register(makeProject("p1"));
    registry.recordResult("p1", {
      date: "2026-01-01T00:00:00Z",
      score: 85,
      buildSuccess: true,
      buildErrors: 0,
      autoFixedErrors: 0,
      assertionsPassed: 1,
      assertionsTotal: 1,
      failedAssertions: [],
      regressions: [],
      filesGenerated: 10,
    });
    // Ré-enregistrer avec des assertions mises à jour
    const updated = makeProject("p1");
    updated.assertions.push({ type: "MIN_SERVICES", expected: 2, description: "Min 2 services" });
    registry.register(updated);

    const p = registry.get("p1")!;
    expect(p.assertions).toHaveLength(2); // Mis à jour
    expect(p.lastResult!.score).toBe(85); // Préservé
    expect(p.history).toHaveLength(1); // Préservé
  });
});

// ─── ProjectGenerator ───────────────────────────────────────────────────────

import {
  generateTestProjects,
  generateTemplateFiles,
  getTemplates,
} from "../../server/engine/validation/ProjectGenerator";

describe("v8.7 — ProjectGenerator", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "v87-generator-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("getTemplates : retourne 5 templates", () => {
    const templates = getTemplates();
    expect(templates).toHaveLength(5);
    expect(templates.map((t) => t.id)).toContain("gen-ejb-stateless-dao");
    expect(templates.map((t) => t.id)).toContain("gen-handler-strategy");
  });

  it("generateTemplateFiles : chaque template génère des fichiers Java valides", () => {
    const templates = getTemplates();
    for (const template of templates) {
      const files = generateTemplateFiles(template.id);
      expect(files).not.toBeNull();
      expect(files!.length).toBeGreaterThan(0);
      // Au moins un fichier Java
      const javaFiles = files!.filter((f) => f.path.endsWith(".java"));
      expect(javaFiles.length).toBeGreaterThan(0);
      // Chaque fichier Java a du contenu
      for (const f of javaFiles) {
        expect(f.content.length).toBeGreaterThan(50);
        expect(f.content).toContain("package ");
      }
    }
  });

  it("generateTemplateFiles : template inconnu retourne null", () => {
    expect(generateTemplateFiles("unknown-template")).toBeNull();
  });

  it("generateTestProjects : génère les fichiers sur disque", () => {
    const { projects, filesWritten } = generateTestProjects(tmpDir);
    expect(projects).toHaveLength(5);
    expect(filesWritten).toBeGreaterThan(15);
    // Vérifier qu'un fichier existe sur disque
    const firstProject = projects[0];
    expect(fs.existsSync(firstProject.sourcePath)).toBe(true);
    // Tous les projets sont de type GENERATED
    for (const p of projects) {
      expect(p.type).toBe("GENERATED");
    }
  });

  it("template EJB Stateless contient InitialContext (legacy à migrer)", () => {
    const files = generateTemplateFiles("gen-ejb-stateless-dao")!;
    const ejbFile = files.find((f) => f.path.includes("CompteServiceBean"));
    expect(ejbFile).toBeDefined();
    expect(ejbFile!.content).toContain("InitialContext");
    expect(ejbFile!.content).toContain("@Stateless");
  });

  it("template Handler/Strategy contient la Factory et l'interface", () => {
    const files = generateTemplateFiles("gen-handler-strategy")!;
    const factory = files.find((f) => f.path.includes("ActionHandlerFactory"));
    const iface = files.find((f) => f.path.includes("ActionHandler.java"));
    expect(factory).toBeDefined();
    expect(iface).toBeDefined();
    expect(factory!.content).toContain("getHandler");
    expect(iface!.content).toContain("interface ActionHandler");
  });
});

// ─── init-registry ──────────────────────────────────────────────────────────

import {
  initializeRegistry,
  getReferenceProjects,
} from "../../server/engine/validation/init-registry";

describe("v8.7 — init-registry", () => {
  it("getReferenceProjects : retourne les projets de référence", () => {
    const projects = getReferenceProjects();
    expect(projects.length).toBeGreaterThanOrEqual(5);
    expect(projects.every((p) => p.type === "REFERENCE")).toBe(true);
    // Vérifier que boa-realistic est présent
    const boa = projects.find((p) => p.id === "boa-realistic");
    expect(boa).toBeDefined();
    expect(boa!.testedPatterns).toContain("EJB_STATELESS");
  });

  it("initializeRegistry : crée un registre avec les projets de référence", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "v87-init-"));
    try {
      const registry = initializeRegistry(path.join(tmpDir, "reg.json"));
      expect(registry.count()).toBeGreaterThanOrEqual(5);
      expect(registry.getByType("REFERENCE").length).toBeGreaterThanOrEqual(5);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ─── ValidationRunner (assertions) ──────────────────────────────────────────

import {
  checkAssertion,
  calculateScore,
} from "../../server/engine/validation/ValidationRunner";

describe("v8.7 — ValidationRunner assertions", () => {
  const serviceFile = {
    path: "src/main/java/com/example/CompteService.java",
    content: `package com.example;\nimport org.springframework.stereotype.Service;\n@Service\npublic class CompteService {}`,
  };
  const controllerFile = {
    path: "src/main/java/com/example/CompteController.java",
    content: `package com.example;\nimport org.springframework.web.bind.annotation.RestController;\n@RestController\npublic class CompteController {}`,
  };
  const dtoFile = {
    path: "src/main/java/com/example/CompteDTO.java",
    content: `package com.example;\npublic class CompteDTO { private String numero; }`,
  };

  it("MIN_SERVICES : passe quand assez de services", () => {
    const result = checkAssertion(
      { type: "MIN_SERVICES", expected: 1, description: "Min 1 service" },
      [serviceFile, controllerFile, dtoFile]
    );
    expect(result.passed).toBe(true);
    expect(result.actual).toBe(1);
  });

  it("MIN_SERVICES : échoue quand pas assez de services", () => {
    const result = checkAssertion(
      { type: "MIN_SERVICES", expected: 3, description: "Min 3 services" },
      [serviceFile]
    );
    expect(result.passed).toBe(false);
  });

  it("MIN_CONTROLLERS : passe avec un controller", () => {
    const result = checkAssertion(
      { type: "MIN_CONTROLLERS", expected: 1, description: "Min 1 controller" },
      [controllerFile]
    );
    expect(result.passed).toBe(true);
  });

  it("PATTERN_ABSENT : passe quand le pattern est absent", () => {
    const result = checkAssertion(
      { type: "PATTERN_ABSENT", expected: "InitialContext", description: "Pas de JNDI" },
      [serviceFile, controllerFile]
    );
    expect(result.passed).toBe(true);
  });

  it("PATTERN_ABSENT : échoue quand le pattern est présent", () => {
    const fileWithJndi = {
      path: "src/main/java/com/example/Legacy.java",
      content: `package com.example;\nimport javax.naming.InitialContext;\npublic class Legacy {}`,
    };
    const result = checkAssertion(
      { type: "PATTERN_ABSENT", expected: "InitialContext", description: "Pas de JNDI" },
      [fileWithJndi]
    );
    expect(result.passed).toBe(false);
  });

  it("PATTERN_PRESENT : passe quand le pattern est présent", () => {
    const fileWithJms = {
      path: "src/main/java/com/example/Listener.java",
      content: `package com.example;\n@JmsListener(destination = "queue")\npublic class Listener {}`,
    };
    const result = checkAssertion(
      { type: "PATTERN_PRESENT", expected: "@JmsListener", description: "JmsListener présent" },
      [fileWithJms]
    );
    expect(result.passed).toBe(true);
  });

  it("calculateScore : score parfait = 100", () => {
    const score = calculateScore(true, true, true, 5, 5, 0);
    expect(score).toBe(100);
  });

  it("calculateScore : score sans build = 60 max", () => {
    const score = calculateScore(true, true, false, 5, 5, 0);
    expect(score).toBe(70); // 20 + 20 + 0 + 20 + 10
  });

  it("calculateScore : régressions réduisent le score", () => {
    const scoreWithReg = calculateScore(true, true, true, 5, 5, 3);
    const scoreWithout = calculateScore(true, true, true, 5, 5, 0);
    expect(scoreWithReg).toBeLessThan(scoreWithout);
  });
});

// ─── RegressionDetector ─────────────────────────────────────────────────────

import {
  detectRegressionDetails,
  diffSummary,
} from "../../server/engine/validation/RegressionDetector";

describe("v8.7 — RegressionDetector", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "v87-regression-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeSnapshot(files: Record<string, string>): string {
    const snapshotPath = path.join(tmpDir, "snapshot.json");
    fs.writeFileSync(snapshotPath, JSON.stringify(files), "utf-8");
    return snapshotPath;
  }

  it("détecte un fichier supprimé", () => {
    const snapshotPath = writeSnapshot({
      "src/CompteService.java": "@Service\npublic class CompteService {}",
    });
    const current = new Map<string, string>();
    const regressions = detectRegressionDetails(current, snapshotPath);
    expect(regressions).toHaveLength(1);
    expect(regressions[0].type).toBe("FILE_REMOVED");
    expect(regressions[0].severity).toBe("CRITICAL"); // Service file
  });

  it("détecte un @Service perdu", () => {
    const snapshotPath = writeSnapshot({
      "src/CompteService.java": "@Service\npublic class CompteService { public void find() {} }",
    });
    const current = new Map([
      ["src/CompteService.java", "public class CompteService { public void find() {} }"],
    ]);
    const regressions = detectRegressionDetails(current, snapshotPath);
    const serviceLost = regressions.find((r) => r.type === "SERVICE_LOST");
    expect(serviceLost).toBeDefined();
    expect(serviceLost!.severity).toBe("CRITICAL");
  });

  it("détecte un import legacy réapparu", () => {
    const snapshotPath = writeSnapshot({
      "src/CompteService.java": "@Service\npublic class CompteService {}",
    });
    const current = new Map([
      ["src/CompteService.java", "@Service\nimport javax.naming.InitialContext;\npublic class CompteService {}"],
    ]);
    const regressions = detectRegressionDetails(current, snapshotPath);
    const importReg = regressions.find((r) => r.type === "IMPORT_REGRESSION");
    expect(importReg).toBeDefined();
    expect(importReg!.description).toContain("InitialContext");
  });

  it("détecte une méthode publique perdue dans un service", () => {
    const snapshotPath = writeSnapshot({
      "src/CompteService.java": "@Service\npublic class CompteService {\n  public void findAll() {}\n  public void save() {}\n}",
    });
    const current = new Map([
      ["src/CompteService.java", "@Service\npublic class CompteService {\n  public void findAll() {}\n}"],
    ]);
    const regressions = detectRegressionDetails(current, snapshotPath);
    const methodLost = regressions.find((r) => r.type === "METHOD_LOST");
    expect(methodLost).toBeDefined();
    expect(methodLost!.description).toContain("save");
  });

  it("aucune régression quand les fichiers sont identiques", () => {
    const snapshotPath = writeSnapshot({
      "src/CompteService.java": "@Service\npublic class CompteService {}",
    });
    const current = new Map([
      ["src/CompteService.java", "@Service\npublic class CompteService {}"],
    ]);
    const regressions = detectRegressionDetails(current, snapshotPath);
    expect(regressions).toHaveLength(0);
  });

  it("diffSummary : identifie added, removed, modified, unchanged", () => {
    const oldFiles = new Map([
      ["a.java", "old content"],
      ["b.java", "same"],
      ["c.java", "will be removed"],
    ]);
    const newFiles = new Map([
      ["a.java", "new content"],
      ["b.java", "same"],
      ["d.java", "new file"],
    ]);
    const diff = diffSummary(oldFiles, newFiles);
    expect(diff.added).toContain("d.java");
    expect(diff.removed).toContain("c.java");
    expect(diff.modified).toContain("a.java");
    expect(diff.unchanged).toContain("b.java");
  });
});
