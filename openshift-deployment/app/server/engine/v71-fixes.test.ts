/**
 * Tests unitaires pour COMPLEO v7.1 — 4 FIX qualité génération.
 * FIX B: Type retour void → inférence depuis voOutType
 * FIX A: SQL constants uniquement au niveau classe (private static final)
 * FIX C: Nom microservice = domaine EJB (CarteEJB → carte-service)
 * FIX D: Filtrer mots-clés Oracle dans détection de tables
 */
import { describe, it, expect } from "vitest";
import { parseEjbProject } from "../java-parser";
import { generateSpringBootProject } from "../spring-generator";
import { MicroserviceSplitter, buildParsedModules } from "./microservices/microservice-splitter";

// ─── Helpers ────────────────────────────────────────────────────────

function makeEjbSource(className: string, methods: string): string {
  return `
package ma.bmce.digital;

import javax.ejb.Stateless;
import javax.persistence.EntityManager;
import javax.persistence.PersistenceContext;

@Stateless
public class ${className} {

    @PersistenceContext
    private EntityManager em;

${methods}
}
`;
}

function makeServletSource(className: string, body: string): string {
  return `
package ma.bmce.digital;

import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

public class ${className} extends HttpServlet {
    ${body}
}
`;
}

// ─── FIX B: Type retour void → inférence depuis voOutType ───────────

describe("FIX B — Return type inference from voOutType", () => {
  it("should infer List<String> return type for getCartesActives", () => {
    const ir = parseEjbProject([
      {
        path: "src/CarteEJB.java",
        content: makeEjbSource("CarteEJB", `
    public List<String> getCartesActives(String numCompte) {
        return em.createQuery("SELECT c.numCarte FROM T_CARTE c WHERE c.numCompte = :num AND c.statut = 'ACTIVE'", String.class)
            .setParameter("num", numCompte)
            .getResultList();
    }
`),
      },
    ]);

    const result = generateSpringBootProject(ir, "ma.bmce.digital.carte");
    const serviceFile = result.files.find(f => f.path.includes("Service.java") && !f.path.includes("Test"));

    expect(serviceFile).toBeDefined();
    // The return type should NOT be void — it should be List<String> or similar
    expect(serviceFile!.content).not.toMatch(/public void getCartesActives/);
    // Should contain a non-void return type
    expect(serviceFile!.content).toMatch(/public (List<String>|String) /);
  });

  it("should infer MouvementsResponseDTO return type for consulterMouvements", () => {
    const ir = parseEjbProject([
      {
        path: "src/CompteEJB.java",
        content: makeEjbSource("CompteEJB", `
    public MouvementsResponseDTO consulterMouvements(String numCompte) {
        // Query mouvements
        return new MouvementsResponseDTO();
    }
`),
      },
    ]);

    const result = generateSpringBootProject(ir, "ma.bmce.digital.compte");
    const serviceFile = result.files.find(f => f.path.includes("Service.java") && !f.path.includes("Test"));

    expect(serviceFile).toBeDefined();
    // Should NOT be void
    expect(serviceFile!.content).not.toMatch(/public void consulterMouvements/);
    // Should have MouvementsResponseDTO as return type
    expect(serviceFile!.content).toMatch(/MouvementsResponseDTO/);
  });

  it("should keep void for methods that truly return void", () => {
    const ir = parseEjbProject([
      {
        path: "src/NotificationEJB.java",
        content: makeEjbSource("NotificationEJB", `
    public void envoyerNotification(String message) {
        // Send notification
        System.out.println(message);
    }
`),
      },
    ]);

    const result = generateSpringBootProject(ir, "ma.bmce.digital.notification");
    const serviceFile = result.files.find(f => f.path.includes("Service.java") && !f.path.includes("Test"));

    expect(serviceFile).toBeDefined();
    expect(serviceFile!.content).toMatch(/public void envoyerNotification/);
  });

  it("should infer return type in controller too (ResponseEntity<List<String>>)", () => {
    const ir = parseEjbProject([
      {
        path: "src/CarteEJB.java",
        content: makeEjbSource("CarteEJB", `
    public List<String> getCartesActives(String numCompte) {
        return em.createQuery("SELECT c.numCarte FROM T_CARTE c", String.class).getResultList();
    }
`),
      },
    ]);

    const result = generateSpringBootProject(ir, "ma.bmce.digital.carte");
    const controllerFile = result.files.find(f => f.path.includes("Controller.java") && !f.path.includes("Test"));

    expect(controllerFile).toBeDefined();
    // Controller should have ResponseEntity<List<String>> not ResponseEntity<Void>
    expect(controllerFile!.content).not.toMatch(/ResponseEntity<Void>/);
    expect(controllerFile!.content).toMatch(/ResponseEntity<List<String>>/);
  });
});

// ─── FIX A: SQL constants uniquement au niveau classe ───────────────

