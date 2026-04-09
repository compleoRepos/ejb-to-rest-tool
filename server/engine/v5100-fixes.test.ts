/**
 * Tests unitaires v5.10.0 — 4 FIX majeurs.
 * FIX 1: Détection EJB direct multi-méthodes
 * FIX 2: Multi-DataSource dans application.yml
 * FIX 3: Dépendances Kafka + Batch conditionnelles
 * FIX 4: Servlet multi-route → Controller multi-endpoints
 */
import { describe, it, expect } from "vitest";
import { ServletDetector } from "./detectors/servlet-detector";
import { ServletGenerator } from "./generators/servlet-generator";
import { ConfigGenerator } from "./generators/ConfigGenerator";
import type { DataSourceInfo } from "./detectors/DataSourceDetector";
import { parseEjbProject, type ProjectIR } from "../java-parser";
import { generateSpringBootProject } from "../spring-generator";

// ─── Helper ────────────────────────────────────────────────────────────

function makeDsInfo(overrides: Partial<DataSourceInfo> = {}): DataSourceInfo {
  return {
    vendor: "ORACLE",
    jndiNames: [],
    urlPatterns: [],
    driverClass: null,
    tables: [],
    sequences: [],
    vendorSpecificFeatures: [],
    schemaHint: null,
    multiDataSource: false,
    namedDataSources: [],
    scores: {
      ORACLE: 20, MYSQL: 0, POSTGRESQL: 0, SQLSERVER: 0, DB2: 0,
      H2: 0, MARIADB: 0, SYBASE: 0, INFORMIX: 0, SQLITE: 0,
      MONGODB: 0, UNKNOWN: 0,
    },
    ...overrides,
  };
}

function makeIR(overrides: Partial<ProjectIR> = {}): ProjectIR {
  return {
    projectName: "test-project",
    groupId: "ma.bmce.si",
    artifactId: "test-project",
    useCases: [],
    dtos: [],
    enums: [],
    exceptions: [],
    validators: [],
    services: [],
    remoteInterfaces: [],
    batchJobs: [],
    warnings: [],
    stats: {
      totalFiles: 0,
      totalLines: 0,
      useCaseCount: 0,
      dtoCount: 0,
      serviceCount: 0,
      exceptionCount: 0,
      enumCount: 0,
    },
    ...overrides,
  } as ProjectIR;
}

// ─── FIX 1: Détection EJB direct multi-méthodes ────────────────────────

describe("FIX 1 — Détection EJB direct multi-méthodes", () => {
  // Note: This tests the java-parser.ts parseDirectEjbUseCases function
  // We test indirectly via the parseEjbProject function
  // parseEjbProject imported at top level

  it("devrait détecter un @Stateless EJB sans BaseUseCase comme direct EJB", () => {
    const files = [{
      path: "NotificationService.java",
      content: `package ma.bmce.si.notification;

import javax.ejb.Stateless;

@Stateless
public class NotificationService {

    public void envoyerEmail(String destinataire, String sujet) {
        // logique envoi email
    }

    public String consulterStatut(String id) {
        return "ENVOYE";
    }

    private void logAction(String action) {
        // méthode privée — ignorée
    }
}`,
    }];

    const ir = parseEjbProject(files);
    // Should detect 2 UseCases (envoyerEmail + consulterStatut), not the private method
    const directUseCases = ir.useCases.filter(
      (uc: any) => uc.className.startsWith("NotificationService_")
    );
    expect(directUseCases.length).toBe(2);
    expect(directUseCases.map((uc: any) => uc.className).sort()).toEqual(
      ["NotificationService_consulterStatut", "NotificationService_envoyerEmail"]
    );
  });

  it("ne devrait PAS détecter un @Stateless EJB avec BaseUseCase comme direct EJB", () => {
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
    // Standard UseCase detection — should find 1 UseCase via the normal path
    const standardUCs = ir.useCases.filter(
      (uc: any) => uc.className === "ActiverCarteUC"
    );
    expect(standardUCs.length).toBe(1);
  });

  it("devrait ignorer les méthodes lifecycle EJB (ejbCreate, ejbRemove, etc.)", () => {
    const files = [{
      path: "CompteBean.java",
      content: `package ma.bmce.si.compte;

import javax.ejb.Stateless;

@Stateless
public class CompteBean {

    public void ejbCreate() {}
    public void ejbRemove() {}
    public void ejbActivate() {}
    public void ejbPassivate() {}
    public void setSessionContext(Object ctx) {}

    public String consulterSolde(String numCompte) {
        return "1000.00";
    }

    public void cloturerCompte(String numCompte) {
        // cloturer
    }
}`,
    }];

    const ir = parseEjbProject(files);
    const directUCs = ir.useCases.filter(
      (uc: any) => uc.className.startsWith("CompteBean_")
    );
    // Only consulterSolde + cloturerCompte should be detected, not lifecycle methods
    expect(directUCs.length).toBe(2);
    expect(directUCs.map((uc: any) => uc.className).sort()).toEqual([
      "CompteBean_cloturerCompte", "CompteBean_consulterSolde"
    ]);
  });
});

