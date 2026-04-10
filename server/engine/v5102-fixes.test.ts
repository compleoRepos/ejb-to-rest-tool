/**
 * v5.10.2 — Tests for:
 *   1. isDao() fix: @Stateless with EntityManager + business methods → NOT a DAO
 *   2. extractMethodBody(): extract named method body from Java source
 *   3. service-gen: direct EJB UseCases produce migrated code (not UnsupportedOperationException)
 */
import { describe, it, expect } from "vitest";
import { parseEjbProject, type ProjectIR } from "../java-parser";
import { extractMethodBody } from "./BusinessLogicTransformer";

// ─── Test fixtures ──────────────────────────────────────────────────────────

const DIRECT_EJB_WITH_ENTITY_MANAGER = `
package com.bank.ejb;

import javax.ejb.Stateless;
import javax.persistence.EntityManager;
import javax.persistence.PersistenceContext;

@Stateless
public class CompteEJB {

    @PersistenceContext
    private EntityManager em;

    /**
     * Consulter le solde d'un compte.
     */
    public ConsulterSoldeVoOut consulterSolde(ConsulterSoldeVoIn voIn) {
        String numCompte = voIn.getNumeroCompte();
        Compte compte = em.find(Compte.class, numCompte);
        ConsulterSoldeVoOut voOut = new ConsulterSoldeVoOut();
        voOut.setSolde(compte.getSolde());
        voOut.setDevise(compte.getDevise());
        return voOut;
    }

    /**
     * Consulter les mouvements d'un compte.
     */
    public MouvementsVoOut consulterMouvements(MouvementsVoIn voIn) {
        List<Mouvement> mouvements = em.createQuery(
            "SELECT m FROM Mouvement m WHERE m.compte.numero = :num", Mouvement.class)
            .setParameter("num", voIn.getNumeroCompte())
            .getResultList();
        MouvementsVoOut voOut = new MouvementsVoOut();
        voOut.setMouvements(mouvements);
        return voOut;
    }

    // Lifecycle methods — should be excluded
    public void ejbCreate() {}
    public void ejbRemove() {}
}
`;

const PURE_DAO_WITH_ENTITY_MANAGER = `
package com.bank.dao;

import javax.ejb.Stateless;
import javax.persistence.EntityManager;
import javax.persistence.PersistenceContext;

@Stateless
public class CompteDAO {

    @PersistenceContext
    private EntityManager em;

    public Compte findByNumero(String numero) {
        return em.find(Compte.class, numero);
    }
}
`;

const VIREMENT_EJB = `
package com.bank.ejb;

import javax.ejb.Stateless;
import javax.ejb.EJB;

@Stateless
public class VirementEJB {

    @EJB
    private CompteDAO compteDAO;

    /**
     * Initier un virement entre deux comptes.
     */
    public InitierVirementVoOut initierVirement(InitierVirementVoIn voIn) {
        Compte source = compteDAO.findByNumero(voIn.getCompteSource());
        Compte dest = compteDAO.findByNumero(voIn.getCompteDest());
        double montant = voIn.getMontant();
        source.debiter(montant);
        dest.crediter(montant);
        InitierVirementVoOut voOut = new InitierVirementVoOut();
        voOut.setCodeRetour("000");
        voOut.setMessageRetour("Virement effectue");
        return voOut;
    }
}
`;

const POM_XML = `<?xml version="1.0"?>
<project>
  <groupId>com.bank</groupId>
  <artifactId>banking-ejb</artifactId>
  <version>1.0.0</version>
  <packaging>ejb</packaging>
  <properties><java.version>11</java.version></properties>
</project>`;

// ─── Test: isDao() fix ──────────────────────────────────────────────────────

