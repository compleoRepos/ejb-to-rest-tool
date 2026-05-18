/**
 * ProjectGenerator — Génère des projets EJB synthétiques pour la validation.
 *
 * 5 templates couvrant les patterns principaux :
 *   1. EJB Stateless + DAO + JNDI
 *   2. Servlet + JSP + Session
 *   3. SOAP WebService + WSDL
 *   4. JMS MessageDrivenBean
 *   5. Handler/Strategy Pattern (EAI BOA)
 *
 * Chaque template produit un ensemble de fichiers Java source
 * avec un pom.xml minimal, prêt à être analysé par CompleoEngine.
 *
 * @since v8.7
 */

import * as fs from "fs";
import * as path from "path";
import type { TestProject, ProjectAssertion } from "./ProjectRegistry";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface GeneratedSourceFile {
  path: string;
  content: string;
}

export interface ProjectTemplate {
  id: string;
  name: string;
  testedPatterns: string[];
  assertions: ProjectAssertion[];
  generate: () => GeneratedSourceFile[];
}

// ─── Templates ──────────────────────────────────────────────────────────────

function template1_ejbStatelessDao(): GeneratedSourceFile[] {
  return [
    {
      path: "src/main/java/com/gen/ejb/CompteServiceBean.java",
      content: `package com.gen.ejb;

import javax.ejb.Stateless;
import javax.naming.InitialContext;

@Stateless
public class CompteServiceBean implements CompteServiceLocal {
    private CompteDao compteDao;

    public void init() {
        try {
            InitialContext ctx = new InitialContext();
            compteDao = (CompteDao) ctx.lookup("java:comp/env/CompteDao");
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    @Override
    public CompteDTO consulterCompte(String numCompte) {
        Compte compte = compteDao.findByNumero(numCompte);
        CompteDTO dto = new CompteDTO();
        dto.setNumero(compte.getNumero());
        dto.setSolde(compte.getSolde());
        dto.setDevise(compte.getDevise());
        return dto;
    }

    @Override
    public void crediterCompte(String numCompte, double montant) {
        Compte compte = compteDao.findByNumero(numCompte);
        compte.setSolde(compte.getSolde() + montant);
        compteDao.update(compte);
    }
}`,
    },
    {
      path: "src/main/java/com/gen/ejb/CompteServiceLocal.java",
      content: `package com.gen.ejb;

import javax.ejb.Local;

@Local
public interface CompteServiceLocal {
    CompteDTO consulterCompte(String numCompte);
    void crediterCompte(String numCompte, double montant);
}`,
    },
    {
      path: "src/main/java/com/gen/dao/CompteDao.java",
      content: `package com.gen.dao;

import javax.ejb.Stateless;
import javax.persistence.EntityManager;
import javax.persistence.PersistenceContext;

@Stateless
public class CompteDao {
    @PersistenceContext
    private EntityManager em;

    public Compte findByNumero(String numero) {
        return em.createQuery("SELECT c FROM Compte c WHERE c.numero = :num", Compte.class)
            .setParameter("num", numero)
            .getSingleResult();
    }

    public void update(Compte compte) {
        em.merge(compte);
    }

    public void save(Compte compte) {
        em.persist(compte);
    }
}`,
    },
    {
      path: "src/main/java/com/gen/model/Compte.java",
      content: `package com.gen.model;

import javax.persistence.Entity;
import javax.persistence.Id;
import javax.persistence.Column;

@Entity
public class Compte {
    @Id
    private String numero;
    @Column
    private double solde;
    @Column
    private String devise;

    public String getNumero() { return numero; }
    public void setNumero(String numero) { this.numero = numero; }
    public double getSolde() { return solde; }
    public void setSolde(double solde) { this.solde = solde; }
    public String getDevise() { return devise; }
    public void setDevise(String devise) { this.devise = devise; }
}`,
    },
    {
      path: "src/main/java/com/gen/dto/CompteDTO.java",
      content: `package com.gen.dto;

public class CompteDTO {
    private String numero;
    private double solde;
    private String devise;

    public String getNumero() { return numero; }
    public void setNumero(String numero) { this.numero = numero; }
    public double getSolde() { return solde; }
    public void setSolde(double solde) { this.solde = solde; }
    public String getDevise() { return devise; }
    public void setDevise(String devise) { this.devise = devise; }
}`,
    },
    {
      path: "pom.xml",
      content: `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>com.gen</groupId>
  <artifactId>gen-ejb-stateless</artifactId>
  <version>1.0.0</version>
  <packaging>ejb</packaging>
</project>`,
    },
  ];
}

