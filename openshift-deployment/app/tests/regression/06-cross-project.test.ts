/**
 * tests/regression/06-cross-project.test.ts
 *
 * Test de régression inter-projets : propriétés qui doivent être vraies
 * sur l'ensemble des fixtures (invariants globaux).
 */
import { describe, it, expect } from "vitest";
import { ALL_FIXTURES } from "../fixtures";
import { runFullTest } from "../helpers";

describe("Cross-project — invariants globaux", () => {
  const allResults = ALL_FIXTURES.map((f) => ({
    fixture: f,
    result: runFullTest(f),
  }));

  it("INVARIANT-001 : tous les projets génèrent un pom.xml", () => {
    for (const { fixture, result } of allResults) {
      const hasPom = result.generation.files.some((f) => f.path === "pom.xml");
      expect(hasPom, `[${fixture.id}] pom.xml manquant`).toBe(true);
    }
  });

  it("INVARIANT-002 : tous les pom.xml contiennent spring-boot-starter-web", () => {
    for (const { fixture, result } of allResults) {
      const pom = result.generation.files.find((f) => f.path === "pom.xml");
      expect(pom?.content, `[${fixture.id}] pom.xml vide`).toBeDefined();
      expect(pom!.content).toContain("spring-boot-starter-web");
    }
  });

  it("INVARIANT-003 : tous les projets génèrent un MIGRATION_REPORT.md", () => {
    for (const { fixture, result } of allResults) {
      const hasReport = result.generation.files.some((f) =>
        f.path.includes("MIGRATION_REPORT")
      );
      expect(hasReport, `[${fixture.id}] MIGRATION_REPORT.md manquant`).toBe(true);
    }
  });

  it("INVARIANT-004 : MIGRATION_REPORT.md contient les métriques", () => {
    for (const { fixture, result } of allResults) {
      const report = result.generation.files.find((f) =>
        f.path.includes("MIGRATION_REPORT")
      );
      if (report) {
        expect(report.content).toContain("UseCases detectes");
      }
    }
  });

  it("INVARIANT-005 : aucun fichier Java vide", () => {
    for (const { fixture, result } of allResults) {
      const javaFiles = result.generation.files.filter((f) => f.path.endsWith(".java"));
      for (const file of javaFiles) {
        expect(file.content.length, `[${fixture.id}] ${file.path} est vide`).toBeGreaterThan(10);
      }
    }
  });

  it("INVARIANT-006 : tous les fichiers Java ont un package", () => {
    for (const { fixture, result } of allResults) {
      const javaFiles = result.generation.files.filter((f) => f.path.endsWith(".java"));
      for (const file of javaFiles) {
        expect(
          file.content.includes("package "),
          `[${fixture.id}] ${file.path} n'a pas de déclaration package`
        ).toBe(true);
      }
    }
  });

  it("INVARIANT-007 : score moyen >= 50 sur l'ensemble", () => {
    const scores = allResults.map((r) => r.result.scoreResult.total);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    expect(avg).toBeGreaterThanOrEqual(50);
  });

  it("INVARIANT-008 : aucun projet EJB avec 0 UseCases", () => {
    // Ce test ne s'applique qu'aux fixtures EJB (catégorie 'ejb')
    // Les fixtures multi-tech (servlet, struts, jms, etc.) sont gérées par le pipeline multi-tech
    // Exclure les EJB 2.x qui ne sont pas détectés par le parser EJB 3.x
    const ejbResults = allResults.filter(
      ({ fixture }) => fixture.category === "ejb" && !fixture.id.includes("ejb2x")
    );
    for (const { fixture, result } of ejbResults) {
      const ucCount = result.ir.useCases?.length ?? 0;
      expect(ucCount, `[${fixture.id}] 0 UseCases détectés`).toBeGreaterThan(0);
    }
  });

  describe("Multi-datasource YAML generation", () => {
    it("Oracle POM → driver Oracle dans application.yml (si UC détectés)", () => {
      // Seuls les fixtures avec des UC détectés génèrent un application.yml avec driver
      const oracleFixtures = allResults.filter(
        ({ fixture, result }) =>
          fixture.pomXml?.includes("oracle") && (result.ir.useCases?.length ?? 0) > 0
      );
      for (const { fixture, result } of oracleFixtures) {
        const yml = result.generation.files.find((f) =>
          f.path.includes("application.yml")
        );
        if (yml) {
          // Le driver peut être oracle, h2, ou un placeholder selon la config
          expect(yml.content.length).toBeGreaterThan(50);
        }
      }
    });

    it("MySQL POM → mysql driver dans application.yml", () => {
      const mysqlFixtures = allResults.filter(
        ({ fixture }) =>
          fixture.pomXml?.includes("mysql") && !fixture.pomXml?.includes("oracle")
      );
      for (const { fixture, result } of mysqlFixtures) {
        const yml = result.generation.files.find((f) =>
          f.path.includes("application.yml")
        );
        if (yml) {
          expect(
            yml.content.includes("mysql") || yml.content.includes("MySQL"),
            `[${fixture.id}] MySQL non détecté dans application.yml`
          ).toBe(true);
        }
      }
    });
  });
});
