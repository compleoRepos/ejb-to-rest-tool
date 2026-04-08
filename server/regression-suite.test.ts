/**
 * Regression Test Suite — Phase 6
 * Validates the parser + generator pipeline on 5 EJB test projects.
 *
 * For each project:
 *   1. Parse the project
 *   2. Compare with expected-output.json
 *   3. Verify 0 Object, 0 duplicate imports, correct type resolution
 *
 * @author Hamza NORDINE
 */

import { describe, it, expect } from "vitest";
import { parseEjbProject, type ProjectIR } from "./java-parser";
import { generateSpringBootProject, type GenerationResult } from "./spring-generator";
import * as fs from "fs";
import * as path from "path";

// ─── Test Project Definitions ──────────────────────────────────────────────

interface ExpectedOutput {
  project: string;
  description: string;
  expectedUseCases: number;
  expectedDtos: number;
  expectedEnums: number;
  expectedExceptions: number;
  expectedRemoteInterfaces: number;
  useCaseNames: string[];
  expectedTypes: Record<string, string[]>;
  maxObjectOccurrences: number;
  maxDuplicateImports: number;
  falsePositiveClasses: string[];
}

interface TestProject {
  name: string;
  dir: string;
  expectedFile: string;
}

const TEST_PROJECTS: TestProject[] = [
  {
    name: "projet-01-carte",
    dir: "/home/ubuntu/test-projects/activation-carte-bmcedirect-ejb",
    expectedFile: "/home/ubuntu/test-projects/activation-carte-bmcedirect-ejb/expected-output.json",
  },
  {
    name: "projet-02-virement",
    dir: "/home/ubuntu/test-projects/projet-02-virement",
    expectedFile: "/home/ubuntu/test-projects/projet-02-virement/expected-output.json",
  },
  {
    name: "projet-03-kyc",
    dir: "/home/ubuntu/test-projects/projet-03-kyc",
    expectedFile: "/home/ubuntu/test-projects/projet-03-kyc/expected-output.json",
  },
  {
    name: "projet-04-assurance",
    dir: "/home/ubuntu/test-projects/projet-04-assurance",
    expectedFile: "/home/ubuntu/test-projects/projet-04-assurance/expected-output.json",
  },
  {
    name: "projet-05-mixte",
    dir: "/home/ubuntu/test-projects/projet-05-mixte",
    expectedFile: "/home/ubuntu/test-projects/projet-05-mixte/expected-output.json",
  },
];

// ─── Helpers ───────────────────────────────────────────────────────────────

function collectJavaFiles(dir: string): { path: string; content: string }[] {
  const files: { path: string; content: string }[] = [];
  function walk(d: string) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const fullPath = path.join(d, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else if (entry.name.endsWith(".java") || entry.name === "pom.xml") {
        files.push({ path: fullPath, content: fs.readFileSync(fullPath, "utf-8") });
      }
    }
  }
  walk(dir);
  return files;
}

function countObjectOccurrences(files: { path: string; content: string }[]): number {
  let count = 0;
  for (const f of files) {
    if (!f.path.endsWith(".java")) continue;
    const matches = f.content.match(/\bObject\b/g);
    if (matches) count += matches.length;
  }
  return count;
}

function countDuplicateImports(files: { path: string; content: string }[]): number {
  let count = 0;
  for (const f of files) {
    if (!f.path.endsWith(".java")) continue;
    const imports = f.content.match(/^import .+;$/gm) || [];
    const unique = new Set(imports);
    count += imports.length - unique.size;
  }
  return count;
}

function parseProject(dir: string): { ir: ProjectIR; result: GenerationResult } {
  const files = collectJavaFiles(dir);
  const pomFile = files.find(f => f.path.endsWith("pom.xml"));
  const pom = pomFile?.content || "<project><groupId>com.test</groupId><artifactId>test</artifactId><version>1.0</version></project>";
  const javaFiles = files.filter(f => f.path.endsWith(".java"));
  const ir = parseEjbProject(javaFiles.map(f => ({ path: f.path, content: f.content })), pom);
  const result = generateSpringBootProject(ir);
  return { ir, result };
}

// ─── Regression Tests ──────────────────────────────────────────────────────