describe("FIX A — SQL constants only at class level", () => {
  it("should have SQL constants as private static final at class level", () => {
    const ir = parseEjbProject([
      {
        path: "src/CompteEJB.java",
        content: makeEjbSource("CompteEJB", `
    private static final String SQL_SOLDE = "SELECT solde FROM T_COMPTE WHERE num_compte = ?";
    private static final String SQL_UPDATE = "UPDATE T_COMPTE SET solde = ? WHERE num_compte = ?";

    public BigDecimal consulterSolde(String numCompte) {
        return (BigDecimal) em.createNativeQuery(SQL_SOLDE)
            .setParameter(1, numCompte)
            .getSingleResult();
    }
`),
      },
    ]);

    const result = generateSpringBootProject(ir, "ma.bmce.digital.compte");
    const serviceFile = result.files.find(f => f.path.includes("Service.java") && !f.path.includes("Test"));

    expect(serviceFile).toBeDefined();
    const content = serviceFile!.content;

    // Should have class-level constants
    expect(content).toMatch(/private static final String SQL_SOLDE/);

    // Should NOT have method-level constants (final String SQL_SOLDE = ...)
    const methodBodyMatch = content.match(/public .+ consulterSolde[\s\S]*?\n    \}/);
    if (methodBodyMatch) {
      expect(methodBodyMatch[0]).not.toMatch(/final String SQL_SOLDE/);
      expect(methodBodyMatch[0]).not.toMatch(/Migrated constant from/);
    }
  });

  it("should deduplicate constants shared across multiple methods", () => {
    const ir = parseEjbProject([
      {
        path: "src/CompteEJB.java",
        content: makeEjbSource("CompteEJB", `
    private static final String SQL_COMPTE = "SELECT * FROM T_COMPTE WHERE num = ?";

    public String consulterSolde(String numCompte) {
        return em.createNativeQuery(SQL_COMPTE).setParameter(1, numCompte).getSingleResult().toString();
    }

    public String consulterMouvements(String numCompte) {
        return em.createNativeQuery(SQL_COMPTE).setParameter(1, numCompte).getSingleResult().toString();
    }
`),
      },
    ]);

    const result = generateSpringBootProject(ir, "ma.bmce.digital.compte");
    const serviceFile = result.files.find(f => f.path.includes("Service.java") && !f.path.includes("Test"));

    expect(serviceFile).toBeDefined();
    const content = serviceFile!.content;

    // Count occurrences of SQL_COMPTE declaration — should be exactly 1
    const matches = content.match(/private static final String SQL_COMPTE/g);
    expect(matches).toBeDefined();
    expect(matches!.length).toBe(1);
  });
});

// ─── FIX C: Nom microservice = domaine EJB ──────────────────────────

describe("FIX C — Microservice name = EJB domain", () => {
  it("should name microservice 'carte-service' not 'carteejb_getcartesactives-service'", () => {
    const ir = parseEjbProject([
      {
        path: "src/CarteEJB.java",
        content: makeEjbSource("CarteEJB", `
    public List<String> getCartesActives(String numCompte) {
        return em.createQuery("SELECT c FROM T_CARTE c", String.class).getResultList();
    }

    public void bloquerCarte(String numCarte) {
        em.createNativeQuery("UPDATE T_CARTE SET statut = 'BLOQUE' WHERE num_carte = ?")
            .setParameter(1, numCarte).executeUpdate();
    }
`),
      },
    ]);

    const splitter = new MicroserviceSplitter();
    const services = splitter.split(ir);

    // Should have 1 service named "carte-service" not "carteejb_getcartesactives-service"
    const carteService = services.find(s => s.name.includes("carte"));
    expect(carteService).toBeDefined();
    expect(carteService!.name).toBe("carte-service");
    expect(carteService!.name).not.toContain("_");
  });

  it("should name microservice 'compte-service' not 'compteejb_consultersolde-service'", () => {
    const ir = parseEjbProject([
      {
        path: "src/CompteEJB.java",
        content: makeEjbSource("CompteEJB", `
    public String consulterSolde(String numCompte) {
        return em.createNativeQuery("SELECT solde FROM T_COMPTE WHERE num = ?")
            .setParameter(1, numCompte).getSingleResult().toString();
    }

    public List<String> consulterMouvements(String numCompte) {
        return em.createQuery("SELECT m FROM T_MOUVEMENT m WHERE m.numCompte = :num", String.class)
            .setParameter("num", numCompte).getResultList();
    }
`),
      },
    ]);

    const splitter = new MicroserviceSplitter();
    const services = splitter.split(ir);

    const compteService = services.find(s => s.name.includes("compte"));
    expect(compteService).toBeDefined();
    expect(compteService!.name).toBe("compte-service");
    expect(compteService!.name).not.toContain("_");
  });

  it("should group multiple EJBs of same domain into one service", () => {
    const ir = parseEjbProject([
      {
        path: "src/CarteEJB.java",
        content: makeEjbSource("CarteEJB", `
    public List<String> getCartesActives(String numCompte) {
        return em.createQuery("SELECT c FROM T_CARTE c", String.class).getResultList();
    }
`),
      },
      {
        path: "src/ConfigCarteEJB.java",
        content: makeEjbSource("ConfigCarteEJB", `
    public String getConfigCarte(String numCarte) {
        return em.createNativeQuery("SELECT config FROM T_CONFIG_CARTE WHERE num_carte = ?")
            .setParameter(1, numCarte).getSingleResult().toString();
    }
`),
      },
    ]);

    const splitter = new MicroserviceSplitter();
    const services = splitter.split(ir);

    // Both should be in carte-related services, not separate services with _ names
    for (const s of services) {
      expect(s.name).not.toContain("_");
    }
  });
});