// ─── FIX 2: Multi-DataSource dans application.yml ───────────────────────

describe("FIX 2 — Multi-DataSource dans application.yml", () => {
  const configGen = new ConfigGenerator();

  it("devrait générer des sections nommées pour chaque datasource", () => {
    const dsInfo = makeDsInfo({
      multiDataSource: true,
      namedDataSources: [
        {
          jndiName: "jdbc/compteDS",
          varName: "compteDataSource",
          vendor: "ORACLE",
          usedInClasses: ["CompteDAO", "VirementDAO"],
        },
        {
          jndiName: "jdbc/referentielDS",
          varName: "referentielDataSource",
          vendor: "MYSQL",
          usedInClasses: ["ReferentielDAO"],
        },
      ],
    });

    const ir = makeIR();
    const result = configGen.generateApplicationYml(ir, dsInfo);

    expect(result.content).toContain("Multi-DataSource Configuration");
    expect(result.content).toContain("2 datasources détectées");
    expect(result.content).toContain("jdbc/compteDS");
    expect(result.content).toContain("jdbc/referentielDS");
    expect(result.content).toContain("CompteDAO, VirementDAO");
    expect(result.content).toContain("COMPTEDATASOURCE_URL");
    expect(result.content).toContain("REFERENTIELDATASOURCE_URL");
  });

  it("ne devrait PAS générer de section multi-DS si multiDataSource est false", () => {
    const dsInfo = makeDsInfo({ multiDataSource: false });
    const ir = makeIR();
    const result = configGen.generateApplicationYml(ir, dsInfo);

    expect(result.content).not.toContain("Multi-DataSource Configuration");
  });
});

// ─── FIX 3: Dépendances Kafka + Batch conditionnelles ──────────────────

describe("FIX 3 — Dépendances Kafka + Batch conditionnelles", () => {
  // We test the generateConditionalDependencies function indirectly
  // by checking the pom.xml output from generateSpringBootProject

  it("devrait détecter JMS depuis les rawFiles", () => {
    const ir = makeIR({
      batchJobs: [],
    });
    (ir as any)._rawFiles = [{
      path: "NotificationSender.java",
      content: `
        import javax.jms.Queue;
        @Resource(name = "jms/queue/NOTIFICATIONS")
        private Queue notifQueue;
      `,
    }];

    // Import the function to test
    // generateSpringBootProject imported at top level
    const result = generateSpringBootProject(ir);
    const pomFile = result.files.find((f: any) => f.path === "pom.xml");
    expect(pomFile).toBeDefined();
    expect(pomFile!.content).toContain("spring-kafka");
  });

  it("devrait détecter Batch depuis les rawFiles", () => {
    const ir = makeIR({
      batchJobs: [],
    });
    (ir as any)._rawFiles = [{
      path: "ExportBatch.java",
      content: `
        import javax.batch.api.chunk.ItemReader;
        public class ExportBatch implements ItemReader {
        }
      `,
    }];

    // generateSpringBootProject imported at top level
    const result = generateSpringBootProject(ir);
    const pomFile = result.files.find((f: any) => f.path === "pom.xml");
    expect(pomFile).toBeDefined();
    expect(pomFile!.content).toContain("spring-boot-starter-batch");
  });

  it("ne devrait PAS ajouter Kafka/Batch si aucun composant détecté", () => {
    const ir = makeIR({ batchJobs: [] });
    (ir as any)._rawFiles = [{
      path: "SimpleService.java",
      content: `public class SimpleService { public void doWork() {} }`,
    }];

    // generateSpringBootProject imported at top level
    const result = generateSpringBootProject(ir);
    const pomFile = result.files.find((f: any) => f.path === "pom.xml");
    expect(pomFile).toBeDefined();
    expect(pomFile!.content).not.toContain("spring-kafka");
    expect(pomFile!.content).not.toContain("spring-boot-starter-batch");
  });
});

// ─── FIX 4: Servlet multi-route → Controller multi-endpoints ────────────

