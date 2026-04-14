/**
 * tests/unit/naming/01-class-naming.test.ts
 *
 * Tests unitaires pour le nommage des classes générées.
 * Vérifie que les noms de classes Spring Boot sont corrects
 * et suivent les conventions Java.
 */
import { describe, it, expect } from "vitest";
import { parseEjbProject } from "../../../server/java-parser";
import { generateSpringBootProject } from "../../../server/spring-generator";

function getGeneratedClassNames(src: string, path: string) {
  const ir = parseEjbProject([{ path, content: src }]);
  const gen = generateSpringBootProject(ir);
  const names: string[] = [];
  for (const f of gen.files) {
    if (f.path.endsWith(".java")) {
      const match = f.content.match(/public class (\w+)/);
      if (match) names.push(match[1]);
    }
  }
  return { names, files: gen.files };
}

describe("Class naming conventions", () => {
  it("le service se termine par Service", () => {
    const { files } = getGeneratedClassNames(
      `package com.bank.compte;
       import javax.ejb.Stateless;
       @Stateless
       public class CompteEJB {
         public double consulterSolde(String numCompte) { return 0; }
       }`,
      "src/main/java/com/bank/compte/CompteEJB.java"
    );
    const svc = files.find((f) => f.category === "service");
    expect(svc).toBeDefined();
    const match = svc!.content.match(/public class (\w+)/);
    expect(match).toBeTruthy();
    expect(match![1]).toMatch(/Service$/);
  });

  it("le controller se termine par Controller", () => {
    const { files } = getGeneratedClassNames(
      `package com.bank.compte;
       import javax.ejb.Stateless;
       @Stateless
       public class CompteEJB {
         public double consulterSolde(String numCompte) { return 0; }
       }`,
      "src/main/java/com/bank/compte/CompteEJB.java"
    );
    const ctrl = files.find((f) => f.category === "controller");
    expect(ctrl).toBeDefined();
    const match = ctrl!.content.match(/public class (\w+)/);
    expect(match).toBeTruthy();
    expect(match![1]).toMatch(/Controller$/);
  });

  it("le test se termine par Test", () => {
    const { files } = getGeneratedClassNames(
      `package com.bank.compte;
       import javax.ejb.Stateless;
       @Stateless
       public class CompteEJB {
         public double consulterSolde(String numCompte) { return 0; }
       }`,
      "src/main/java/com/bank/compte/CompteEJB.java"
    );
    const test = files.find((f) => f.category === "test");
    expect(test).toBeDefined();
    // Le générateur peut utiliser 'class' sans 'public'
    const match = test!.content.match(/class (\w+Test)/);
    expect(match).toBeTruthy();
    expect(match![1]).toMatch(/Test$/);
  });

  it("les noms de classes commencent par une majuscule", () => {
    const { names } = getGeneratedClassNames(
      `package com.bank.compte;
       import javax.ejb.Stateless;
       @Stateless
       public class CompteEJB {
         public double consulterSolde(String numCompte) { return 0; }
       }`,
      "src/main/java/com/bank/compte/CompteEJB.java"
    );
    for (const name of names) {
      expect(name[0]).toBe(name[0].toUpperCase());
    }
  });

  it("les noms de classes sont des identifiants Java valides", () => {
    const { names } = getGeneratedClassNames(
      `package com.bank.compte;
       import javax.ejb.Stateless;
       @Stateless
       public class CompteEJB {
         public double consulterSolde(String numCompte) { return 0; }
       }`,
      "src/main/java/com/bank/compte/CompteEJB.java"
    );
    for (const name of names) {
      expect(name).toMatch(/^[A-Z][a-zA-Z0-9]*$/);
    }
  });

  it("le nom du service correspond au domaine", () => {
    const { files } = getGeneratedClassNames(
      `package com.bank.compte;
       import javax.ejb.Stateless;
       @Stateless
       public class CompteEJB {
         public double consulterSolde(String numCompte) { return 0; }
       }`,
      "src/main/java/com/bank/compte/CompteEJB.java"
    );
    const svc = files.find((f) => f.category === "service");
    const match = svc!.content.match(/public class (\w+)/);
    // Le nom du service doit contenir le domaine (Compte)
    expect(match![1].toLowerCase()).toContain("compte");
  });

  it("le nom du controller correspond au domaine", () => {
    const { files } = getGeneratedClassNames(
      `package com.bank.virement.usecases;
       import javax.ejb.Stateless;
       @Stateless
       public class VirementUC implements BaseUseCase<VirementVoIn, VirementVoOut> {
         public VirementVoOut execute(VirementVoIn voIn) { return null; }
       }`,
      "src/main/java/com/bank/virement/usecases/VirementUC.java"
    );
    const ctrl = files.find((f) => f.category === "controller");
    const match = ctrl!.content.match(/public class (\w+)/);
    expect(match![1].toLowerCase()).toContain("virement");
  });
});
