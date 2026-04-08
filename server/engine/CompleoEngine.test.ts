/**
 * Tests pour CompleoEngine — appel direct (sans HTTP).
 * Vérifie que le moteur retourne les mêmes résultats que les endpoints REST.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { CompleoEngine, getEngine, type SourceFile } from "./CompleoEngine";
import * as fs from "fs";
import * as path from "path";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadProjectFiles(projectDir: string): SourceFile[] {
  const files: SourceFile[] = [];
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.name.endsWith(".java") || entry.name.endsWith(".jsp") || entry.name.endsWith(".xml")) {
        files.push({
          path: path.relative(projectDir, fullPath),
          content: fs.readFileSync(fullPath, "utf-8"),
        });
      }
    }
  }
  walk(projectDir);
  return files;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("CompleoEngine — Direct API (sans HTTP)", () => {
  let engine: CompleoEngine;

  beforeAll(() => {
    engine = getEngine();
  });

  it("getEngine() retourne un singleton", () => {
    const e1 = getEngine();
    const e2 = getEngine();
    expect(e1).toBe(e2);
  });

  it("engine est une instance de CompleoEngine", () => {
    expect(engine).toBeInstanceOf(CompleoEngine);
  });

  // ─── analyze ────────────────────────────────────────────────────────────

  describe("analyze()", () => {
    it("analyse boa-acl-test correctement", async () => {
      const files = loadProjectFiles("/home/ubuntu/test-projects/boa-acl-test");
      const pomFile = files.find((f) => f.path === "pom.xml");
      const result = await engine.analyze(files, {
        pomXml: pomFile?.content,
        projectName: "boa-acl-test",
      });

      expect(result.ir).toBeDefined();
      expect(result.ir.stats.useCaseCount).toBe(8);
      expect(result.ambiguities).toBeDefined();
      expect(Array.isArray(result.ambiguities)).toBe(true);
      expect(result.summary.useCaseCount).toBe(8);
      expect(result.summary.dtoCount).toBeGreaterThan(0);
    });

    it("analyse activation-carte correctement (12 UseCases)", async () => {
      const files = loadProjectFiles("/home/ubuntu/test-projects/activation-carte-bmcedirect-ejb");
      const pomFile = files.find((f) => f.path === "pom.xml");
      const result = await engine.analyze(files, {
        pomXml: pomFile?.content,
        projectName: "activation-carte",
      });

      expect(result.ir.stats.useCaseCount).toBe(12);
      expect(result.summary.useCaseCount).toBe(12);
      expect(result.summary.dtoCount).toBeGreaterThanOrEqual(27);
    });

    it("analyse boa-ultimate-test correctement (12 UseCases)", async () => {
      const files = loadProjectFiles("/home/ubuntu/test-projects/boa-ultimate-test");
      const pomFile = files.find((f) => f.path === "pom.xml");
      const result = await engine.analyze(files, {
        pomXml: pomFile?.content,
        projectName: "boa-ultimate-test",
      });

      expect(result.ir.stats.useCaseCount).toBe(12);
    });

    it("analyse tech-01-servlet avec multi-tech", async () => {
      const files = loadProjectFiles("/home/ubuntu/test-projects/tech-01-servlet");
      const result = await engine.analyze(files, { projectName: "tech-01-servlet" });

      expect(result.multiTech.technologiesDetected).toContain("SERVLET");
      expect(result.multiTech.detectedComponents.length).toBeGreaterThan(0);
      expect(result.summary.componentCount).toBeGreaterThan(0);
      expect(result.summary.technologyCount).toBeGreaterThanOrEqual(1);
    });

    it("analyse tech-04-soap avec multi-tech", async () => {
      const files = loadProjectFiles("/home/ubuntu/test-projects/tech-04-soap");
      const result = await engine.analyze(files, { projectName: "tech-04-soap" });

      expect(result.multiTech.technologiesDetected).toContain("SOAP");
      expect(result.multiTech.detectedComponents.length).toBeGreaterThanOrEqual(1);
    });

    it("analyse tech-06-jms-batch avec multi-tech", async () => {
      const files = loadProjectFiles("/home/ubuntu/test-projects/tech-06-jms-batch");
      const result = await engine.analyze(files, { projectName: "tech-06-jms-batch" });

      expect(result.multiTech.technologiesDetected).toContain("JMS");
      expect(result.multiTech.technologiesDetected).toContain("BATCH");
    });
  });

  // ─── generate ───────────────────────────────────────────────────────────

  describe("generate()", () => {
    it("génère un projet Spring Boot depuis boa-acl-test", async () => {
      const files = loadProjectFiles("/home/ubuntu/test-projects/boa-acl-test");
      const pomFile = files.find((f) => f.path === "pom.xml");
      const analysis = await engine.analyze(files, {
        pomXml: pomFile?.content,
        projectName: "boa-acl-test",
      });

      const project = await engine.generate(analysis.ir);

      expect(project.files.length).toBeGreaterThan(0);
      expect(project.stats).toBeDefined();
      expect(project.migrationReport).toBeTruthy();
      expect(project.migrationReport.length).toBeGreaterThan(100);

      // Vérifier qu'on a des controllers, services, DTOs
      const controllers = project.files.filter((f) => f.path.includes("Controller"));
      const services = project.files.filter((f) => f.path.includes("Service"));
      expect(controllers.length).toBeGreaterThan(0);
      expect(services.length).toBeGreaterThan(0);
    });

    it("génère avec choix utilisateur", async () => {
      const files = loadProjectFiles("/home/ubuntu/test-projects/boa-ultimate-test");
      const pomFile = files.find((f) => f.path === "pom.xml");
      const analysis = await engine.analyze(files, {
        pomXml: pomFile?.content,
        projectName: "boa-ultimate-test",
      });

      // Si des ambiguïtés existent, résoudre avec les recommandations
      const choices = analysis.ambiguities.map((a) => ({
        ambiguityId: a.id,
        choiceId: a.recommendation,
      }));

      const project = await engine.generate(
        analysis.ir,
        { choices },
        analysis.ambiguities
      );

      expect(project.files.length).toBeGreaterThan(0);
    });
  });

  // ─── validate ───────────────────────────────────────────────────────────

  describe("validate()", () => {
    it("valide un projet généré sans erreurs", async () => {
      const files = loadProjectFiles("/home/ubuntu/test-projects/boa-acl-test");
      const pomFile = files.find((f) => f.path === "pom.xml");
      const analysis = await engine.analyze(files, {
        pomXml: pomFile?.content,
        projectName: "boa-acl-test",
      });
      const project = await engine.generate(analysis.ir);
      const validation = await engine.validate(project);

      expect(validation.score).toBeGreaterThanOrEqual(60);
      expect(validation.status).not.toBe("FAIL");
      expect(validation.ejb.syntaxErrors).toHaveLength(0);
      expect(validation.ejb.hasDuplicateImports).toBe(false);
    });

    it("valide activation-carte sans erreurs de syntaxe", async () => {
      const files = loadProjectFiles("/home/ubuntu/test-projects/activation-carte-bmcedirect-ejb");
      const pomFile = files.find((f) => f.path === "pom.xml");
      const analysis = await engine.analyze(files, {
        pomXml: pomFile?.content,
        projectName: "activation-carte",
      });
      const project = await engine.generate(analysis.ir);
      const validation = await engine.validate(project);

      expect(validation.ejb.syntaxErrors).toHaveLength(0);
      expect(validation.ejb.hasDuplicateImports).toBe(false);
    });
  });

  // ─── Pipeline complet ───────────────────────────────────────────────────

  describe("Pipeline complet analyze → generate → validate", () => {
    it("pipeline complet sur projet-02-virement", async () => {
      const files = loadProjectFiles("/home/ubuntu/test-projects/projet-02-virement");
      const pomFile = files.find((f) => f.path === "pom.xml");

      // 1. Analyze
      const analysis = await engine.analyze(files, {
        pomXml: pomFile?.content,
        projectName: "projet-02-virement",
      });
      expect(analysis.summary.useCaseCount).toBe(4);

      // 2. Generate (auto-resolve ambiguities)
      const choices = analysis.ambiguities.map((a) => ({
        ambiguityId: a.id,
        choiceId: a.recommendation,
      }));
      const project = await engine.generate(
        analysis.ir,
        { choices },
        analysis.ambiguities
      );
      expect(project.files.length).toBeGreaterThan(0);

      // 3. Validate
      const validation = await engine.validate(project);
      expect(validation.status).not.toBe("FAIL");
      expect(validation.ejb.syntaxErrors).toHaveLength(0);
    });

    it("pipeline complet sur tech-01-servlet (multi-tech)", async () => {
      const files = loadProjectFiles("/home/ubuntu/test-projects/tech-01-servlet");

      // 1. Analyze
      const analysis = await engine.analyze(files, { projectName: "tech-01-servlet" });
      expect(analysis.multiTech.technologiesDetected).toContain("SERVLET");

      // 2. Generate (EJB IR may be empty, but multi-tech should have files)
      const project = await engine.generate(
        analysis.ir,
        undefined,
        undefined,
        analysis.multiTech.generatedFiles
      );
      // Multi-tech files should be present
      expect(project.multiTechFiles.length).toBeGreaterThan(0);
    });
  });
});