function template2_servletJsp(): GeneratedSourceFile[] {
  return [
    {
      path: "src/main/java/com/gen/servlet/ClientServlet.java",
      content: `package com.gen.servlet;

import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import javax.servlet.http.HttpSession;
import java.io.IOException;

public class ClientServlet extends HttpServlet {
    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        HttpSession session = req.getSession();
        String clientId = req.getParameter("clientId");
        String clientName = (String) session.getAttribute("clientName");

        req.setAttribute("clientId", clientId);
        req.setAttribute("clientName", clientName);

        try {
            req.getRequestDispatcher("/WEB-INF/views/client.jsp").forward(req, resp);
        } catch (Exception e) {
            resp.sendError(500, e.getMessage());
        }
    }

    @Override
    protected void doPost(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String clientId = req.getParameter("clientId");
        String clientName = req.getParameter("clientName");

        HttpSession session = req.getSession();
        session.setAttribute("clientName", clientName);

        resp.sendRedirect("/client?clientId=" + clientId);
    }
}`,
    },
    {
      path: "src/main/java/com/gen/servlet/LoginServlet.java",
      content: `package com.gen.servlet;

import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import javax.servlet.http.HttpSession;
import java.io.IOException;

public class LoginServlet extends HttpServlet {
    @Override
    protected void doPost(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String username = req.getParameter("username");
        String password = req.getParameter("password");

        if ("admin".equals(username) && "admin".equals(password)) {
            HttpSession session = req.getSession();
            session.setAttribute("user", username);
            resp.sendRedirect("/dashboard");
        } else {
            resp.sendRedirect("/login?error=true");
        }
    }
}`,
    },
    {
      path: "pom.xml",
      content: `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>com.gen</groupId>
  <artifactId>gen-servlet-jsp</artifactId>
  <version>1.0.0</version>
  <packaging>war</packaging>
</project>`,
    },
  ];
}

function template3_soapWebservice(): GeneratedSourceFile[] {
  return [
    {
      path: "src/main/java/com/gen/ws/PaiementWebService.java",
      content: `package com.gen.ws;

import javax.jws.WebService;
import javax.jws.WebMethod;
import javax.jws.WebParam;

@WebService(serviceName = "PaiementService")
public class PaiementWebService {

    @WebMethod
    public PaiementResponse effectuerPaiement(
        @WebParam(name = "montant") double montant,
        @WebParam(name = "devise") String devise,
        @WebParam(name = "compteSrc") String compteSrc,
        @WebParam(name = "compteDst") String compteDst
    ) {
        PaiementResponse response = new PaiementResponse();
        response.setReference("PAY-" + System.currentTimeMillis());
        response.setStatut("OK");
        response.setMontant(montant);
        return response;
    }

    @WebMethod
    public StatutPaiement consulterStatut(
        @WebParam(name = "reference") String reference
    ) {
        StatutPaiement statut = new StatutPaiement();
        statut.setReference(reference);
        statut.setStatut("COMPLETED");
        return statut;
    }
}`,
    },
    {
      path: "src/main/java/com/gen/ws/PaiementResponse.java",
      content: `package com.gen.ws;

public class PaiementResponse {
    private String reference;
    private String statut;
    private double montant;

    public String getReference() { return reference; }
    public void setReference(String reference) { this.reference = reference; }
    public String getStatut() { return statut; }
    public void setStatut(String statut) { this.statut = statut; }
    public double getMontant() { return montant; }
    public void setMontant(double montant) { this.montant = montant; }
}`,
    },
    {
      path: "src/main/java/com/gen/ws/StatutPaiement.java",
      content: `package com.gen.ws;

public class StatutPaiement {
    private String reference;
    private String statut;

    public String getReference() { return reference; }
    public void setReference(String reference) { this.reference = reference; }
    public String getStatut() { return statut; }
    public void setStatut(String statut) { this.statut = statut; }
}`,
    },
    {
      path: "pom.xml",
      content: `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>com.gen</groupId>
  <artifactId>gen-soap-ws</artifactId>
  <version>1.0.0</version>
  <packaging>war</packaging>
</project>`,
    },
  ];
}

