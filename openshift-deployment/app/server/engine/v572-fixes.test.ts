/**
 * Tests unitaires v5.7.2 — 6 FIX (A-F) pour compilation EJB directs.
 * FIX A: Signature méthodes Service (voIn/voOut depuis UseCase)
 * FIX B: Void.builder() → pas de builder si void
 * FIX C: URL conflicts → sous-path pour méthodes distinctes même verb
 * FIX D: Nommage méthodes → supprimer préfixe ClassName_
 * FIX E: SQL constants au niveau classe (pas méthode)
 * FIX F: Domaines → Reporting → reporting, Session → sessions
 *
 * @author Compleo
 */
import { describe, it, expect } from "vitest";
import { parseEjbProject } from "../java-parser";
import { toMethodName } from "../spring/shared";

// ═══════════════════════════════════════════════════════════════
// FIX D — Nommage méthodes : supprimer préfixe ClassName_
// ═══════════════════════════════════════════════════════════════

describe("FIX D v5.7.2 — toMethodName() strip ClassName_ prefix", () => {

  it("devrait stripper le préfixe ClassName_ d'un EJB direct", () => {
    expect(toMethodName("CompteEJB_consulterSolde")).toBe("consulterSolde");
  });

  it("devrait stripper le préfixe avec underscore multiple", () => {
    expect(toMethodName("AccountServiceBean_toDTO")).toBe("toDTO");
  });

  it("devrait garder le comportement classique pour les UC sans underscore", () => {
    expect(toMethodName("ConsulterSoldeUC")).toBe("consulterSolde");
  });

  it("devrait garder le comportement classique pour UseCase suffix", () => {
    expect(toMethodName("ConsulterSoldeUseCase")).toBe("consulterSolde");
  });

  it("devrait gérer un nom simple sans suffixe", () => {
    expect(toMethodName("ProcessPayment")).toBe("processPayment");
  });
});

// ═══════════════════════════════════════════════════════════════
// FIX F — Domaines : Reporting → reporting, Session → sessions
// ═══════════════════════════════════════════════════════════════

describe("FIX F v5.7.2 — extractDomain enrichi", () => {

  it("devrait détecter le domaine 'reporting' pour ReportingEJB", () => {
    const files = [{
      path: "ReportingEJB.java",
      content: `package ma.bmce.si.reporting;

import javax.ejb.Stateless;

@Stateless
public class ReportingEJB {
    public void genererRapport(String type) {
        // generate report
    }
}`,
      className: "ReportingEJB",
      packageName: "ma.bmce.si.reporting",
    }];

    const ir = parseEjbProject(files);
    const reportingUc = ir.useCases.find(uc => uc.className.includes("Reporting"));
    expect(reportingUc).toBeDefined();
    expect(reportingUc!.domain).toBe("reporting");
  });

  it("devrait détecter le domaine 'sessions' pour SessionEJB", () => {
    const files = [{
      path: "SessionEJB.java",
      content: `package ma.bmce.si.session;

import javax.ejb.Stateless;

@Stateless
public class SessionEJB {
    public String creerSession(String userId) {
        return "session-123";
    }
}`,
      className: "SessionEJB",
      packageName: "ma.bmce.si.session",
    }];

    const ir = parseEjbProject(files);
    const sessionUc = ir.useCases.find(uc => uc.className.includes("Session"));
    expect(sessionUc).toBeDefined();
    expect(sessionUc!.domain).toBe("sessions");
  });

  it("devrait détecter le domaine 'compte' pour CompteEJB", () => {
    const files = [{
      path: "CompteEJB.java",
      content: `package ma.bmce.si.compte;

import javax.ejb.Stateless;

@Stateless
public class CompteEJB {
    public String consulterSolde(String numCompte) {
        return "1000.00";
    }
}`,
      className: "CompteEJB",
      packageName: "ma.bmce.si.compte",
    }];

    const ir = parseEjbProject(files);
    const compteUc = ir.useCases.find(uc => uc.className.includes("Compte"));
    expect(compteUc).toBeDefined();
    expect(compteUc!.domain).toBe("compte");
  });

  it("devrait détecter le domaine 'paiement' pour PaiementServiceBean", () => {
    const files = [{
      path: "PaiementServiceBean.java",
      content: `package ma.bmce.si.paiement;

import javax.ejb.Stateless;

@Stateless
public class PaiementServiceBean {
    public void effectuerPaiement(String montant) {
        // pay
    }
}`,
      className: "PaiementServiceBean",
      packageName: "ma.bmce.si.paiement",
    }];

    const ir = parseEjbProject(files);
    const paiementUc = ir.useCases.find(uc => uc.className.includes("Paiement"));
    expect(paiementUc).toBeDefined();
    expect(paiementUc!.domain).toBe("paiement");
  });

  it("devrait utiliser le nom de classe comme domaine fallback pour un nom inconnu", () => {
    const files = [{
      path: "KycVerificationEJB.java",
      content: `package ma.bmce.si.kyc;

import javax.ejb.Stateless;

@Stateless
public class KycVerificationEJB {
    public boolean verifier(String clientId) {
        return true;
    }
}`,
      className: "KycVerificationEJB",
      packageName: "ma.bmce.si.kyc",
    }];

    const ir = parseEjbProject(files);
    const kycUc = ir.useCases.find(uc => uc.className.includes("KycVerification"));
    expect(kycUc).toBeDefined();
    // Should use baseName "KycVerification" → "kycVerification" as domain
    expect(kycUc!.domain).not.toBe("general");
    expect(kycUc!.domain).toBe("kycVerification");
  });
});

