/**
 * tests/unit/generator/02-url-generation.test.ts
 *
 * Tests unitaires pour la génération d'URLs REST.
 * Vérifie que les endpoints générés ont des paths valides,
 * des verbes HTTP corrects, et pas de conflits.
 */
import { describe, it, expect } from "vitest";
import { parseEjbProject } from "../../../server/java-parser";
import { generateSpringBootProject } from "../../../server/spring-generator";

/**
 * Helper : parse + génère et retourne les controllers avec leurs endpoints.
 */
function generateControllers(files: { path: string; content: string }[], pomXml?: string) {
  const ir = parseEjbProject(files, pomXml);
  const gen = generateSpringBootProject(ir);
  return gen.files.filter((f) => f.category === "controller");
}

describe("URL generation", () => {
  describe("REST path generation", () => {
    it("génère un path /api/v1/{domain}/{method}", () => {
      const src = `
        package com.bank.compte;
        import javax.ejb.Stateless;
        @Stateless
        public class ConsulterSoldeUC implements BaseUseCase<ConsulterSoldeVoIn, ConsulterSoldeVoOut> {
          public ConsulterSoldeVoOut execute(ConsulterSoldeVoIn voIn) { return null; }
        }
      `;
      const ctrls = generateControllers([
        { path: "src/main/java/com/bank/compte/ConsulterSoldeUC.java", content: src },
      ]);
      expect(ctrls.length).toBeGreaterThanOrEqual(1);
      const ctrl = ctrls[0];
      // Le path doit contenir /api/v1/
      expect(ctrl.content).toContain("/api/v1/");
    });

    it("les paths générés sont des identifiants valides (pas de //, pas de caractères spéciaux)", () => {
      const src = `
        package com.bank.compte;
        import javax.ejb.Stateless;
        @Stateless
        public class CompteEJB {
          public double consulterSolde(String numCompte) { return 0; }
          public void initierVirement(String source, String dest) { }
        }
      `;
      const ctrls = generateControllers([
        { path: "src/main/java/com/bank/compte/CompteEJB.java", content: src },
      ]);
      for (const ctrl of ctrls) {
        // Pas de double slash
        expect(ctrl.content).not.toMatch(/\/\//);
        // Les @RequestMapping doivent contenir des paths valides
        const mappings = ctrl.content.match(/@RequestMapping\("([^"]+)"\)/g) ?? [];
        for (const m of mappings) {
          const path = m.match(/"([^"]+)"/)?.[1] ?? "";
          expect(path).toMatch(/^\/[a-zA-Z0-9\/_-]+$/);
        }
      }
    });
  });

  describe("HTTP verb inference", () => {
    it("consulter* → @GetMapping", () => {
      const src = `
        package com.bank.compte;
        import javax.ejb.Stateless;
        @Stateless
        public class ConsulterSoldeUC implements BaseUseCase<ConsulterSoldeVoIn, ConsulterSoldeVoOut> {
          public ConsulterSoldeVoOut execute(ConsulterSoldeVoIn voIn) { return null; }
        }
      `;
      const ctrls = generateControllers([
        { path: "src/main/java/com/bank/compte/ConsulterSoldeUC.java", content: src },
      ]);
      if (ctrls.length > 0) {
        expect(ctrls[0].content).toContain("@GetMapping");
      }
    });

    it("virement/initier* → @PostMapping", () => {
      const src = `
        package com.bank.virement;
        import javax.ejb.Stateless;
        @Stateless
        public class VirementUC implements BaseUseCase<VirementVoIn, VirementVoOut> {
          public VirementVoOut execute(VirementVoIn voIn) { return null; }
        }
      `;
      const ctrls = generateControllers([
        { path: "src/main/java/com/bank/virement/VirementUC.java", content: src },
      ]);
      if (ctrls.length > 0) {
        expect(ctrls[0].content).toContain("@PostMapping");
      }
    });

    it("maj/update* → @PutMapping", () => {
      const src = `
        package com.bank.client;
        import javax.ejb.Stateless;
        @Stateless
        public class MajClientUC implements BaseUseCase<MajClientVoIn, MajClientVoOut> {
          public MajClientVoOut execute(MajClientVoIn voIn) { return null; }
        }
      `;
      const ctrls = generateControllers([
        { path: "src/main/java/com/bank/client/MajClientUC.java", content: src },
      ]);
      if (ctrls.length > 0) {
        expect(ctrls[0].content).toContain("@PutMapping");
      }
    });

    it("cloturer* → @PostMapping (action métier)", () => {
      const src = `
        package com.bank.compte;
        import javax.ejb.Stateless;
        @Stateless
        public class CloturerCompteUC implements BaseUseCase<CloturerCompteVoIn, CloturerCompteVoOut> {
          public CloturerCompteVoOut execute(CloturerCompteVoIn voIn) { return null; }
        }
      `;
      const ctrls = generateControllers([
        { path: "src/main/java/com/bank/compte/CloturerCompteUC.java", content: src },
      ]);
      if (ctrls.length > 0) {
        // Le moteur mappe 'cloturer' comme une action POST (pas DELETE)
        expect(ctrls[0].content).toContain("@PostMapping");
        expect(ctrls[0].content).toContain("cloturer");
      }
    });
  });

  describe("Multi-endpoint controllers", () => {
    it("plusieurs UC du même domaine → même controller, endpoints distincts", () => {
      const uc1 = `
        package com.bank.compte.usecases;
        import javax.ejb.Stateless;
        @Stateless
        public class ConsulterSoldeUC implements BaseUseCase<ConsulterSoldeVoIn, ConsulterSoldeVoOut> {
          public ConsulterSoldeVoOut execute(ConsulterSoldeVoIn voIn) { return null; }
        }
      `;
      const uc2 = `
        package com.bank.compte.usecases;
        import javax.ejb.Stateless;
        @Stateless
        public class OuvrirCompteUC implements BaseUseCase<OuvrirCompteVoIn, OuvrirCompteVoOut> {
          public OuvrirCompteVoOut execute(OuvrirCompteVoIn voIn) { return null; }
        }
      `;
      const ir = parseEjbProject([
        { path: "src/main/java/com/bank/compte/usecases/ConsulterSoldeUC.java", content: uc1 },
        { path: "src/main/java/com/bank/compte/usecases/OuvrirCompteUC.java", content: uc2 },
      ]);
      const gen = generateSpringBootProject(ir);
      const ctrls = gen.files.filter((f) => f.category === "controller");
      // Les UC du même domaine doivent être dans le même controller
      expect(ctrls.length).toBe(1);
      // Le controller doit avoir 2 endpoints
      const endpointAnnotations = ctrls[0].content.match(/@(Get|Post|Put|Delete)Mapping/g) ?? [];
      expect(endpointAnnotations.length).toBeGreaterThanOrEqual(2);
    });

    it("UC de domaines différents → controllers séparés", () => {
      const uc1 = `
        package com.bank.compte.usecases;
        import javax.ejb.Stateless;
        @Stateless
        public class ConsulterSoldeUC implements BaseUseCase<ConsulterSoldeVoIn, ConsulterSoldeVoOut> {
          public ConsulterSoldeVoOut execute(ConsulterSoldeVoIn voIn) { return null; }
        }
      `;
      const uc2 = `
        package com.bank.virement.usecases;
        import javax.ejb.Stateless;
        @Stateless
        public class VirementUC implements BaseUseCase<VirementVoIn, VirementVoOut> {
          public VirementVoOut execute(VirementVoIn voIn) { return null; }
        }
      `;
      const ir = parseEjbProject([
        { path: "src/main/java/com/bank/compte/usecases/ConsulterSoldeUC.java", content: uc1 },
        { path: "src/main/java/com/bank/virement/usecases/VirementUC.java", content: uc2 },
      ]);
      const gen = generateSpringBootProject(ir);
      const ctrls = gen.files.filter((f) => f.category === "controller");
      expect(ctrls.length).toBe(2);
    });
  });
});