function template4_jmsMdb(): GeneratedSourceFile[] {
  return [
    {
      path: "src/main/java/com/gen/jms/NotificationMDB.java",
      content: `package com.gen.jms;

import javax.ejb.MessageDriven;
import javax.ejb.ActivationConfigProperty;
import javax.jms.Message;
import javax.jms.MessageListener;
import javax.jms.TextMessage;

@MessageDriven(activationConfig = {
    @ActivationConfigProperty(propertyName = "destinationType", propertyValue = "javax.jms.Queue"),
    @ActivationConfigProperty(propertyName = "destination", propertyValue = "java:/jms/queue/NotificationQueue")
})
public class NotificationMDB implements MessageListener {

    @Override
    public void onMessage(Message message) {
        try {
            if (message instanceof TextMessage) {
                String text = ((TextMessage) message).getText();
                processNotification(text);
            }
        } catch (Exception e) {
            throw new RuntimeException("Erreur traitement message", e);
        }
    }

    private void processNotification(String payload) {
        System.out.println("Notification reçue: " + payload);
    }
}`,
    },
    {
      path: "src/main/java/com/gen/jms/AlerteMDB.java",
      content: `package com.gen.jms;

import javax.ejb.MessageDriven;
import javax.ejb.ActivationConfigProperty;
import javax.jms.Message;
import javax.jms.MessageListener;
import javax.jms.TextMessage;

@MessageDriven(activationConfig = {
    @ActivationConfigProperty(propertyName = "destinationType", propertyValue = "javax.jms.Queue"),
    @ActivationConfigProperty(propertyName = "destination", propertyValue = "java:/jms/queue/AlerteQueue")
})
public class AlerteMDB implements MessageListener {

    @Override
    public void onMessage(Message message) {
        try {
            if (message instanceof TextMessage) {
                String text = ((TextMessage) message).getText();
                envoyerAlerte(text);
            }
        } catch (Exception e) {
            throw new RuntimeException("Erreur envoi alerte", e);
        }
    }

    private void envoyerAlerte(String payload) {
        System.out.println("ALERTE: " + payload);
    }
}`,
    },
    {
      path: "pom.xml",
      content: `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>com.gen</groupId>
  <artifactId>gen-jms-mdb</artifactId>
  <version>1.0.0</version>
  <packaging>ejb</packaging>
</project>`,
    },
  ];
}

function template5_handlerStrategy(): GeneratedSourceFile[] {
  return [
    {
      path: "src/main/java/com/gen/handler/ActionHandler.java",
      content: `package com.gen.handler;

public interface ActionHandler {
    String handle(String request);
    String getActionCode();
}`,
    },
    {
      path: "src/main/java/com/gen/handler/ConsultationHandler.java",
      content: `package com.gen.handler;

public class ConsultationHandler implements ActionHandler {
    @Override
    public String handle(String request) {
        return "Consultation result for: " + request;
    }

    @Override
    public String getActionCode() { return "CONSULT"; }
}`,
    },
    {
      path: "src/main/java/com/gen/handler/VirementHandler.java",
      content: `package com.gen.handler;

public class VirementHandler implements ActionHandler {
    @Override
    public String handle(String request) {
        return "Virement executed: " + request;
    }

    @Override
    public String getActionCode() { return "VIREMENT"; }
}`,
    },
    {
      path: "src/main/java/com/gen/handler/PaiementHandler.java",
      content: `package com.gen.handler;

public class PaiementHandler implements ActionHandler {
    @Override
    public String handle(String request) {
        return "Paiement processed: " + request;
    }

    @Override
    public String getActionCode() { return "PAIEMENT"; }
}`,
    },
    {
      path: "src/main/java/com/gen/handler/ActionHandlerFactory.java",
      content: `package com.gen.handler;

import java.util.HashMap;
import java.util.Map;

public class ActionHandlerFactory {
    private static final Map<String, ActionHandler> handlers = new HashMap<>();

    static {
        handlers.put("CONSULT", new ConsultationHandler());
        handlers.put("VIREMENT", new VirementHandler());
        handlers.put("PAIEMENT", new PaiementHandler());
    }

    public static ActionHandler getHandler(String actionCode) {
        ActionHandler handler = handlers.get(actionCode);
        if (handler == null) {
            throw new IllegalArgumentException("Unknown action: " + actionCode);
        }
        return handler;
    }
}`,
    },
    {
      path: "src/main/java/com/gen/ejb/DispatcherServiceBean.java",
      content: `package com.gen.ejb;

import javax.ejb.Stateless;
import com.gen.handler.ActionHandlerFactory;
import com.gen.handler.ActionHandler;

@Stateless
public class DispatcherServiceBean {
    public String dispatch(String actionCode, String request) {
        ActionHandler handler = ActionHandlerFactory.getHandler(actionCode);
        return handler.handle(request);
    }
}`,
    },
    {
      path: "pom.xml",
      content: `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>com.gen</groupId>
  <artifactId>gen-handler-strategy</artifactId>
  <version>1.0.0</version>
  <packaging>ejb</packaging>
</project>`,
    },
  ];
}