// ─── FIX D: Filtrer mots-clés Oracle dans détection de tables ───────

describe("FIX D — Filter Oracle keywords from table detection", () => {
  it("should NOT detect DUAL as a table", () => {
    const ir = parseEjbProject([
      {
        path: "src/SequenceEJB.java",
        content: makeEjbSource("SequenceEJB", `
    public Long getNextId() {
        return ((Number) em.createNativeQuery("SELECT SEQ_COMPTE.NEXTVAL FROM DUAL").getSingleResult()).longValue();
    }
`),
      },
    ]);

    const splitter = new MicroserviceSplitter();
    const services = splitter.split(ir);

    for (const s of services) {
      expect(s.ownedTables).not.toContain("DUAL");
      expect(s.readOnlyTables).not.toContain("DUAL");
    }
  });

  it("should NOT detect SYSDATE, ROWNUM, NEXTVAL, CURRVAL as tables", () => {
    const ir = parseEjbProject([
      {
        path: "src/ReportingEJB.java",
        content: makeEjbSource("ReportingEJB", `
    public String genererRapport() {
        return em.createNativeQuery(
            "SELECT * FROM T_RAPPORT WHERE date_creation >= SYSDATE - 30 AND ROWNUM <= 100"
        ).getSingleResult().toString();
    }
`),
      },
    ]);

    const splitter = new MicroserviceSplitter();
    const services = splitter.split(ir);

    const oracleKeywords = ["SYSDATE", "ROWNUM", "NEXTVAL", "CURRVAL", "NOWAIT", "DUAL"];
    for (const s of services) {
      for (const kw of oracleKeywords) {
        expect(s.ownedTables).not.toContain(kw);
        expect(s.readOnlyTables).not.toContain(kw);
      }
      // Should still detect T_RAPPORT as a real table
      const allTables = [...s.ownedTables, ...s.readOnlyTables];
      if (s.ejbs.some(e => e.toLowerCase().includes("reporting"))) {
        expect(allTables).toContain("T_RAPPORT");
      }
    }
  });

  it("should NOT detect NVL, DECODE, COALESCE as tables", () => {
    const ir = parseEjbProject([
      {
        path: "src/CompteEJB.java",
        content: makeEjbSource("CompteEJB", `
    public String consulterSolde(String numCompte) {
        return em.createNativeQuery(
            "SELECT NVL(solde, 0), DECODE(statut, 1, 'ACTIF', 'INACTIF'), COALESCE(libelle, 'N/A') FROM T_COMPTE WHERE num = ?"
        ).setParameter(1, numCompte).getSingleResult().toString();
    }
`),
      },
    ]);

    const splitter = new MicroserviceSplitter();
    const services = splitter.split(ir);

    for (const s of services) {
      expect(s.ownedTables).not.toContain("NVL");
      expect(s.ownedTables).not.toContain("DECODE");
      expect(s.ownedTables).not.toContain("COALESCE");
      expect(s.readOnlyTables).not.toContain("NVL");
      expect(s.readOnlyTables).not.toContain("DECODE");
      expect(s.readOnlyTables).not.toContain("COALESCE");
    }
  });

  it("should still detect real tables alongside Oracle keywords", () => {
    const ir = parseEjbProject([
      {
        path: "src/VirementEJB.java",
        content: makeEjbSource("VirementEJB", `
    public void initierVirement(String numCompte, BigDecimal montant) {
        em.createNativeQuery(
            "INSERT INTO T_VIREMENT (id, num_compte, montant, date_creation) VALUES (SEQ_VIREMENT.NEXTVAL, ?, ?, SYSDATE)"
        ).setParameter(1, numCompte).setParameter(2, montant).executeUpdate();

        em.createNativeQuery(
            "UPDATE T_COMPTE SET solde = solde - ? WHERE num_compte = ? AND ROWNUM = 1 FOR UPDATE NOWAIT"
        ).setParameter(1, montant).setParameter(2, numCompte).executeUpdate();
    }
`),
      },
    ]);

    const splitter = new MicroserviceSplitter();
    const services = splitter.split(ir);

    // Should detect T_VIREMENT and T_COMPTE as real tables
    const allTables = services.flatMap(s => [...s.ownedTables, ...s.readOnlyTables]);
    expect(allTables).toContain("T_VIREMENT");
    expect(allTables).toContain("T_COMPTE");

    // Should NOT contain Oracle keywords
    expect(allTables).not.toContain("DUAL");
    expect(allTables).not.toContain("SYSDATE");
    expect(allTables).not.toContain("NOWAIT");
    expect(allTables).not.toContain("NEXTVAL");
    expect(allTables).not.toContain("ROWNUM");
  });
});
