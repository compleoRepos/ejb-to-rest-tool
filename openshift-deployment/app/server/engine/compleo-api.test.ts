/**
 * Tests API exhaustifs — Compleo endpoints
 * Teste le pipeline complet via l'engine directement :
 * upload → analyze → generate → download → preview → session
 * Couvre les 6 simulateurs bancaires.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { CompleoEngine, getEngine, type SourceFile } from "./CompleoEngine";
import * as fs from "fs";
import * as path from "path";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SIMULATEURS_BASE = path.resolve(__dirname, "../../test-projects/simulateurs");

function loadProjectFiles(projectDir: string): SourceFile[] {
  const files: SourceFile[] = [];
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (
        entry.name.endsWith(".java") ||
        entry.name.endsWith(".xml") ||
        entry.name.endsWith(".jsp")
      ) {
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

describe("Tests API exhaustifs — Compleo endpoints", () => {
  let engine: CompleoEngine;

  beforeAll(() => {
    engine = getEngine();
  });

  // ═══════════════════════════════════════════════════════════
  // 1. Upload & Parse
  // ═══════════════════════════════════════════════════════════
  describe("Upload & Parse", () => {
    it("parse sim-01 retourne un IR valide avec stats", async () => {
      const files = loadProjectFiles(
        path.join(SIMULATEURS_BASE, "sim-01-core-banking")
      );
      const pomFile = files.find((f) => f.path === "pom.xml");

      const result = await engine.analyze(files, {
        pomXml: pomFile?.content,
        projectName: "sim-01-core-banking",
      });

      expect(result.ir).toBeDefined();
      expect(result.ir.stats).toBeDefined();
      expect(result.ir.stats.useCaseCount).toBeGreaterThanOrEqual(5);
      expect(result.ir.stats.dtoCount).toBeGreaterThanOrEqual(10);
    });

    it("parse sim-02 retourne des UseCases de virement", async () => {
      const files = loadProjectFiles(
        path.join(SIMULATEURS_BASE, "sim-02-virement")
      );
      const pomFile = files.find((f) => f.path === "pom.xml");

      const result = await engine.analyze(files, {
        pomXml: pomFile?.content,
        projectName: "sim-02-virement",
      });

      expect(result.ir.stats.useCaseCount).toBeGreaterThanOrEqual(3);
    });

    it("parse sim-03 retourne des UseCases KYC", async () => {
      const files = loadProjectFiles(
        path.join(SIMULATEURS_BASE, "sim-03-kyc")
      );
      const pomFile = files.find((f) => f.path === "pom.xml");

      const result = await engine.analyze(files, {
        pomXml: pomFile?.content,
        projectName: "sim-03-kyc",
      });

      expect(result.ir.stats.useCaseCount).toBeGreaterThanOrEqual(3);
    });

    it("parse sim-04 retourne des UseCases crédit", async () => {
      const files = loadProjectFiles(
        path.join(SIMULATEURS_BASE, "sim-04-credit")
      );
      const pomFile = files.find((f) => f.path === "pom.xml");

      const result = await engine.analyze(files, {
        pomXml: pomFile?.content,
        projectName: "sim-04-credit",
      });

      expect(result.ir.stats.useCaseCount).toBeGreaterThanOrEqual(3);
    });

    it("parse sim-05 (EJB 2.x) retourne un IR sans crash", async () => {
      const files = loadProjectFiles(
        path.join(SIMULATEURS_BASE, "sim-05-monetique")
      );
      const pomFile = files.find((f) => f.path === "pom.xml");

      const result = await engine.analyze(files, {
        pomXml: pomFile?.content,
        projectName: "sim-05-monetique",
      });

      expect(result.ir).toBeDefined();
      expect(result.ir.stats).toBeDefined();
    });

    it("parse sim-06 (batch JSR-352) retourne un IR sans crash", async () => {
      const files = loadProjectFiles(
        path.join(SIMULATEURS_BASE, "sim-06-batch")
      );
      const pomFile = files.find((f) => f.path === "pom.xml");

      const result = await engine.analyze(files, {
        pomXml: pomFile?.content,
        projectName: "sim-06-batch",
      });

      expect(result.ir).toBeDefined();
      expect(result.ir.stats).toBeDefined();
    });

    it("parse fichiers vides retourne un IR vide sans crash", async () => {
      const result = await engine.analyze([], {
        projectName: "empty-project",
      });

      expect(result.ir).toBeDefined();
      expect(result.ir.stats.useCaseCount).toBe(0);
    });

    it("parse fichier non-Java retourne un IR vide", async () => {
      const files: SourceFile[] = [
        { path: "README.md", content: "# Hello World" },
        { path: "package.json", content: '{"name": "test"}' },
      ];

      const result = await engine.analyze(files, {
        projectName: "non-java-project",
      });

      expect(result.ir).toBeDefined();
      expect(result.ir.stats.useCaseCount).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 2. Analyze — Ambiguity Detection
  // ═══════════════════════════════════════════════════════════
  describe("Analyze — Ambiguity Detection", () => {
    it("sim-01 retourne des ambiguïtés (ou tableau vide)", async () => {
      const files = loadProjectFiles(
        path.join(SIMULATEURS_BASE, "sim-01-core-banking")
      );
      const pomFile = files.find((f) => f.path === "pom.xml");

      const result = await engine.analyze(files, {
        pomXml: pomFile?.content,
        projectName: "sim-01-core-banking",
      });

      expect(result.ambiguities).toBeDefined();
      expect(Array.isArray(result.ambiguities)).toBe(true);
    });

    it("ambiguïtés ont la structure attendue (id, type, options)", async () => {
      const files = loadProjectFiles(
        path.join(SIMULATEURS_BASE, "sim-01-core-banking")
      );
      const pomFile = files.find((f) => f.path === "pom.xml");

      const result = await engine.analyze(files, {
        pomXml: pomFile?.content,
        projectName: "sim-01-core-banking",
      });

      if (result.ambiguities.length > 0) {
        const amb = result.ambiguities[0];
        expect(amb.id).toBeDefined();
        expect(amb.type).toBeDefined();
        expect(amb.options).toBeDefined();
      }
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 3. Generate — Code Generation
  // ═══════════════════════════════════════════════════════════
  describe("Generate — Code Generation", () => {
    it("sim-01 génère Controller, DTO, Service, pom.xml", async () => {
      const files = loadProjectFiles(
        path.join(SIMULATEURS_BASE, "sim-01-core-banking")
      );
      const pomFile = files.find((f) => f.path === "pom.xml");

      const result = await engine.analyze(files, {
        pomXml: pomFile?.content,
        projectName: "sim-01-core-banking",
      });

      const generated = await engine.generate(result.ir, {
        choices: {},
        projectName: "sim-01-core-banking",
      });

      const controllers = generated.files.filter((f: any) =>
        f.path.includes("Controller")
      );
      const dtos = generated.files.filter(
        (f: any) =>
          f.path.includes("Request") || f.path.includes("Response")
      );
      const services = generated.files.filter((f: any) =>
        f.path.includes("Service")
      );
      const pom = generated.files.find((f: any) =>
        f.path.includes("pom.xml")
      );

      expect(controllers.length).toBeGreaterThanOrEqual(1);
      expect(dtos.length).toBeGreaterThan(0);
      expect(services.length).toBeGreaterThanOrEqual(1);
      expect(pom).toBeDefined();
    });

    it("sim-02 génère du code avec annotations Spring Boot", async () => {
      const files = loadProjectFiles(
        path.join(SIMULATEURS_BASE, "sim-02-virement")
      );
      const pomFile = files.find((f) => f.path === "pom.xml");

      const result = await engine.analyze(files, {
        pomXml: pomFile?.content,
        projectName: "sim-02-virement",
      });

      const generated = await engine.generate(result.ir, {
        choices: {},
        projectName: "sim-02-virement",
      });

      const allContent = generated.files
        .map((f: any) => f.content)
        .join("\n");
      expect(allContent).toContain("@RestController");
      expect(allContent).toContain("@Service");
    });

    it("sim-04 génère du code pour le crédit immobilier", async () => {
      const files = loadProjectFiles(
        path.join(SIMULATEURS_BASE, "sim-04-credit")
      );
      const pomFile = files.find((f) => f.path === "pom.xml");

      const result = await engine.analyze(files, {
        pomXml: pomFile?.content,
        projectName: "sim-04-credit",
      });

      const generated = await engine.generate(result.ir, {
        choices: {},
        projectName: "sim-04-credit",
      });

      expect(generated.files.length).toBeGreaterThan(0);
      // Should have Dockerfile and docker-compose
      const docker = generated.files.filter(
        (f: any) =>
          f.path.includes("Dockerfile") ||
          f.path.includes("docker-compose")
      );
      expect(docker.length).toBeGreaterThanOrEqual(1);
    });

    it("code généré contient @Transactional sur les services", async () => {
      const files = loadProjectFiles(
        path.join(SIMULATEURS_BASE, "sim-01-core-banking")
      );
      const pomFile = files.find((f) => f.path === "pom.xml");

      const result = await engine.analyze(files, {
        pomXml: pomFile?.content,
        projectName: "sim-01-core-banking",
      });

      const generated = await engine.generate(result.ir, {
        choices: {},
        projectName: "sim-01-core-banking",
      });

      const serviceFiles = generated.files.filter(
        (f: any) =>
          f.path.includes("Service") && f.path.endsWith(".java")
      );

      if (serviceFiles.length > 0) {
        const hasTransactional = serviceFiles.some((f: any) =>
          f.content.includes("@Transactional")
        );
        expect(hasTransactional).toBe(true);
      }
    });

    it("code généré contient @Valid sur les RequestBody", async () => {
      const files = loadProjectFiles(
        path.join(SIMULATEURS_BASE, "sim-01-core-banking")
      );
      const pomFile = files.find((f) => f.path === "pom.xml");

      const result = await engine.analyze(files, {
        pomXml: pomFile?.content,
        projectName: "sim-01-core-banking",
      });

      const generated = await engine.generate(result.ir, {
        choices: {},
        projectName: "sim-01-core-banking",
      });

      const controllerFiles = generated.files.filter(
        (f: any) =>
          f.path.includes("Controller") && f.path.endsWith(".java")
      );

      if (controllerFiles.length > 0) {
        const hasValid = controllerFiles.some((f: any) =>
          f.content.includes("@Valid")
        );
        expect(hasValid).toBe(true);
      }
    });

    it("MIGRATION_REPORT.md est généré pour sim-01", async () => {
      const files = loadProjectFiles(
        path.join(SIMULATEURS_BASE, "sim-01-core-banking")
      );
      const pomFile = files.find((f) => f.path === "pom.xml");

      const result = await engine.analyze(files, {
        pomXml: pomFile?.content,
        projectName: "sim-01-core-banking",
      });

      const generated = await engine.generate(result.ir, {
        choices: {},
        projectName: "sim-01-core-banking",
      });

      const report = generated.files.find(
        (f: any) =>
          f.path.includes("MIGRATION_REPORT") ||
          f.path.includes("migration-report")
      );
      expect(report).toBeDefined();
      expect(report!.content.length).toBeGreaterThan(100);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 4. Session Management
  // ═══════════════════════════════════════════════════════════
  describe("Session Management", () => {
    it("analyse retourne un summary cohérent avec l'IR", async () => {
      const files = loadProjectFiles(
        path.join(SIMULATEURS_BASE, "sim-01-core-banking")
      );
      const pomFile = files.find((f) => f.path === "pom.xml");

      const result = await engine.analyze(files, {
        pomXml: pomFile?.content,
        projectName: "sim-01-core-banking",
      });

      expect(result.summary.useCaseCount).toBe(
        result.ir.stats.useCaseCount
      );
      expect(result.summary.dtoCount).toBe(result.ir.stats.dtoCount);
    });

    it("deux analyses du même projet retournent les mêmes résultats (déterminisme)", async () => {
      const files = loadProjectFiles(
        path.join(SIMULATEURS_BASE, "sim-03-kyc")
      );
      const pomFile = files.find((f) => f.path === "pom.xml");

      const result1 = await engine.analyze(files, {
        pomXml: pomFile?.content,
        projectName: "sim-03-kyc",
      });

      const result2 = await engine.analyze(files, {
        pomXml: pomFile?.content,
        projectName: "sim-03-kyc",
      });

      expect(result1.ir.stats.useCaseCount).toBe(
        result2.ir.stats.useCaseCount
      );
      expect(result1.ir.stats.dtoCount).toBe(result2.ir.stats.dtoCount);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 5. Edge Cases
  // ═══════════════════════════════════════════════════════════
  describe("Edge Cases", () => {
    it("analyse avec pom.xml invalide ne crash pas", async () => {
      const files = loadProjectFiles(
        path.join(SIMULATEURS_BASE, "sim-01-core-banking")
      );

      const result = await engine.analyze(files, {
        pomXml: "<invalid>xml</invalid>",
        projectName: "invalid-pom",
      });

      expect(result.ir).toBeDefined();
    });

    it("analyse avec fichier Java malformé ne crash pas", async () => {
      const files: SourceFile[] = [
        {
          path: "src/main/java/Broken.java",
          content:
            "package com.test;\npublic class Broken {\n  // Missing closing brace",
        },
      ];

      const result = await engine.analyze(files, {
        projectName: "broken-java",
      });

      expect(result.ir).toBeDefined();
    });

    it("génération avec IR vide ne crash pas", async () => {
      const emptyResult = await engine.analyze([], {
        projectName: "empty",
      });

      const generated = await engine.generate(emptyResult.ir, {
        choices: {},
        projectName: "empty",
      });

      expect(generated.files).toBeDefined();
    });
  });
});
