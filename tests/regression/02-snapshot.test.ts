/**
 * tests/regression/02-snapshot.test.ts
 *
 * Test de régression par snapshots : vérifie que la sortie générée
 * ne régresse pas par rapport aux snapshots de référence.
 * À la première exécution, crée les snapshots. Aux suivantes, compare.
 */
import { describe, it, expect } from "vitest";
import { ALL_FIXTURES } from "../fixtures";
import { runFullTestAndSnapshot, compareWithSnapshot, runFullTest } from "../helpers";

describe("Snapshot — stabilité de la sortie générée", () => {
  for (const fixture of ALL_FIXTURES) {
    describe(`[${fixture.id}] ${fixture.name}`, () => {
      it("génère un nombre stable de fichiers", () => {
        const result = runFullTestAndSnapshot(fixture);
        // Vérifie qu'on génère au moins les fichiers attendus
        expect(result.generation.files.length).toBeGreaterThan(0);
        // Vérifie que le snapshot est cohérent
        const currentData = {
          useCaseCount: result.ir.useCases?.length ?? 0,
          dtoCount: result.ir.dtos?.length ?? 0,
          enumCount: result.ir.enums?.length ?? 0,
          exceptionCount: result.ir.exceptions?.length ?? 0,
          generatedFileCount: result.generation.files.length,
          generatedFilePaths: result.generation.files.map((f) => f.path),
          score: result.scoreResult.total,
          status: result.scoreResult.status,
        };
        const comparison = compareWithSnapshot(fixture.id, currentData);
        // Pas de régression détectée
        expect(comparison.hasRegression).toBe(false);
      });

      it("contient un pom.xml dans la sortie", () => {
        const result = runFullTest(fixture);
        const hasPom = result.generation.files.some((f) => f.path === "pom.xml");
        expect(hasPom).toBe(true);
      });

      it("contient un MIGRATION_REPORT.md", () => {
        const result = runFullTest(fixture);
        const hasReport = result.generation.files.some((f) =>
          f.path.includes("MIGRATION_REPORT")
        );
        expect(hasReport).toBe(true);
      });
    });
  }
});
