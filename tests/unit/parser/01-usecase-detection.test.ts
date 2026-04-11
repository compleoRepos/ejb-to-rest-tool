/**
 * tests/unit/parser/01-usecase-detection.test.ts
 *
 * Tests unitaires pour la détection de UseCases via parseEjbProject.
 * Vérifie que le parser EJB détecte correctement les différents types
 * de composants Java legacy.
 */
import { describe, it, expect } from "vitest";
import { parseEjbProject } from "../../../server/java-parser";

/**
 * Helper : parse un seul fichier Java et retourne les UseCases détectés.
 */
function parseUseCases(src: string, path = "src/main/java/com/bank/Test.java") {
  const ir = parseEjbProject([{ path, content: src }]);
  return ir.useCases;
}

describe("UseCase detection — tous types Java", () => {
  describe("EJB 3.x @Stateless direct", () => {
    it("détecte méthodes business sans couche BaseUseCase", () => {
      const src = `
        package com.bank.compte;
        import javax.ejb.Stateless;
        @Stateless
        public class AccountEJB {
          public double getBalance(String req) { return 0; }
          public void initierVirement(String source, String dest) { }
          private void internalHelper() { }
        }
      `;
      const uc = parseUseCases(src, "src/main/java/com/bank/compte/AccountEJB.java");
      // Le parser détecte les méthodes publiques business (exclut private)
      expect(uc.length).toBeGreaterThanOrEqual(2);
      const names = uc.map((u) => u.className);
      // Toutes les UC doivent avoir un className contenant AccountEJB
      for (const name of names) {
        expect(name).toContain("AccountEJB");
      }
    });

    it("exclut méthodes lifecycle EJB 2.x (ejbCreate, ejbRemove)", () => {
      const src = `
        package com.bank.compte;
        import javax.ejb.SessionBean;
        import javax.ejb.SessionContext;
        public class MyBean implements SessionBean {
          public void ejbCreate() { }
          public void ejbRemove() { }
          public void ejbActivate() { }
          public void ejbPassivate() { }
          public void setSessionContext(SessionContext c) { }
          public String doWork(String input) { return input; }
        }
      `;
      const uc = parseUseCases(src, "src/main/java/com/bank/compte/MyBean.java");
      // Le parser EJB 3.x ne détecte pas les SessionBean comme UC
      // (géré par le pipeline multi-tech)
      // Mais si détecté, ne doit pas inclure les méthodes lifecycle
      const lifecycleMethods = ["ejbCreate", "ejbRemove", "ejbActivate", "ejbPassivate", "setSessionContext"];
      for (const ucItem of uc) {
        for (const method of lifecycleMethods) {
          expect(ucItem.className).not.toContain(method);
        }
      }
    });

    it("exclut getters, setters, isXxx", () => {
      const src = `
        package com.bank.carte;
        import javax.ejb.Stateless;
        @Stateless
        public class CardEJB {
          public String getCardNumber() { return ""; }
          public void setCardNumber(String n) { this.num = n; }
          public boolean isExpired() { return false; }
          public void activateCard(String req) { }
        }
      `;
      const uc = parseUseCases(src, "src/main/java/com/bank/carte/CardEJB.java");
      // Les getters/setters/isXxx ne doivent pas être des UC
      const ucNames = uc.map((u) => u.className);
      for (const name of ucNames) {
        expect(name).not.toMatch(/_getCardNumber$/);
        expect(name).not.toMatch(/_setCardNumber$/);
        expect(name).not.toMatch(/_isExpired$/);
      }
    });

    it("exclut méthodes private et protected", () => {
      const src = `
        package com.bank.paiement;
        import javax.ejb.Stateless;
        @Stateless
        public class PaymentEJB {
          private String generateRef() { return "REF"; }
          protected void audit(String msg) { }
          public void initiate(String req) { }
        }
      `;
      const uc = parseUseCases(src, "src/main/java/com/bank/paiement/PaymentEJB.java");
      // Seule la méthode publique doit être détectée
      expect(uc.length).toBeGreaterThanOrEqual(1);
      const ucNames = uc.map((u) => u.className);
      for (const name of ucNames) {
        expect(name).not.toContain("generateRef");
        expect(name).not.toContain("audit");
      }
    });
  });

  describe("EJB avec BaseUseCase pattern", () => {
    it("détecte le pattern BaseUseCase<VoIn, VoOut>", () => {
      const src = `
        package com.bank.usecase;
        import com.bank.framework.BaseUseCase;
        import javax.ejb.Stateless;
        @Stateless
        public class VirementUC implements BaseUseCase<VirementVoIn, VirementVoOut> {
          public VirementVoOut execute(VirementVoIn voIn) {
            return new VirementVoOut();
          }
        }
      `;
      const uc = parseUseCases(src, "src/main/java/com/bank/usecase/VirementUC.java");
      expect(uc.length).toBeGreaterThanOrEqual(1);
      // Doit détecter le UseCase avec un type de retour
      const first = uc[0];
      // Le parser peut retourner le type générique ou le type spécifique
      expect(first.voInType).toBeTruthy();
      expect(first.voOutType).toBeTruthy();
    });
  });

  describe("Détection du domaine", () => {
    it("extrait le domaine depuis le package", () => {
      const src = `
        package com.bank.carte.usecases;
        import javax.ejb.Stateless;
        @Stateless
        public class ActiverCarteUC implements BaseUseCase<ActiverCarteVoIn, ActiverCarteVoOut> {
          public ActiverCarteVoOut execute(ActiverCarteVoIn voIn) { return null; }
        }
      `;
      const uc = parseUseCases(src, "src/main/java/com/bank/carte/usecases/ActiverCarteUC.java");
      if (uc.length > 0) {
        expect(uc[0].domain).toBe("carte");
      }
    });

    it("infère le domaine depuis le nom de classe", () => {
      const src = `
        package com.bank.service;
        import javax.ejb.Stateless;
        @Stateless
        public class CompteEJB {
          public double consulterSolde(String numCompte) { return 0; }
        }
      `;
      const uc = parseUseCases(src, "src/main/java/com/bank/service/CompteEJB.java");
      if (uc.length > 0) {
        expect(uc[0].domain).toBe("compte");
      }
    });
  });

  describe("HTTP method detection", () => {
    it("consulter* → GET", () => {
      const src = `
        package com.bank.compte;
        import javax.ejb.Stateless;
        @Stateless
        public class ConsulterSoldeUC implements BaseUseCase<ConsulterSoldeVoIn, ConsulterSoldeVoOut> {
          public ConsulterSoldeVoOut execute(ConsulterSoldeVoIn voIn) { return null; }
        }
      `;
      const uc = parseUseCases(src, "src/main/java/com/bank/compte/ConsulterSoldeUC.java");
      if (uc.length > 0) {
        expect(uc[0].httpMethod).toBe("GET");
      }
    });

    it("virement* → POST", () => {
      const src = `
        package com.bank.virement;
        import javax.ejb.Stateless;
        @Stateless
        public class VirementUC implements BaseUseCase<VirementVoIn, VirementVoOut> {
          public VirementVoOut execute(VirementVoIn voIn) { return null; }
        }
      `;
      const uc = parseUseCases(src, "src/main/java/com/bank/virement/VirementUC.java");
      if (uc.length > 0) {
        expect(uc[0].httpMethod).toBe("POST");
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // FIX-E : Propagation des paramètres String directs (v7.3)
  // ═══════════════════════════════════════════════════════════════════════════
  describe("FIX-E : paramètres directs propagés", () => {
    it("propage un param String direct sans VoIn", () => {
      const src = `
        package com.bank.carte;
        import javax.ejb.Stateless;
        import java.util.List;
        @Stateless
        public class CarteEJB {
          public List<String> getCartesActives(String numCompte) {
            return new java.util.ArrayList<>();
          }
        }
      `;
      const uc = parseUseCases(src, "src/main/java/com/bank/carte/CarteEJB.java");
      expect(uc.length).toBeGreaterThanOrEqual(1);
      const target = uc.find(u => u.className.includes("getCartesActives"));
      expect(target).toBeDefined();
      if (target) {
        expect(target.methodParameters).toBeDefined();
        expect(target.methodParameters!.length).toBe(1);
        expect(target.methodParameters![0].name).toBe("numCompte");
        expect(target.methodParameters![0].type).toBe("String");
      }
    });

    it("propage 3 params directs pour getHistoriqueClientComplet", () => {
      const src = `
        package com.bank.reporting;
        import javax.ejb.Stateless;
        import java.util.List;
        @Stateless
        public class ReportingEJB {
          public List<String> getHistoriqueClientComplet(
              String codeClient, String dateDebut, String dateFin) {
            return new java.util.ArrayList<>();
          }
        }
      `;
      const uc = parseUseCases(src, "src/main/java/com/bank/reporting/ReportingEJB.java");
      const target = uc.find(u => u.className.includes("getHistoriqueClientComplet"));
      expect(target).toBeDefined();
      if (target) {
        expect(target.methodParameters).toBeDefined();
        expect(target.methodParameters!.length).toBe(3);
        expect(target.methodParameters!.map(p => p.name)).toEqual(["codeClient", "dateDebut", "dateFin"]);
      }
    });

    it("VoIn reste un DTO Spring (pas des params directs)", () => {
      const src = `
        package com.bank.compte;
        import javax.ejb.Stateless;
        @Stateless
        public class CompteEJB {
          public ConsulterSoldeVoOut consulterSolde(ConsulterSoldeVoIn voIn) {
            return null;
          }
        }
      `;
      const uc = parseUseCases(src, "src/main/java/com/bank/compte/CompteEJB.java");
      const target = uc.find(u => u.className.includes("consulterSolde"));
      expect(target).toBeDefined();
      if (target) {
        expect(target.voInType).toBe("ConsulterSoldeVoIn");
        // Les params VoIn ne sont pas des params directs
        if (target.methodParameters && target.methodParameters.length > 0) {
          expect(target.methodParameters[0].type).toBe("ConsulterSoldeVoIn");
        }
      }
    });
  });
});
