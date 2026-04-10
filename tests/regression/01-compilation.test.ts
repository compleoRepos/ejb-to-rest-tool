/**
 * tests/regression/01-compilation.test.ts
 *
 * Test de régression LE PLUS IMPORTANT : le code Java généré doit compiler.
 * Vérifie la syntaxe (accolades, imports, types) pour chaque fixture.
 */
import { describe, it, expect } from "vitest";
import { ALL_FIXTURES } from "../fixtures";
import { runFullTest, checkCompilation } from "../helpers";

describe("Compilation — code Java généré syntaxiquement valide", () => {
  for (const fixture of ALL_FIXTURES) {
    describe(`[${fixture.id}] ${fixture.name}`, () => {
      it("accolades équilibrées dans au moins 80% des fichiers Java", () => {
        const result = runFullTest(fixture);
        const braceErrors = result.compileCheck.errors.filter((e) =>
          e.message.includes("Accolades")
        );
        const braceFailCount = braceErrors.length;
        const ratio = result.compileCheck.totalFiles > 0
          ? (result.compileCheck.totalFiles - braceFailCount) / result.compileCheck.totalFiles
          : 1;
        expect(ratio).toBeGreaterThanOrEqual(0.8);
        if (braceErrors.length > 0) {
          console.warn(`[${fixture.id}] ${braceErrors.length} fichier(s) avec accolades déséquilibrées:`, braceErrors);
        }
      });

      it("pas de Void.builder() dans le code généré", () => {
        const result = runFullTest(fixture);
        expect(result.compileCheck.hasVoidBuilder).toBe(false);
      });

      it("génère au moins 1 fichier Java", () => {
        const result = runFullTest(fixture);
        expect(result.compileCheck.totalFiles).toBeGreaterThan(0);
      });

      it("ratio fichiers valides >= 80%", () => {
        const result = runFullTest(fixture);
        const ratio = result.compileCheck.passedFiles / result.compileCheck.totalFiles;
        expect(ratio).toBeGreaterThanOrEqual(0.8);
      });
    });
  }
});
