/**
 * tests/unit/generator/05-controller-generation.test.ts
 *
 * Tests unitaires pour la génération de controllers Spring Boot.
 * Vérifie les annotations, la structure, et les endpoints.
 */
import { describe, it, expect } from "vitest";
import { parseEjbProject } from "../../../server/java-parser";
import { generateSpringBootProject } from "../../../server/spring-generator";

describe("Controller generation", () => {
  it("génère un @RestController avec @Tag OpenAPI", () => {
    const src = `
      package com.bank.compte;
      import javax.ejb.Stateless;
      @Stateless
      public class CompteEJB {
        public double consulterSolde(String numCompte) { return 0; }
      }
    `;
    const ir = parseEjbProject([
      { path: "src/main/java/com/bank/compte/CompteEJB.java", content: src },
    ]);
    const gen = generateSpringBootProject(ir);
    const ctrl = gen.files.find((f) => f.category === "controller");
    expect(ctrl).toBeDefined();
    expect(ctrl!.content).toContain("@RestController");
    expect(ctrl!.content).toContain("@Tag");
  });

  it("génère un endpoint avec javadoc descriptif", () => {
    const src = `
      package com.bank.compte;
      import javax.ejb.Stateless;
      @Stateless
      public class CompteEJB {
        public double consulterSolde(String numCompte) { return 0; }
      }
    `;
    const ir = parseEjbProject([
      { path: "src/main/java/com/bank/compte/CompteEJB.java", content: src },
    ]);
    const gen = generateSpringBootProject(ir);
    const ctrl = gen.files.find((f) => f.category === "controller");
    // @Operation removed (caused compilation errors with special chars in summary)
    // Controller should have javadoc instead
    expect(ctrl!.content).toContain("/**");
  });

  it("le controller injecte le service correspondant", () => {
    const src = `
      package com.bank.compte;
      import javax.ejb.Stateless;
      @Stateless
      public class CompteEJB {
        public double consulterSolde(String numCompte) { return 0; }
      }
    `;
    const ir = parseEjbProject([
      { path: "src/main/java/com/bank/compte/CompteEJB.java", content: src },
    ]);
    const gen = generateSpringBootProject(ir);
    const ctrl = gen.files.find((f) => f.category === "controller");
    expect(ctrl).toBeDefined();
    // Le controller doit référencer le service
    expect(ctrl!.content).toContain("Service");
    expect(ctrl!.content).toContain("@RequiredArgsConstructor");
  });

  it("le controller retourne ResponseEntity", () => {
    const src = `
      package com.bank.compte;
      import javax.ejb.Stateless;
      @Stateless
      public class CompteEJB {
        public double consulterSolde(String numCompte) { return 0; }
      }
    `;
    const ir = parseEjbProject([
      { path: "src/main/java/com/bank/compte/CompteEJB.java", content: src },
    ]);
    const gen = generateSpringBootProject(ir);
    const ctrl = gen.files.find((f) => f.category === "controller");
    expect(ctrl!.content).toContain("ResponseEntity");
  });

  it("le controller a un import pour les annotations Spring Web", () => {
    const src = `
      package com.bank.compte;
      import javax.ejb.Stateless;
      @Stateless
      public class CompteEJB {
        public double consulterSolde(String numCompte) { return 0; }
      }
    `;
    const ir = parseEjbProject([
      { path: "src/main/java/com/bank/compte/CompteEJB.java", content: src },
    ]);
    const gen = generateSpringBootProject(ir);
    const ctrl = gen.files.find((f) => f.category === "controller");
    expect(ctrl!.content).toContain("import org.springframework.web.bind.annotation");
  });

  it("génère un test unitaire pour le controller", () => {
    const src = `
      package com.bank.compte;
      import javax.ejb.Stateless;
      @Stateless
      public class CompteEJB {
        public double consulterSolde(String numCompte) { return 0; }
      }
    `;
    const ir = parseEjbProject([
      { path: "src/main/java/com/bank/compte/CompteEJB.java", content: src },
    ]);
    const gen = generateSpringBootProject(ir);
    const test = gen.files.find((f) => f.category === "test");
    expect(test).toBeDefined();
    expect(test!.path).toContain("Test.java");
  });
});
