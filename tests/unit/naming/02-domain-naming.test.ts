/**
 * tests/unit/naming/02-domain-naming.test.ts
 *
 * Tests unitaires pour la résolution de domaines.
 * Vérifie que le parser infère correctement le domaine métier
 * à partir du nom de classe et du package.
 */
import { describe, it, expect } from "vitest";
import { parseEjbProject } from "../../../server/java-parser";

/**
 * Helper : parse un fichier EJB minimal et retourne le domaine détecté.
 */
function inferDomain(className: string, packageName = "com.bank.service"): string {
  const src = `
    package ${packageName};
    import javax.ejb.Stateless;
    @Stateless
    public class ${className} {
      public void execute(String input) { }
    }
  `;
  const path = `src/main/java/${packageName.replace(/\./g, "/")}/${className}.java`;
  const ir = parseEjbProject([{ path, content: src }]);
  if (ir.useCases.length === 0) return "general";
  return ir.useCases[0].domain;
}

describe("Domain resolution — tous types Java", () => {
  describe("EJB métier — domaines bancaires", () => {
    it("CompteEJB → compte", () => {
      expect(inferDomain("CompteEJB")).toBe("compte");
    });

    it("CarteEJB → carte", () => {
      expect(inferDomain("CarteEJB")).toBe("carte");
    });

    it("ClientEJB → client", () => {
      expect(inferDomain("ClientEJB")).toBe("client");
    });

    it("CreditEJB → credit", () => {
      expect(inferDomain("CreditEJB")).toBe("credit");
    });

    it("VirementEJB → virement", () => {
      expect(inferDomain("VirementEJB")).toBe("virement");
    });

    it("DocumentEJB → document", () => {
      expect(inferDomain("DocumentEJB")).toBe("document");
    });

    it("NotificationEJB → notification", () => {
      expect(inferDomain("NotificationEJB")).toBe("notification");
    });

    it("ReportingEJB → reporting", () => {
      expect(inferDomain("ReportingEJB")).toBe("reporting");
    });

    it("PaiementEJB → paiement", () => {
      expect(inferDomain("PaiementEJB")).toBe("paiement");
    });
  });

  describe("Domaine depuis le package", () => {
    it("com.bank.carte.usecases → carte", () => {
      expect(inferDomain("ActiverCarteUC", "com.bank.carte.usecases")).toBe("carte");
    });

    it("com.bank.compte.usecases → compte", () => {
      expect(inferDomain("ConsulterSoldeUC", "com.bank.compte.usecases")).toBe("compte");
    });

    it("com.bank.virement.usecases → virement", () => {
      expect(inferDomain("VirementUC", "com.bank.virement.usecases")).toBe("virement");
    });
  });

  describe("Noms de classe composés", () => {
    it("ConsulterSoldeUC → compte (via pattern Solde)", () => {
      expect(inferDomain("ConsulterSoldeUC")).toBe("compte");
    });

    it("ActiverCarteUC → carte (via pattern Activer)", () => {
      expect(inferDomain("ActiverCarteUC")).toBe("carte");
    });

    it("SimulerCreditUC → credit (via pattern Simuler)", () => {
      expect(inferDomain("SimulerCreditUC")).toBe("credit");
    });
  });

  describe("Session / Auth", () => {
    it("SessionEJB → sessions", () => {
      expect(inferDomain("SessionEJB")).toBe("sessions");
    });

    it("LoginEJB → sessions", () => {
      expect(inferDomain("LoginEJB")).toBe("sessions");
    });
  });

  describe("Batch / Timer", () => {
    it("BatchEJB → batch", () => {
      expect(inferDomain("BatchEJB")).toBe("batch");
    });

    it("ConfigEJB → configuration", () => {
      expect(inferDomain("ConfigEJB")).toBe("configuration");
    });
  });

  describe("Fallback — jamais vide", () => {
    it("domaine n'est jamais une chaîne vide", () => {
      const domain = inferDomain("SomeRandomEJB");
      expect(domain).toBeTruthy();
      expect(domain.length).toBeGreaterThan(0);
    });

    it("domaine inconnu → fallback raisonnable (pas vide)", () => {
      const domain = inferDomain("XyzAbcEJB");
      expect(domain).toBeTruthy();
    });
  });
});
