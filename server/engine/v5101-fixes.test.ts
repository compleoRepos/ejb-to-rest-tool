/**
 * Tests unitaires v5.10.1 — 2 FIX ciblés.
 * FIX 1: Détection UseCase dans EJB directs @Stateless (stratégie 2 — >= 1 méthode business)
 * FIX 4b: Noms de méthodes Java valides depuis routes Servlet (sanitizeJavaMethodName)
 *
 * @author Hamza NORDINE
 */
import { describe, it, expect } from "vitest";
import { parseEjbProject } from "../java-parser";
import { ServletDetector } from "./detectors/servlet-detector";
import { ServletGenerator } from "./generators/servlet-generator";

// ═══════════════════════════════════════════════════════════════
// FIX 1 — Détection UseCase dans EJB directs @Stateless
// ═══════════════════════════════════════════════════════════════

describe("FIX 1 v5.10.1 — Détection UseCase EJB direct (stratégie 2)", () => {

  it("devrait détecter un EJB @Stateless avec UNE SEULE méthode business", () => {
    // Cas critique : 1 seule méthode → doit quand même être détecté
    const files = [{
      path: "CompteEJB.java",
      content: `package ma.bmce.si.compte;

import javax.ejb.Stateless;

@Stateless
public class CompteEJB {

    public ConsulterSoldeVoOut consulterSolde(ConsulterSoldeVoIn v) {
        // logique Oracle
        return new ConsulterSoldeVoOut();
    }
}`,
    }];

    const ir = parseEjbProject(files);
    expect(ir.useCases.length).toBe(1);
    expect(ir.useCases[0].className).toBe("CompteEJB_consulterSolde");
    expect(ir.useCases[0].voInType).toBe("ConsulterSoldeVoIn");
    expect(ir.useCases[0].voOutType).toBe("ConsulterSoldeVoOut");
  });

  it("devrait détecter un EJB @Stateless avec PLUSIEURS méthodes business", () => {
    // Cas du projet final : CompteEJB avec consulterSolde + consulterMouvements
    const files = [{
      path: "CompteEJB.java",
      content: `package ma.bmce.si.compte;

import javax.ejb.Stateless;

@Stateless
public class CompteEJB {

    /** Consulter le solde d'un compte */
    public ConsulterSoldeVoOut consulterSolde(ConsulterSoldeVoIn v) {
        return new ConsulterSoldeVoOut();
    }

    /** Consulter les mouvements d'un compte */
    public MouvementsVoOut consulterMouvements(MouvementsVoIn v) {
        return new MouvementsVoOut();
    }
}`,
    }];

    const ir = parseEjbProject(files);
    const directUCs = ir.useCases.filter(
      (uc: any) => uc.className.startsWith("CompteEJB_")
    );
    expect(directUCs.length).toBe(2);
    expect(directUCs.map((uc: any) => uc.className).sort()).toEqual([
      "CompteEJB_consulterMouvements",
      "CompteEJB_consulterSolde",
    ]);
  });

  it("devrait détecter un @Stateful EJB comme direct EJB", () => {
    const files = [{
      path: "PanierEJB.java",
      content: `package ma.bmce.si.panier;

import javax.ejb.Stateful;

@Stateful
public class PanierEJB {

    public void ajouterArticle(String article) {
        // ajouter
    }

    public String validerPanier() {
        return "OK";
    }
}`,
    }];

    const ir = parseEjbProject(files);
    const directUCs = ir.useCases.filter(
      (uc: any) => uc.className.startsWith("PanierEJB_")
    );
    expect(directUCs.length).toBe(2);
  });

  it("devrait exclure les getters/setters triviaux des méthodes business", () => {
    const files = [{
      path: "ConfigEJB.java",
      content: `package ma.bmce.si.config;

import javax.ejb.Stateless;

@Stateless
public class ConfigEJB {

    private String value;

    public String getValue() {
        return value;
    }

    public void setValue(String v) {
        this.value = v;
    }

    public boolean isActive() {
        return true;
    }

    /** Méthode business réelle */
    public ConfigResult chargerConfiguration(ConfigRequest req) {
        return new ConfigResult();
    }
}`,
    }];

    const ir = parseEjbProject(files);
    const directUCs = ir.useCases.filter(
      (uc: any) => uc.className.startsWith("ConfigEJB_")
    );
    // Seule chargerConfiguration doit être détectée
    expect(directUCs.length).toBe(1);
    expect(directUCs[0].className).toBe("ConfigEJB_chargerConfiguration");
  });

  it("devrait NE PAS détecter un DAO @Stateless comme UseCase", () => {
    const files = [{
      path: "CompteDAO.java",
      content: `package ma.bmce.si.dao;

import javax.ejb.Stateless;
import javax.persistence.EntityManager;
import javax.persistence.PersistenceContext;

@Stateless
public class CompteDAO {

    @PersistenceContext
    private EntityManager em;

    public Object findById(String id) {
        return em.find(Object.class, id);
    }
}`,
    }];

    const ir = parseEjbProject(files);
    expect(ir.useCases.length).toBe(0);
  });

  it("devrait NE PAS détecter un @Stateless avec BaseUseCase comme direct EJB", () => {
    const files = [{
      path: "ActiverCarteUC.java",
      content: `package ma.bmce.si.carte;

import javax.ejb.Stateless;

@Stateless
public class ActiverCarteUC implements BaseUseCase<ActiverCarteVoIn, ActiverCarteVoOut> {
    @Override
    public ActiverCarteVoOut execute(ActiverCarteVoIn voIn) {
        return new ActiverCarteVoOut();
    }
}`,
    }];

    const ir = parseEjbProject(files);
    // Doit être détecté par isUseCase (BOA pattern), pas par isDirectEjb
    expect(ir.useCases.length).toBe(1);
    expect(ir.useCases[0].className).toBe("ActiverCarteUC");
  });

  it("devrait produire le bon voInType et voOutType pour chaque méthode", () => {
    const files = [{
      path: "VirementEJB.java",
      content: `package ma.bmce.si.virement;

import javax.ejb.Stateless;

@Stateless
public class VirementEJB {

    public InitierVirementVoOut initierVirement(InitierVirementVoIn voIn) throws VirementException {
        return new InitierVirementVoOut();
    }

    public void annulerVirement(String reference) {
        // annulation
    }
}`,
    }];

    const ir = parseEjbProject(files);
    const initier = ir.useCases.find((uc: any) => uc.className === "VirementEJB_initierVirement");
    const annuler = ir.useCases.find((uc: any) => uc.className === "VirementEJB_annulerVirement");

    expect(initier).toBeDefined();
    expect(initier!.voInType).toBe("InitierVirementVoIn");
    expect(initier!.voOutType).toBe("InitierVirementVoOut");
    expect((initier as any).exceptionsThrown).toContain("VirementException");

    expect(annuler).toBeDefined();
    expect(annuler!.voInType).toBe("String");
    expect(annuler!.voOutType).toBe("Void");
  });

  it("devrait détecter le scénario complet du projet final (7 UseCases)", () => {
    const files = [
      {
        path: "CompteEJB.java",
        content: `package ma.bmce.si.compte;
import javax.ejb.Stateless;
@Stateless
public class CompteEJB {
    public ConsulterSoldeVoOut consulterSolde(ConsulterSoldeVoIn v) { return null; }
    public MouvementsVoOut consulterMouvements(MouvementsVoIn v) { return null; }
}`,
      },
      {
        path: "VirementEJB.java",
        content: `package ma.bmce.si.virement;
import javax.ejb.Stateless;
@Stateless
public class VirementEJB {
    public InitierVirementVoOut initierVirement(InitierVirementVoIn v) { return null; }
}`,
      },
      {
        path: "CarteEJB.java",
        content: `package ma.bmce.si.carte;
import javax.ejb.Stateless;
@Stateless
public class CarteEJB {
    public ActiverCarteVoOut activerCarte(ActiverCarteVoIn v) { return null; }
    public BloquerCarteVoOut bloquerCarte(BloquerCarteVoIn v) { return null; }
}`,
      },
      {
        path: "ReportingEJB.java",
        content: `package ma.bmce.si.reporting;
import javax.ejb.Stateless;
@Stateless
public class ReportingEJB {
    public RapportBamVoOut genererRapportBam(RapportBamVoIn v) { return null; }
    public HistoriqueVoOut getHistoriqueClientComplet(HistoriqueVoIn v) { return null; }
}`,
      },
    ];

    const ir = parseEjbProject(files);
    expect(ir.useCases.length).toBe(7);
    expect(ir.stats.useCaseCount).toBe(7);
  });
});