// ─── Registry des templates ─────────────────────────────────────────────────

const TEMPLATES: ProjectTemplate[] = [
  {
    id: "gen-ejb-stateless-dao",
    name: "EJB Stateless + DAO + JNDI (synthétique)",
    testedPatterns: ["EJB_STATELESS", "JNDI_LOOKUP", "JPA", "DAO"],
    assertions: [
      { type: "MIN_SERVICES", expected: 1, description: "Au moins 1 service Spring" },
      { type: "MIN_DTOS", expected: 1, description: "Au moins 1 DTO" },
      { type: "PATTERN_ABSENT", expected: "InitialContext", description: "Pas de JNDI" },
      { type: "BUILD_SUCCESS", expected: 1, description: "Compilation réussie" },
    ],
    generate: template1_ejbStatelessDao,
  },
  {
    id: "gen-servlet-jsp",
    name: "Servlet + JSP + Session (synthétique)",
    testedPatterns: ["SERVLET", "JSP", "HTTP_SESSION"],
    assertions: [
      { type: "MIN_CONTROLLERS", expected: 1, description: "Au moins 1 controller" },
      { type: "PATTERN_ABSENT", expected: "HttpServlet", description: "Pas de HttpServlet" },
      { type: "BUILD_SUCCESS", expected: 1, description: "Compilation réussie" },
    ],
    generate: template2_servletJsp,
  },
  {
    id: "gen-soap-ws",
    name: "SOAP WebService (synthétique)",
    testedPatterns: ["SOAP", "JAX_WS"],
    assertions: [
      { type: "MIN_CONTROLLERS", expected: 1, description: "Au moins 1 controller REST" },
      { type: "BUILD_SUCCESS", expected: 1, description: "Compilation réussie" },
    ],
    generate: template3_soapWebservice,
  },
  {
    id: "gen-jms-mdb",
    name: "JMS MessageDrivenBean (synthétique)",
    testedPatterns: ["JMS", "MESSAGE_DRIVEN_BEAN"],
    assertions: [
      { type: "MIN_SERVICES", expected: 1, description: "Au moins 1 service Spring" },
      { type: "BUILD_SUCCESS", expected: 1, description: "Compilation réussie" },
    ],
    generate: template4_jmsMdb,
  },
  {
    id: "gen-handler-strategy",
    name: "Handler/Strategy Pattern (synthétique)",
    testedPatterns: ["HANDLER_PATTERN", "STRATEGY", "FACTORY"],
    assertions: [
      { type: "MIN_SERVICES", expected: 1, description: "Au moins 1 service Spring" },
      { type: "PATTERN_ABSENT", expected: "ActionHandlerFactory", description: "Pas de Factory dans le code généré" },
      { type: "BUILD_SUCCESS", expected: 1, description: "Compilation réussie" },
    ],
    generate: template5_handlerStrategy,
  },
];

// ─── ProjectGenerator ───────────────────────────────────────────────────────

/**
 * Génère les projets synthétiques sur disque et retourne les TestProject
 * à enregistrer dans le ProjectRegistry.
 */
export function generateTestProjects(
  outputDir: string
): { projects: TestProject[]; filesWritten: number } {
  let totalFiles = 0;
  const projects: TestProject[] = [];

  for (const template of TEMPLATES) {
    const projectDir = path.join(outputDir, template.id);

    // Générer les fichiers
    const files = template.generate();

    // Écrire sur disque
    for (const file of files) {
      const filePath = path.join(projectDir, file.path);
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(filePath, file.content, "utf-8");
      totalFiles++;
    }

    // Créer le TestProject
    projects.push({
      id: template.id,
      name: template.name,
      type: "GENERATED",
      sourcePath: projectDir,
      testedPatterns: template.testedPatterns,
      assertions: template.assertions,
      history: [],
    });
  }

  return { projects, filesWritten: totalFiles };
}

/**
 * Génère les fichiers source en mémoire (sans écriture disque).
 * Utile pour les tests unitaires.
 */
export function generateTemplateFiles(templateId: string): GeneratedSourceFile[] | null {
  const template = TEMPLATES.find((t) => t.id === templateId);
  if (!template) return null;
  return template.generate();
}

/**
 * Retourne la liste des templates disponibles.
 */
export function getTemplates(): ProjectTemplate[] {
  return TEMPLATES;
}