describe("v5.10.2 — isDao() fix for @Stateless with EntityManager", () => {
  it("should detect CompteEJB as direct EJB (NOT DAO) despite EntityManager", () => {
    const files = [
      { path: "pom.xml", content: POM_XML },
      { path: "src/main/java/com/bank/ejb/CompteEJB.java", content: DIRECT_EJB_WITH_ENTITY_MANAGER },
    ];
    const ir = parseEjbProject(files, "banking-ejb");
    // Should detect 2 UseCases: consulterSolde + consulterMouvements
    expect(ir.useCases.length).toBeGreaterThanOrEqual(2);
    const ucNames = ir.useCases.map(uc => uc.className);
    expect(ucNames).toContain("CompteEJB_consulterSolde");
    expect(ucNames).toContain("CompteEJB_consulterMouvements");
  });

  it("should still detect CompteDAO as a DAO (excluded from UseCases)", () => {
    const files = [
      { path: "pom.xml", content: POM_XML },
      { path: "src/main/java/com/bank/dao/CompteDAO.java", content: PURE_DAO_WITH_ENTITY_MANAGER },
    ];
    const ir = parseEjbProject(files, "banking-ejb");
    // CompteDAO should NOT produce UseCases (it's a DAO by name)
    const ucNames = ir.useCases.map(uc => uc.className);
    expect(ucNames.some(n => n.includes("CompteDAO"))).toBe(false);
  });

  it("should detect VirementEJB without EntityManager as direct EJB", () => {
    const files = [
      { path: "pom.xml", content: POM_XML },
      { path: "src/main/java/com/bank/ejb/VirementEJB.java", content: VIREMENT_EJB },
    ];
    const ir = parseEjbProject(files, "banking-ejb");
    expect(ir.useCases.length).toBe(1);
    expect(ir.useCases[0].className).toBe("VirementEJB_initierVirement");
  });

  it("should detect all UseCases in a multi-EJB project", () => {
    const files = [
      { path: "pom.xml", content: POM_XML },
      { path: "src/main/java/com/bank/ejb/CompteEJB.java", content: DIRECT_EJB_WITH_ENTITY_MANAGER },
      { path: "src/main/java/com/bank/ejb/VirementEJB.java", content: VIREMENT_EJB },
      { path: "src/main/java/com/bank/dao/CompteDAO.java", content: PURE_DAO_WITH_ENTITY_MANAGER },
    ];
    const ir = parseEjbProject(files, "banking-ejb");
    // Should have 3 UseCases: consulterSolde, consulterMouvements, initierVirement
    // CompteDAO should be excluded
    expect(ir.useCases.length).toBe(3);
    const ucNames = ir.useCases.map(uc => uc.className);
    expect(ucNames).toContain("CompteEJB_consulterSolde");
    expect(ucNames).toContain("CompteEJB_consulterMouvements");
    expect(ucNames).toContain("VirementEJB_initierVirement");
    expect(ucNames.some(n => n.includes("CompteDAO"))).toBe(false);
  });
});

// ─── Test: extractMethodBody() ──────────────────────────────────────────────

describe("v5.10.2 — extractMethodBody()", () => {
  it("should extract consulterSolde body from CompteEJB", () => {
    const body = extractMethodBody(DIRECT_EJB_WITH_ENTITY_MANAGER, "consulterSolde");
    expect(body).not.toBeNull();
    expect(body).toContain("getNumeroCompte");
    expect(body).toContain("em.find");
    expect(body).toContain("setSolde");
  });

  it("should extract consulterMouvements body from CompteEJB", () => {
    const body = extractMethodBody(DIRECT_EJB_WITH_ENTITY_MANAGER, "consulterMouvements");
    expect(body).not.toBeNull();
    expect(body).toContain("createQuery");
    expect(body).toContain("getResultList");
  });

  it("should extract initierVirement body from VirementEJB", () => {
    const body = extractMethodBody(VIREMENT_EJB, "initierVirement");
    expect(body).not.toBeNull();
    expect(body).toContain("compteDAO.findByNumero");
    expect(body).toContain("debiter");
    expect(body).toContain("crediter");
  });

  it("should return null for non-existent method", () => {
    const body = extractMethodBody(DIRECT_EJB_WITH_ENTITY_MANAGER, "nonExistentMethod");
    expect(body).toBeNull();
  });

  it("should return null for lifecycle methods (too short body)", () => {
    const body = extractMethodBody(DIRECT_EJB_WITH_ENTITY_MANAGER, "ejbCreate");
    expect(body).toBeNull();
  });
});

// ─── Test: VoIn/VoOut resolution for direct EJB ─────────────────────────────

describe("v5.10.2 — VoIn/VoOut resolution for direct EJB UseCases", () => {
  it("should resolve voInType and voOutType from method signature", () => {
    const files = [
      { path: "pom.xml", content: POM_XML },
      { path: "src/main/java/com/bank/ejb/CompteEJB.java", content: DIRECT_EJB_WITH_ENTITY_MANAGER },
    ];
    const ir = parseEjbProject(files, "banking-ejb");
    const ucSolde = ir.useCases.find(uc => uc.className === "CompteEJB_consulterSolde");
    expect(ucSolde).toBeDefined();
    expect(ucSolde!.voInType).toBe("ConsulterSoldeVoIn");
    expect(ucSolde!.voOutType).toBe("ConsulterSoldeVoOut");

    const ucMvt = ir.useCases.find(uc => uc.className === "CompteEJB_consulterMouvements");
    expect(ucMvt).toBeDefined();
    expect(ucMvt!.voInType).toBe("MouvementsVoIn");
    expect(ucMvt!.voOutType).toBe("MouvementsVoOut");
  });

  it("should include rawSource for business logic extraction", () => {
    const files = [
      { path: "pom.xml", content: POM_XML },
      { path: "src/main/java/com/bank/ejb/VirementEJB.java", content: VIREMENT_EJB },
    ];
    const ir = parseEjbProject(files, "banking-ejb");
    const uc = ir.useCases.find(uc => uc.className === "VirementEJB_initierVirement");
    expect(uc).toBeDefined();
    expect(uc!.rawSource).toContain("initierVirement");
    expect(uc!.rawSource).toContain("compteDAO.findByNumero");
  });
});