// ═══════════════════════════════════════════════════════════════
// FIX 4b — Noms de méthodes Java valides depuis routes Servlet
// ═══════════════════════════════════════════════════════════════

describe("FIX 4b v5.10.1 — Noms de méthodes Java valides (servlet routes)", () => {
  const detector = new ServletDetector();
  const generator = new ServletGenerator();

  it("devrait produire des noms de méthodes Java valides (pas de / dans le nom)", () => {
    const content = `
package ma.bmce.si.web;

import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import javax.servlet.annotation.WebServlet;

@WebServlet("/auth/*")
public class AuthenticationServlet extends HttpServlet {

    protected void doPost(HttpServletRequest request, HttpServletResponse response) {
        String path = request.getServletPath();
        if (path.equals("/api/connexion")) {
            // connexion
        } else if (path.equals("/api/deconnexion")) {
            // deconnexion
        }
    }
}`;

    const components = detector.detect(content, "AuthenticationServlet.java");
    const files = generator.generate(components[0], components, "ma.bmce.si.auth");

    const ctrlFile = files.find(f => f.category === "controller");
    expect(ctrlFile).toBeDefined();

    // Vérifier que les noms de méthodes ne contiennent PAS de /
    expect(ctrlFile!.content).not.toMatch(/public ResponseEntity<\?> .*\/.*/);

    // Vérifier que les noms sont des identifiants Java valides
    expect(ctrlFile!.content).toContain("connexion");
    expect(ctrlFile!.content).toContain("deconnexion");

    // Vérifier les @PostMapping
    expect(ctrlFile!.content).toContain("@PostMapping");
  });

  it("devrait nettoyer les routes avec /api/v1/ prefix", () => {
    const content = `
package ma.bmce.si.web;

import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

public class CompteServlet extends HttpServlet {

    protected void doGet(HttpServletRequest request, HttpServletResponse response) {
        String path = request.getServletPath();
        if (path.equals("/api/v1/comptes")) {
            // liste comptes
        } else if (path.equals("/api/v2/solde")) {
            // solde v2
        }
    }
}`;

    const components = detector.detect(content, "CompteServlet.java");
    const files = generator.generate(components[0], components, "ma.bmce.si.compte");

    const ctrlFile = files.find(f => f.category === "controller");
    expect(ctrlFile).toBeDefined();

    // Les noms ne doivent pas contenir de /
    expect(ctrlFile!.content).not.toMatch(/public ResponseEntity<\?> .*\/.*/);

    // Le service aussi ne doit pas contenir de /
    const svcFile = files.find(f => f.category === "service");
    expect(svcFile).toBeDefined();
    expect(svcFile!.content).not.toMatch(/public Object .*\/.*/);
  });

  it("devrait gérer les routes avec double slash //api/xxx", () => {
    const content = `
package ma.bmce.si.web;

import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

public class DoubleSlashServlet extends HttpServlet {

    protected void doPost(HttpServletRequest request, HttpServletResponse response) {
        String path = request.getServletPath();
        if (path.equals("//api/inscription")) {
            // inscription
        }
    }
}`;

    const components = detector.detect(content, "DoubleSlashServlet.java");
    const files = generator.generate(components[0], components, "ma.bmce.si.web");

    const ctrlFile = files.find(f => f.category === "controller");
    expect(ctrlFile).toBeDefined();

    // Pas de / dans les noms de méthodes
    expect(ctrlFile!.content).not.toMatch(/public ResponseEntity<\?> .*\/.*/);
    // Le nom doit être nettoyé
    expect(ctrlFile!.content).toContain("inscription");
  });

  it("devrait conserver les noms valides sans modification (handleGet, handlePost)", () => {
    const content = `
package ma.bmce.si.web;

import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

public class SimpleServlet extends HttpServlet {

    protected void doGet(HttpServletRequest request, HttpServletResponse response) {
        response.getWriter().write("Hello");
    }
}`;

    const components = detector.detect(content, "SimpleServlet.java");
    const files = generator.generate(components[0], components, "ma.bmce.si.web");

    const ctrlFile = files.find(f => f.category === "controller");
    expect(ctrlFile).toBeDefined();
    // Le nom doit rester handleGet (pas de nettoyage nécessaire)
    expect(ctrlFile!.content).toContain("handleGet");
  });

  it("devrait gérer les routes avec {params} et les supprimer du nom", () => {
    const content = `
package ma.bmce.si.web;

import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

public class DetailServlet extends HttpServlet {

    protected void doGet(HttpServletRequest request, HttpServletResponse response) {
        String path = request.getServletPath();
        if (path.equals("/api/comptes/{id}/solde")) {
            // solde par id
        }
    }
}`;

    const components = detector.detect(content, "DetailServlet.java");
    const files = generator.generate(components[0], components, "ma.bmce.si.web");

    const ctrlFile = files.find(f => f.category === "controller");
    expect(ctrlFile).toBeDefined();
    // Le nom de méthode doit être handleGetComptesSolde (sans {id} ni api)
    expect(ctrlFile!.content).toContain("handleGetComptesSolde");
    // Vérifier que le nom de méthode ne contient pas de / ou { directement
    const methodNameMatch = ctrlFile!.content.match(/public ResponseEntity<\?> (\w+)\(/);
    expect(methodNameMatch).toBeTruthy();
    expect(methodNameMatch![1]).not.toMatch(/[\/\{\}]/);
    expect(methodNameMatch![1]).toBe("handleGetComptesSolde");
  });

  it("devrait aussi nettoyer les noms dans le Service généré", () => {
    const content = `
package ma.bmce.si.web;

import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import javax.servlet.annotation.WebServlet;

@WebServlet("/api/auth")
public class AuthServlet extends HttpServlet {

    protected void doPost(HttpServletRequest request, HttpServletResponse response) {
        String path = request.getServletPath();
        if (path.equals("/api/login")) {
            // login
        } else if (path.equals("/api/logout")) {
            // logout
        }
    }
}`;

    const components = detector.detect(content, "AuthServlet.java");
    const files = generator.generate(components[0], components, "ma.bmce.si.auth");

    const svcFile = files.find(f => f.category === "service");
    expect(svcFile).toBeDefined();
    // Pas de / dans les noms de méthodes du service
    expect(svcFile!.content).not.toMatch(/public Object .*\/.*/);
    expect(svcFile!.content).toContain("login");
    expect(svcFile!.content).toContain("logout");
  });

  it("devrait aussi nettoyer les noms dans les tests générés", () => {
    const content = `
package ma.bmce.si.web;

import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import javax.servlet.annotation.WebServlet;

@WebServlet("/api/data")
public class DataServlet extends HttpServlet {

    protected void doGet(HttpServletRequest request, HttpServletResponse response) {
        String path = request.getServletPath();
        if (path.equals("/api/export")) {
            // export
        }
    }
}`;

    const components = detector.detect(content, "DataServlet.java");
    const files = generator.generate(components[0], components, "ma.bmce.si.data");

    const testFile = files.find(f => f.category === "test");
    expect(testFile).toBeDefined();
    // Les noms de test ne doivent pas contenir de /
    expect(testFile!.content).not.toMatch(/shouldReturn200For.*\//);
  });
});