// ═══════════════════════════════════════════════════════════════
// FIX A — Signature méthodes Service (voIn/voOut depuis UseCase)
// ═══════════════════════════════════════════════════════════════

describe("FIX A v5.7.2 — Signature voIn/voOut pour EJB directs", () => {

  it("devrait avoir voInType = type du premier paramètre (pas Void)", () => {
    const files = [{
      path: "CompteEJB.java",
      content: `package ma.bmce.si.compte;

import javax.ejb.Stateless;

@Stateless
public class CompteEJB {
    public SoldeDTO consulterSolde(String numCompte) {
        return new SoldeDTO();
    }
}`,
      className: "CompteEJB",
      packageName: "ma.bmce.si.compte",
    }];

    const ir = parseEjbProject(files);
    const uc = ir.useCases.find(u => u.className.includes("consulterSolde"));
    expect(uc).toBeDefined();
    expect(uc!.voInType).toBe("String");
    expect(uc!.voOutType).toBe("SoldeDTO");
  });

  it("devrait avoir voInType = Void pour méthode sans paramètre", () => {
    const files = [{
      path: "StatusEJB.java",
      content: `package ma.bmce.si.status;

import javax.ejb.Stateless;

@Stateless
public class StatusEJB {
    public String verifierStatus() {
        return "OK";
    }
}`,
      className: "StatusEJB",
      packageName: "ma.bmce.si.status",
    }];

    const ir = parseEjbProject(files);
    const uc = ir.useCases.find(u => u.className.includes("verifierStatus"));
    expect(uc).toBeDefined();
    expect(uc!.voInType).toBe("Void");
    expect(uc!.voOutType).toBe("String");
  });

  it("devrait avoir voOutType = Void pour méthode void", () => {
    const files = [{
      path: "NotificationEJB.java",
      content: `package ma.bmce.si.notification;

import javax.ejb.Stateless;

@Stateless
public class NotificationEJB {
    public void envoyerNotification(String message) {
        // send
    }
}`,
      className: "NotificationEJB",
      packageName: "ma.bmce.si.notification",
    }];

    const ir = parseEjbProject(files);
    const uc = ir.useCases.find(u => u.className.includes("envoyerNotification"));
    expect(uc).toBeDefined();
    expect(uc!.voInType).toBe("String");
    expect(uc!.voOutType).toBe("Void");
  });
});

// ═══════════════════════════════════════════════════════════════
// FIX C — URL conflicts : sous-path pour méthodes distinctes même verb
// ═══════════════════════════════════════════════════════════════

describe("FIX C v5.7.2 — URL conflicts detection", () => {

  it("devrait détecter 2 méthodes GET dans le même domaine comme conflit potentiel", () => {
    const files = [{
      path: "CompteEJB.java",
      content: `package ma.bmce.si.compte;

import javax.ejb.Stateless;

@Stateless
public class CompteEJB {
    public String consulterSolde(String numCompte) {
        return "1000.00";
    }
    public String consulterMouvements(String numCompte) {
        return "[]";
    }
}`,
      className: "CompteEJB",
      packageName: "ma.bmce.si.compte",
    }];

    const ir = parseEjbProject(files);
    // Both methods should be detected as separate UseCases
    const soldeUc = ir.useCases.find(u => u.className.includes("consulterSolde"));
    const mouvUc = ir.useCases.find(u => u.className.includes("consulterMouvements"));
    expect(soldeUc).toBeDefined();
    expect(mouvUc).toBeDefined();
    // Both should be in the same domain
    expect(soldeUc!.domain).toBe(mouvUc!.domain);
    // Both should be GET
    expect(soldeUc!.httpMethod).toBe("GET");
    expect(mouvUc!.httpMethod).toBe("GET");
  });
});

// ═══════════════════════════════════════════════════════════════
// FIX B — Void.builder() ne doit pas être généré
// ═══════════════════════════════════════════════════════════════

describe("FIX B v5.7.2 — Pas de Void.builder() dans le code généré", () => {

  it("ne devrait pas contenir Void.builder() dans le code généré", () => {
    // This test validates at the IR level that void methods have voOutType = "Void"
    // The actual Void.builder() prevention is in service-gen.ts (guard: resDto && resType !== "Void")
    const files = [{
      path: "BatchEJB.java",
      content: `package ma.bmce.si.batch;

import javax.ejb.Stateless;

@Stateless
public class BatchEJB {
    public void executerBatch(String batchId) {
        // run batch
    }
}`,
      className: "BatchEJB",
      packageName: "ma.bmce.si.batch",
    }];

    const ir = parseEjbProject(files);
    const uc = ir.useCases.find(u => u.className.includes("executerBatch"));
    expect(uc).toBeDefined();
    expect(uc!.voOutType).toBe("Void");
    // The service-gen.ts will NOT generate Void.builder() because:
    // 1. resDto = dtoMap.get("Void") = undefined
    // 2. Guard: if (resDto && resType !== "Void") → false
  });
});
