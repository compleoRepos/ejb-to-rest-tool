/**
 * COMPLEO v7.8 — Tests de régression post-audit
 *
 * 12 tests couvrant :
 *   - BUG 7 : Adapters avec signatures typées (pas Object... args)
 *   - BUG 8 : Quality Scorer honnête (nouveaux checks v7.8)
 *   - Intégration : Pipeline complet BMCE avec les corrections v7.8
 *
 * @author Compleo Engine
 */
import { describe, it, expect } from "vitest";
import { join } from "path";
import AdmZip from "adm-zip";
import { parseEjbProject } from "../../server/java-parser";
import { generateSpringBootProject } from "../../server/spring-generator";
import { generateInjectedServiceStub } from "../../server/spring/infra-gen";
import {
  scoreGeneration,
  calculateQualityScore,
  type QualityReport,
} from "../../server/engine/quality-scorer";

// ── Fixtures ────────────────────────────────────────────────────────

const ZIP_PATH = join(
  process.cwd(),
  "tests/fixtures/input/bmce-core-banking-complex.zip"
);

function loadBmceFiles() {
  const zip = new AdmZip(ZIP_PATH);
  const entries = zip.getEntries();
  return entries
    .filter(
      (e) =>
        !e.isDirectory &&
        (e.entryName.endsWith(".java") ||
          e.entryName.endsWith(".xml") ||
          e.entryName.endsWith(".properties"))
    )
    .map((e) => ({
      path: e.entryName,
      content: e.getData().toString("utf-8"),
    }));
}

function generateBmce() {
  const sourceFiles = loadBmceFiles();
  const parsed = parseEjbProject(sourceFiles);
  return generateSpringBootProject(parsed);
}

// ══════════════════════════════════════════════════════════════════════
// BUG 7 — Adapters avec signatures typées
// ══════════════════════════════════════════════════════════════════════

