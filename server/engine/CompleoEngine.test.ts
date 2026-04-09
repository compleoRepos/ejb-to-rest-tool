/**
 * Tests pour CompleoEngine — appel direct (sans HTTP).
 * Vérifie que le moteur retourne les mêmes résultats que les endpoints REST.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { CompleoEngine, getEngine, type SourceFile } from "./CompleoEngine";
import * as fs from "fs";
import * as path from "path";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PROJECT_ROOT = path.resolve(__dirname, "..", "..");

function loadProjectFiles(projectDir: string): SourceFile[] {
  // Support both absolute and relative paths
  const resolvedDir = path.isAbsolute(projectDir) ? projectDir : path.resolve(PROJECT_ROOT, projectDir);
  if (!fs.existsSync(resolvedDir)) {
    throw new Error(`Test project not found: ${resolvedDir}`);
  }
  const files: SourceFile[] = [];
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.name.endsWith(".java") || entry.name.endsWith(".jsp") || entry.name.endsWith(".xml")) {
        files.push({
          path: path.relative(resolvedDir, fullPath),
          content: fs.readFileSync(fullPath, "utf-8"),
        });
      }
    }
  }
  walk(resolvedDir);
  return files;
}

// ─── Path constants ──────────────────────────────────────────────────────────

const ACTIVATION_CARTE = "test-projects/boa-realistic-ejb-project/activation-carte-bmcedirect-ejb";
const PROJET1_EJB = "test-projects/projet1-ejb-bancaire";
const PROJET2_SERVLET = "test-projects/projet2-servlet-jsp";
const PROJET3_STRUTS = "test-projects/projet3-struts";
const PROJET4_SOAP = "test-projects/projet4-soap-webservice";
const PROJET5_JDBC = "test-projects/projet5-jdbc";
const PROJET7_JMS = "test-projects/projet7-jms";
const PROJET8_BATCH = "test-projects/projet8-batch-bancaire";
const SIM_02_VIREMENT = "test-projects/simulateurs/sim-02-virement";

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
    it("analyse projet1-ejb-bancaire correctement", async () => {
      const files = loadProjectFiles(PROJET1_EJB);
      const pomFile = files.find((f) => f.path === "pom.xml");
      const result = await engine.analyze(files, {
        pomXml: pomFile?.content,
        projectName: "projet1-ejb-bancaire",
      });

      expect(result.ir).toBeDefined();
      expect(result.ir.stats.useCaseCount).toBeGreaterThan(0);
      expect(result.ambiguities).toBeDefined();
      expect(Array.isArray(result.ambiguities)).toBe(true);
      expect(result.summary.useCaseCount).toBeGreaterThan(0);
      expect(result.summary.dtoCount).toBeGreaterThanOrEqual(0);
    });

    it("analyse activation-carte correctement (12 UseCases)", async () => {
      const files = loadProjectFiles(ACTIVATION_CARTE);
      const pomFile = files.find((f) => f.path === "pom.xml");
      const result = await engine.analyze(files, {
        pomXml: pomFile?.content,
        projectName: "activation-carte",
      });

      expect(result.ir.stats.useCaseCount).toBe(12);
      expect(result.summary.useCaseCount).toBe(12);
      expect(result.summary.dtoCount).toBeGreaterThanOrEqual(27);
    });

    it("analyse projet2-servlet avec multi-tech", async () => {
      const files = loadProjectFiles(PROJET2_SERVLET);
      const result = await engine.analyze(files, { projectName: "projet2-servlet" });

      expect(result.multiTech.technologiesDetected).toContain("SERVLET");
      expect(result.multiTech.detectedComponents.length).toBeGreaterThan(0);
      expect(result.summary.componentCount).toBeGreaterThan(0);
      expect(result.summary.technologyCount).toBeGreaterThanOrEqual(1);
    });

    it("analyse projet4-soap avec multi-tech", async () => {
      const files = loadProjectFiles(PROJET4_SOAP);
      const result = await engine.analyze(files, { projectName: "projet4-soap" });

      expect(result.multiTech.technologiesDetected).toContain("SOAP");
      expect(result.multiTech.detectedComponents.length).toBeGreaterThanOrEqual(1);
    });

    it("analyse projet7-jms avec multi-tech", async () => {
      const jmsFiles = loadProjectFiles(PROJET7_JMS);
      const jmsResult = await engine.analyze(jmsFiles, { projectName: "projet7-jms" });
      expect(jmsResult.multiTech.technologiesDetected).toContain("JMS");
    });

    it("analyse projet8-batch avec multi-tech", async () => {
      const batchFiles = loadProjectFiles(PROJET8_BATCH);
      const batchResult = await engine.analyze(batchFiles, { projectName: "projet8-batch" });
      // projet8-batch may detect as EJB_3X or BATCH depending on content
      expect(batchResult.multiTech.technologiesDetected.length).toBeGreaterThan(0);
    });
  });

  // ─── generate ───────────────────────────────────────────────────────────

  describe("generate()", () => {
    it("génère un projet Spring Boot depuis projet1-ejb-bancaire", async () => {
      const files = loadProjectFiles(PROJET1_EJB);
      const pomFile = files.find((f) => f.path === "pom.xml");
      const analysis = await engine.analyze(files, {
        pomXml: pomFile?.content,
        projectName: "projet1-ejb-bancaire",
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
      const files = loadProjectFiles(ACTIVATION_CARTE);
      const pomFile = files.find((f) => f.path === "pom.xml");
      const analysis = await engine.analyze(files, {
        pomXml: pomFile?.content,
        projectName: "activation-carte",
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
      const files = loadProjectFiles(PROJET1_EJB);
      const pomFile = files.find((f) => f.path === "pom.xml");
      const analysis = await engine.analyze(files, {
        pomXml: pomFile?.content,
        projectName: "projet1-ejb-bancaire",
      });
      const project = await engine.generate(analysis.ir);
      const validation = await engine.validate(project);

      expect(validation.score).toBeGreaterThanOrEqual(60);
      expect(validation.status).not.toBe("FAIL");
      expect(validation.ejb.syntaxErrors).toHaveLength(0);
      expect(validation.ejb.hasDuplicateImports).toBe(false);
    });

    it("valide activation-carte sans erreurs de syntaxe", async () => {
      const files = loadProjectFiles(ACTIVATION_CARTE);
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
    it("pipeline complet sur sim-02-virement", async () => {
      const files = loadProjectFiles(SIM_02_VIREMENT);
      const pomFile = files.find((f) => f.path === "pom.xml");

      // 1. Analyze
      const analysis = await engine.analyze(files, {
        pomXml: pomFile?.content,
        projectName: "sim-02-virement",
      });
      expect(analysis.summary.useCaseCount).toBeGreaterThan(0);

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

    it("pipeline complet sur projet2-servlet (multi-tech)", async () => {
      const files = loadProjectFiles(PROJET2_SERVLET);

      // 1. Analyze
      const analysis = await engine.analyze(files, { projectName: "projet2-servlet" });
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