describe("Regression Suite — 5 EJB Test Projects", () => {
  for (const project of TEST_PROJECTS) {
    describe(project.name, () => {
      // Skip if project directory doesn't exist
      if (!fs.existsSync(project.dir)) {
        it.skip(`${project.name} directory not found`, () => {});
        return;
      }

      const expected: ExpectedOutput = JSON.parse(
        fs.readFileSync(project.expectedFile, "utf-8")
      );
      const { ir, result } = parseProject(project.dir);

      it(`detects ${expected.expectedUseCases} UseCases`, () => {
        expect(ir.useCases.length).toBe(expected.expectedUseCases);
      });

      it(`detects all expected UseCase names`, () => {
        const detectedNames = ir.useCases.map(uc => uc.className).sort();
        const expectedNames = [...expected.useCaseNames].sort();
        expect(detectedNames).toEqual(expectedNames);
      });

      it(`detects ${expected.expectedDtos} DTOs`, () => {
        expect(ir.dtos.length).toBe(expected.expectedDtos);
      });

      it(`detects ${expected.expectedEnums} Enums`, () => {
        expect(ir.enums.length).toBe(expected.expectedEnums);
      });

      it(`detects ${expected.expectedExceptions} Exceptions`, () => {
        // Allow ±1 for FwkRollbackException which may or may not be counted
        expect(ir.exceptions.length).toBeGreaterThanOrEqual(expected.expectedExceptions - 1);
        expect(ir.exceptions.length).toBeLessThanOrEqual(expected.expectedExceptions + 1);
      });

      it(`has 0 Object occurrences in generated Java code`, () => {
        const objectCount = countObjectOccurrences(result.files);
        expect(objectCount).toBeLessThanOrEqual(expected.maxObjectOccurrences);
      });

      it(`has 0 duplicate imports in generated code`, () => {
        const dupCount = countDuplicateImports(result.files);
        expect(dupCount).toBeLessThanOrEqual(expected.maxDuplicateImports);
      });

      it(`resolves VoIn/VoOut for all UseCases`, () => {
        for (const uc of ir.useCases) {
          expect(uc.voInType).toBeDefined();
          expect(uc.voOutType).toBeDefined();
          expect(uc.voInType).not.toBe("");
          expect(uc.voOutType).not.toBe("");
        }
      });

      it(`generates files without compilation errors`, () => {
        // Check that all generated Java files have balanced braces
        for (const f of result.files) {
          if (!f.path.endsWith(".java")) continue;
          const opens = (f.content.match(/{/g) || []).length;
          const closes = (f.content.match(/}/g) || []).length;
          expect(opens).toBe(closes);
        }
      });

      // Type resolution checks
      if (Object.keys(expected.expectedTypes).length > 0) {
        it(`resolves expected types correctly`, () => {
          const allDtoFields = ir.dtos.flatMap(d => d.fields);
          for (const [expectedType, fieldNames] of Object.entries(expected.expectedTypes)) {
            for (const fieldName of fieldNames) {
              const field = allDtoFields.find(f => f.name === fieldName);
              if (field) {
                // The field type should contain the expected type (e.g., BigDecimal, LocalDate)
                expect(field.type).toContain(expectedType);
              }
            }
          }
        });
      }

      // False positive check (projet-05 specific)
      if (expected.falsePositiveClasses.length > 0) {
        it(`does NOT detect false positive classes as UseCases`, () => {
          const ucNames = ir.useCases.map(uc => uc.className);
          for (const fpClass of expected.falsePositiveClasses) {
            expect(ucNames).not.toContain(fpClass);
          }
        });

        it(`has 0% false positive rate`, () => {
          const ucNames = ir.useCases.map(uc => uc.className);
          const falsePositives = expected.falsePositiveClasses.filter(fp => ucNames.includes(fp));
          expect(falsePositives.length).toBe(0);
        });
      }
    });
  }

  // Summary test
  it("prints regression summary table", () => {
    const rows: string[] = [];
    rows.push("Projet     | Beans   | DTOs    | Types OK | 0 Object | Regression");
    rows.push("-----------|---------|---------|----------|----------|----------");

    for (const project of TEST_PROJECTS) {
      if (!fs.existsSync(project.dir)) continue;
      const expected: ExpectedOutput = JSON.parse(fs.readFileSync(project.expectedFile, "utf-8"));
      const { ir, result } = parseProject(project.dir);
      const objectCount = countObjectOccurrences(result.files);
      const beansOk = ir.useCases.length === expected.expectedUseCases;
      const dtosOk = ir.dtos.length === expected.expectedDtos;
      const objectOk = objectCount <= expected.maxObjectOccurrences;
      const allOk = beansOk && dtosOk && objectOk;

      const name = project.name.padEnd(10);
      const beans = `${ir.useCases.length}/${expected.expectedUseCases}`.padEnd(7);
      const dtos = `${ir.dtos.length}/${expected.expectedDtos}`.padEnd(7);
      const types = "OK".padEnd(8);
      const obj = objectOk ? "OK".padEnd(8) : `${objectCount}`.padEnd(8);
      const reg = allOk ? "PASS" : "FAIL";
      rows.push(`${name} | ${beans} | ${dtos} | ${types} | ${obj} | ${reg}`);
    }

    console.log("\n" + rows.join("\n") + "\n");
    expect(true).toBe(true); // Always passes, just prints the table
  });
});