describe("v7.8 BUG-7 : Adapters — signatures typées", () => {
  it("Aucun adapter ne contient Object... args dans le ZIP BMCE", () => {
    const generated = generateBmce();
    const adapters = generated.files.filter(
      (f) => f.path.includes("adapter/") && f.path.endsWith("Adapter.java")
    );
    expect(adapters.length).toBeGreaterThan(0);

    for (const adapter of adapters) {
      const objectArgs = adapter.content.match(
        /public\s+Object\s+\w+\s*\(Object\.\.\.\s+args\)/g
      );
      if (objectArgs) {
        console.error(
          `BUG-7 regression: ${adapter.path.split("/").pop()} still has Object... args:`,
          objectArgs
        );
      }
      expect(objectArgs).toBeNull();
    }
  });

  it("NotificationMulticanalEJBLocalAdapter a des signatures typées", () => {
    const generated = generateBmce();
    const adapter = generated.files.find((f) =>
      f.path.includes("NotificationMulticanalEJBLocalAdapter.java")
    );
    expect(adapter).toBeDefined();
    // Must have typed methods, not Object... args
    expect(adapter!.content).not.toContain("Object... args");
    // Should contain at least one method with real params
    expect(adapter!.content).toMatch(/public\s+void\s+\w+\s*\(/);
  });

  it("DeviseConversionEJBLocalAdapter a des signatures typées", () => {
    const generated = generateBmce();
    const adapter = generated.files.find((f) =>
      f.path.includes("DeviseConversionEJBLocalAdapter.java")
    );
    expect(adapter).toBeDefined();
    expect(adapter!.content).not.toContain("Object... args");
    // Should have getTauxChange with String params
    expect(adapter!.content).toMatch(/getTauxChange\s*\(/);
  });

  it("SEPATransformerAdapter a des signatures typées", () => {
    const generated = generateBmce();
    const adapter = generated.files.find((f) =>
      f.path.includes("SEPATransformerAdapter.java")
    );
    expect(adapter).toBeDefined();
    expect(adapter!.content).not.toContain("Object... args");
    expect(adapter!.content).toMatch(/transformerEnPAIN001\s*\(/);
  });

  it("IBANValidatorAdapter a des signatures typées", () => {
    const generated = generateBmce();
    const adapter = generated.files.find((f) =>
      f.path.includes("IBANValidatorAdapter.java")
    );
    expect(adapter).toBeDefined();
    expect(adapter!.content).not.toContain("Object... args");
    expect(adapter!.content).toMatch(/validate\s*\(String/);
  });

  it("generateInjectedServiceStub extrait les méthodes d'une classe EJB concrète", () => {
    const ejbSource = `
package ma.bmce.digital.complex.ejb;
import javax.ejb.*;
import java.math.BigDecimal;

@Stateless
public class DeviseConversionEJB {
    public BigDecimal getTauxChange(String deviseSource, String deviseCible) {
        return BigDecimal.ONE;
    }
    public BigDecimal convertir(BigDecimal montant, String deviseSource, String deviseCible) {
        return montant;
    }
}`;
    const result = generateInjectedServiceStub(
      "ma.bmce.si",
      "src/main/java/ma/bmce/si",
      "DeviseConversionEJBLocal",
      ejbSource,
      new Set(["getTauxChange"])
    );
    expect(result.content).toContain("getTauxChange");
    expect(result.content).toMatch(
      /public\s+BigDecimal\s+getTauxChange\s*\(String\s+deviseSource/
    );
    expect(result.content).not.toContain("Object... args");
  });
});

// ══════════════════════════════════════════════════════════════════════
// BUG 8 — Quality Scorer v7.8 (3 nouveaux checks)
// ══════════════════════════════════════════════════════════════════════

describe("v7.8 BUG-8 : Quality Scorer — checks honnêtes", () => {
  it("Score < 100 si Void sql présent dans un service", () => {
    const files = new Map<string, string>([
      [
        "service/FakeService.java",
        `public class FakeService {
          private static final String SQL_QUERY = "SELECT 1";
          public void execute() {
            Void sql = "SELECT * FROM T_TEST";
          }
        }`,
      ],
    ]);
    const report = calculateQualityScore(files);
    expect(report.score).toBeLessThan(100);
    // The NO_VOID_VARIABLES check should fail
    const voidCheck = report.checks.find(
      (c) => c.id === "NO_VOID_VARIABLES"
    );
    expect(voidCheck).toBeDefined();
    expect(voidCheck!.passed).toBe(false);
  });

  it("Score < 100 si services EJB doublons présents", () => {
    const files = new Map<string, string>([
      [
        "service/CreditService.java",
        "public class CreditService { public void calc() {} }",
      ],
      [
        "service/CreditScoringEJBService.java",
        "public class CreditScoringEJBService { public void execute() {} }",
      ],
    ]);
    const report = calculateQualityScore(files);
    expect(report.score).toBeLessThan(100);
    const dupCheck = report.checks.find(
      (c) => c.id === "NO_DUPLICATE_SERVICES"
    );
    expect(dupCheck).toBeDefined();
    expect(dupCheck!.passed).toBe(false);
  });

  it("Score < 100 si service DTO (VoIn) détecté", () => {
    const files = new Map<string, string>([
      [
        "service/ScoringRequestVoInService.java",
        "public class ScoringRequestVoInService {}",
      ],
    ]);
    const report = calculateQualityScore(files);
    const dtoCheck = report.checks.find(
      (c) => c.id === "NO_DTO_SERVICES"
    );
    expect(dtoCheck).toBeDefined();
    expect(dtoCheck!.passed).toBe(false);
  });

  it("BMCE ZIP obtient 100/100 A+ (tous bugs corrigés)", () => {
    const generated = generateBmce();
    const report = scoreGeneration(generated.files);
    expect(report.score).toBe(100);
    expect(report.grade).toBe("A+");
    // All 11 checks should pass
    for (const check of report.checks) {
      if (!check.passed) {
        console.error(
          `Quality check failed: ${check.id} — ${check.detail}`
        );
      }
      expect(check.passed).toBe(true);
    }
  });

  it("scoreGeneration inclut les 3 nouveaux checks v7.8", () => {
    const generated = generateBmce();
    const report = scoreGeneration(generated.files);
    const checkIds = report.checks.map((c) => c.id);
    expect(checkIds).toContain("NO_VOID_VARIABLES");
    expect(checkIds).toContain("NO_DUPLICATE_SERVICES");
    expect(checkIds).toContain("NO_DTO_SERVICES");
    // Total max should be 120 (100 original + 15 v7.8 + 5 v7.9 SAGA)
    expect(report.maxScore).toBe(120);
  });

  it("calculateQualityScore inclut les 3 nouveaux checks v7.8", () => {
    const generated = generateBmce();
    const fileMap = new Map<string, string>();
    for (const f of generated.files) {
      fileMap.set(f.path, f.content);
    }
    const report = calculateQualityScore(fileMap);
    const checkIds = report.checks.map((c) => c.id);
    expect(checkIds).toContain("NO_VOID_VARIABLES");
    expect(checkIds).toContain("NO_DUPLICATE_SERVICES");
    expect(checkIds).toContain("NO_DTO_SERVICES");
    // Total max should be 120 (v7.9)
    expect(report.maxScore).toBe(120);
  });
});