describe("FIX 4 — Servlet multi-route detection", () => {
  const detector = new ServletDetector();
  const generator = new ServletGenerator();

  it("devrait détecter les sous-routes via getServletPath().equals", () => {
    const content = `
package ma.bmce.si.web;

import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import javax.servlet.annotation.WebServlet;

@WebServlet("/api/comptes/*")
public class CompteServlet extends HttpServlet {

    protected void doGet(HttpServletRequest request, HttpServletResponse response) {
        String path = request.getServletPath();
        if (path.equals("/solde")) {
            // consulter solde
        } else if (path.equals("/historique")) {
            // consulter historique
        } else if (path.equals("/details")) {
            // consulter détails
        }
    }

    protected void doPost(HttpServletRequest request, HttpServletResponse response) {
        String path = request.getServletPath();
        if (path.equals("/virement")) {
            // effectuer virement
        }
    }
}`;

    const components = detector.detect(content, "CompteServlet.java");
    expect(components).toHaveLength(1);

    const servlet = components[0] as any;
    const methods = servlet.metadata.methods;

    // Should detect 4 sub-routes: 3 GET + 1 POST
    expect(methods.length).toBe(4);

    const getRoutes = methods.filter((m: any) => m.httpVerb === "GET");
    expect(getRoutes.length).toBe(3);
    expect(getRoutes.map((m: any) => m.urlPattern).sort()).toEqual([
      "/details", "/historique", "/solde"
    ]);

    const postRoutes = methods.filter((m: any) => m.httpVerb === "POST");
    expect(postRoutes.length).toBe(1);
    expect(postRoutes[0].urlPattern).toBe("/virement");
  });

  it("devrait détecter les sous-routes via switch/case", () => {
    const content = `
package ma.bmce.si.web;

import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

public class ActionServlet extends HttpServlet {

    protected void doPost(HttpServletRequest request, HttpServletResponse response) {
        String path = request.getPathInfo();
        switch (path) {
            case "/creer":
                break;
            case "/modifier":
                break;
            case "/supprimer":
                break;
        }
    }
}`;

    const components = detector.detect(content, "ActionServlet.java");
    const methods = (components[0] as any).metadata.methods;

    expect(methods.length).toBe(3);
    expect(methods.map((m: any) => m.urlPattern).sort()).toEqual([
      "/creer", "/modifier", "/supprimer"
    ]);
  });

  it("devrait détecter les routes via action parameter", () => {
    const content = `
package ma.bmce.si.web;

import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

public class DispatchServlet extends HttpServlet {

    protected void doPost(HttpServletRequest request, HttpServletResponse response) {
        String action = request.getParameter("action");
        if (action.equals("consulter")) {
            // ...
        } else if (action.equals("modifier")) {
            // ...
        }
    }
}`;

    const components = detector.detect(content, "DispatchServlet.java");
    const methods = (components[0] as any).metadata.methods;

    expect(methods.length).toBe(2);
    expect(methods.map((m: any) => m.urlPattern).sort()).toEqual([
      "/consulter", "/modifier"
    ]);
  });

  it("devrait générer un endpoint par sous-route dans le Controller", () => {
    const content = `
package ma.bmce.si.web;

import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import javax.servlet.annotation.WebServlet;

@WebServlet("/api/operations")
public class OperationServlet extends HttpServlet {

    protected void doGet(HttpServletRequest request, HttpServletResponse response) {
        String path = request.getServletPath();
        if (path.equals("/liste")) {
            // liste
        } else if (path.equals("/detail")) {
            // detail
        }
    }
}`;

    const components = detector.detect(content, "OperationServlet.java");
    const files = generator.generate(components[0], components, "ma.bmce.si.operations");

    const ctrlFile = files.find(f => f.category === "controller");
    expect(ctrlFile).toBeDefined();
    expect(ctrlFile!.content).toContain('@GetMapping("/liste")');
    expect(ctrlFile!.content).toContain('@GetMapping("/detail")');
    expect(ctrlFile!.content).toContain("handleGetListe");
    expect(ctrlFile!.content).toContain("handleGetDetail");
  });

  it("devrait fallback sur doGet/doPost simple si pas de sous-routes", () => {
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
    const methods = (components[0] as any).metadata.methods;

    // Single method, no sub-routes
    expect(methods.length).toBe(1);
    expect(methods[0].httpVerb).toBe("GET");
    expect(methods[0].urlPattern).toBeUndefined();
  });

  it("devrait détecter reverse equals pattern: \"/xxx\".equals(path)", () => {
    const content = `
package ma.bmce.si.web;

import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

public class ReverseServlet extends HttpServlet {

    protected void doGet(HttpServletRequest request, HttpServletResponse response) {
        String path = request.getServletPath();
        if ("/consulter".equals(path)) {
            // consulter
        } else if ("/rechercher".equals(path)) {
            // rechercher
        }
    }
}`;

    const components = detector.detect(content, "ReverseServlet.java");
    const methods = (components[0] as any).metadata.methods;

    expect(methods.length).toBe(2);
    expect(methods.map((m: any) => m.urlPattern).sort()).toEqual([
      "/consulter", "/rechercher"
    ]);
  });
});
