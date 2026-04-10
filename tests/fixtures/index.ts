/**
 * tests/fixtures/index.ts
 * 
 * 16 projets de test couvrant tous les types Java EE détectés par Compleo.
 * Chaque fixture est un ensemble minimal de fichiers Java inline.
 * Utilisé par les helpers et les tests de régression.
 */

export interface FixtureFile {
  path: string;
  content: string;
}

export interface TestFixture {
  id: string;
  name: string;
  description: string;
  category: "ejb" | "servlet" | "multi-tech" | "edge-case";
  files: FixtureFile[];
  pomXml?: string;
  expected: {
    useCases: number;
    dtos: number;
    enums: number;
    exceptions: number;
    domains: string[];
    technologies?: string[];
    minScore?: number;
  };
}

// ─── POM templates ──────────────────────────────────────────────────────────

const POM_ORACLE = `<?xml version="1.0" encoding="UTF-8"?>
<project>
  <groupId>com.bank</groupId>
  <artifactId>ejb-project</artifactId>
  <version>1.0</version>
  <dependencies>
    <dependency><groupId>com.oracle.database.jdbc</groupId><artifactId>ojdbc8</artifactId></dependency>
    <dependency><groupId>javax</groupId><artifactId>javaee-api</artifactId><version>7.0</version></dependency>
  </dependencies>
</project>`;

const POM_MYSQL = `<?xml version="1.0" encoding="UTF-8"?>
<project>
  <groupId>com.bank</groupId>
  <artifactId>ejb-project</artifactId>
  <version>1.0</version>
  <dependencies>
    <dependency><groupId>mysql</groupId><artifactId>mysql-connector-java</artifactId></dependency>
    <dependency><groupId>javax</groupId><artifactId>javaee-api</artifactId><version>7.0</version></dependency>
  </dependencies>
</project>`;

const POM_MULTI_DS = `<?xml version="1.0" encoding="UTF-8"?>
<project>
  <groupId>com.bank</groupId>
  <artifactId>ejb-multi-ds</artifactId>
  <version>1.0</version>
  <dependencies>
    <dependency><groupId>com.oracle.database.jdbc</groupId><artifactId>ojdbc8</artifactId></dependency>
    <dependency><groupId>mysql</groupId><artifactId>mysql-connector-java</artifactId></dependency>
    <dependency><groupId>javax</groupId><artifactId>javaee-api</artifactId><version>7.0</version></dependency>
  </dependencies>
</project>`;

// ─── 01: EJB BOA classique (UseCase + execute) ─────────────────────────────

export const FIXTURE_01_EJB_BOA: TestFixture = {
  id: "01-ejb-boa",
  name: "EJB BOA Classique",
  description: "UseCase avec BaseUseCase.execute(), VoIn/VoOut standard",
  category: "ejb",
  pomXml: POM_ORACLE,
  files: [
    {
      path: "src/main/java/com/bank/compte/ConsulterSoldeUC.java",
      content: `package com.bank.compte;
import com.bank.framework.BaseUseCase;
import javax.ejb.Stateless;
@Stateless
public class ConsulterSoldeUC extends BaseUseCase {
    public ConsulterSoldeVoOut execute(ConsulterSoldeVoIn voIn) {
        String numCompte = voIn.getNumCompte();
        ConsulterSoldeVoOut voOut = new ConsulterSoldeVoOut();
        voOut.setSolde(1000.0);
        voOut.setDevise("MAD");
        return voOut;
    }
}`,
    },
    {
      path: "src/main/java/com/bank/compte/ConsulterSoldeVoIn.java",
      content: `package com.bank.compte;
public class ConsulterSoldeVoIn {
    private String numCompte;
    public String getNumCompte() { return numCompte; }
    public void setNumCompte(String numCompte) { this.numCompte = numCompte; }
}`,
    },
    {
      path: "src/main/java/com/bank/compte/ConsulterSoldeVoOut.java",
      content: `package com.bank.compte;
public class ConsulterSoldeVoOut {
    private double solde;
    private String devise;
    public double getSolde() { return solde; }
    public void setSolde(double solde) { this.solde = solde; }
    public String getDevise() { return devise; }
    public void setDevise(String devise) { this.devise = devise; }
}`,
    },
  ],
  expected: {
    useCases: 1,
    dtos: 2,
    enums: 0,
    exceptions: 0,
    domains: ["compte"],
  },
};

// ─── 02: EJB Direct (sans BaseUseCase) ──────────────────────────────────────

export const FIXTURE_02_EJB_DIRECT: TestFixture = {
  id: "02-ejb-direct",
  name: "EJB Direct @Stateless",
  description: "EJB sans BaseUseCase, méthodes publiques business directes",
  category: "ejb",
  pomXml: POM_ORACLE,
  files: [
    {
      path: "src/main/java/com/bank/compte/CompteEJB.java",
      content: `package com.bank.compte;
import javax.ejb.Stateless;
import javax.persistence.EntityManager;
import javax.persistence.PersistenceContext;
@Stateless
public class CompteEJB {
    @PersistenceContext
    private EntityManager em;
    
    public double consulterSolde(String numCompte) {
        return 1000.0;
    }
    
    public void initierVirement(String source, String dest, double montant) {
        // business logic
    }
    
    public java.util.List<String> listerMouvements(String numCompte) {
        return java.util.Collections.emptyList();
    }
}`,
    },
  ],
  expected: {
    useCases: 3,
    dtos: 0,
    enums: 0,
    exceptions: 0,
    domains: ["compte"],
  },
};

// ─── 03: EJB avec DAO séparé ────────────────────────────────────────────────

export const FIXTURE_03_EJB_DAO: TestFixture = {
  id: "03-ejb-dao",
  name: "EJB + DAO séparé",
  description: "UseCase injecte un DAO, le DAO ne doit PAS être un UseCase",
  category: "ejb",
  pomXml: POM_ORACLE,
  files: [
    {
      path: "src/main/java/com/bank/virement/InitierVirementUC.java",
      content: `package com.bank.virement;
import com.bank.framework.BaseUseCase;
import javax.ejb.Stateless;
import javax.ejb.EJB;
@Stateless
public class InitierVirementUC extends BaseUseCase {
    @EJB
    private CompteDAO compteDAO;
    
    public InitierVirementVoOut execute(InitierVirementVoIn voIn) {
        double solde = compteDAO.getSolde(voIn.getCompteSource());
        InitierVirementVoOut voOut = new InitierVirementVoOut();
        voOut.setReference("VIR-001");
        return voOut;
    }
}`,
    },
    {
      path: "src/main/java/com/bank/virement/CompteDAO.java",
      content: `package com.bank.virement;
import javax.ejb.Stateless;
import javax.persistence.EntityManager;
import javax.persistence.PersistenceContext;
@Stateless
public class CompteDAO {
    @PersistenceContext
    private EntityManager em;
    
    public double getSolde(String numCompte) {
        return (Double) em.createQuery("SELECT c.solde FROM Compte c WHERE c.numero = :num")
            .setParameter("num", numCompte).getSingleResult();
    }
    
    public void updateSolde(String numCompte, double montant) {
        em.createQuery("UPDATE Compte c SET c.solde = :montant WHERE c.numero = :num")
            .setParameter("montant", montant).setParameter("num", numCompte).executeUpdate();
    }
}`,
    },
    {
      path: "src/main/java/com/bank/virement/InitierVirementVoIn.java",
      content: `package com.bank.virement;
public class InitierVirementVoIn {
    private String compteSource;
    private String compteDest;
    private double montant;
    public String getCompteSource() { return compteSource; }
    public void setCompteSource(String s) { this.compteSource = s; }
    public String getCompteDest() { return compteDest; }
    public void setCompteDest(String s) { this.compteDest = s; }
    public double getMontant() { return montant; }
    public void setMontant(double m) { this.montant = m; }
}`,
    },
    {
      path: "src/main/java/com/bank/virement/InitierVirementVoOut.java",
      content: `package com.bank.virement;
public class InitierVirementVoOut {
    private String reference;
    public String getReference() { return reference; }
    public void setReference(String r) { this.reference = r; }
}`,
    },
  ],
  expected: {
    useCases: 1,
    dtos: 2,
    enums: 0,
    exceptions: 0,
    domains: ["virement"],
  },
};

// ─── 04: Servlet simple ─────────────────────────────────────────────────────

export const FIXTURE_04_SERVLET: TestFixture = {
  id: "04-servlet",
  name: "Servlet Simple",
  description: "HttpServlet avec doGet/doPost",
  category: "servlet",
  files: [
    {
      path: "src/main/java/com/bank/web/CompteServlet.java",
      content: `package com.bank.web;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import javax.servlet.annotation.WebServlet;
import java.io.IOException;
@WebServlet("/comptes")
public class CompteServlet extends HttpServlet {
    protected void doGet(HttpServletRequest request, HttpServletResponse response) throws IOException {
        String numCompte = request.getParameter("numCompte");
        response.getWriter().write("Solde: 1000.0");
    }
    
    protected void doPost(HttpServletRequest request, HttpServletResponse response) throws IOException {
        String source = request.getParameter("source");
        String dest = request.getParameter("dest");
        response.getWriter().write("Virement OK");
    }
}`,
    },
  ],
  expected: {
    useCases: 0,
    dtos: 0,
    enums: 0,
    exceptions: 0,
    domains: [],
    technologies: ["servlet"],
  },
};

// ─── 05: Servlet multi-route ────────────────────────────────────────────────

export const FIXTURE_05_SERVLET_MULTI: TestFixture = {
  id: "05-servlet-multi",
  name: "Servlet Multi-Route",
  description: "Servlet avec getServletPath() et switch/if pour routes multiples",
  category: "servlet",
  files: [
    {
      path: "src/main/java/com/bank/web/ApiServlet.java",
      content: `package com.bank.web;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
public class ApiServlet extends HttpServlet {
    protected void doGet(HttpServletRequest request, HttpServletResponse response) throws IOException {
        String path = request.getServletPath();
        if (path.equals("/api/comptes/solde")) {
            response.getWriter().write("Solde: 1000");
        } else if (path.equals("/api/comptes/mouvements")) {
            response.getWriter().write("Mouvements: []");
        } else if (path.equals("/api/comptes/details")) {
            response.getWriter().write("Details: {}");
        }
    }
}`,
    },
    {
      path: "WEB-INF/web.xml",
      content: `<?xml version="1.0" encoding="UTF-8"?>
<web-app>
  <servlet>
    <servlet-name>ApiServlet</servlet-name>
    <servlet-class>com.bank.web.ApiServlet</servlet-class>
  </servlet>
  <servlet-mapping>
    <servlet-name>ApiServlet</servlet-name>
    <url-pattern>/api/comptes/solde</url-pattern>
  </servlet-mapping>
  <servlet-mapping>
    <servlet-name>ApiServlet</servlet-name>
    <url-pattern>/api/comptes/mouvements</url-pattern>
  </servlet-mapping>
  <servlet-mapping>
    <servlet-name>ApiServlet</servlet-name>
    <url-pattern>/api/comptes/details</url-pattern>
  </servlet-mapping>
</web-app>`,
    },
  ],
  expected: {
    useCases: 0,
    dtos: 0,
    enums: 0,
    exceptions: 0,
    domains: [],
    technologies: ["servlet"],
  },
};

// ─── 06: EJB avec Enum + Exception ──────────────────────────────────────────

export const FIXTURE_06_EJB_ENUM_EXCEPTION: TestFixture = {
  id: "06-ejb-enum-exception",
  name: "EJB + Enum + Exception",
  description: "UseCase avec enum DeviseType et exception CompteInexistantException",
  category: "ejb",
  pomXml: POM_ORACLE,
  files: [
    {
      path: "src/main/java/com/bank/paiement/TraiterPaiementUC.java",
      content: `package com.bank.paiement;
import com.bank.framework.BaseUseCase;
import javax.ejb.Stateless;
@Stateless
public class TraiterPaiementUC extends BaseUseCase {
    public TraiterPaiementVoOut execute(TraiterPaiementVoIn voIn) throws PaiementRefuseException {
        if (voIn.getMontant() <= 0) {
            throw new PaiementRefuseException("Montant invalide");
        }
        TraiterPaiementVoOut voOut = new TraiterPaiementVoOut();
        voOut.setStatut(StatutPaiement.ACCEPTE);
        return voOut;
    }
}`,
    },
    {
      path: "src/main/java/com/bank/paiement/TraiterPaiementVoIn.java",
      content: `package com.bank.paiement;
public class TraiterPaiementVoIn {
    private double montant;
    private DeviseType devise;
    public double getMontant() { return montant; }
    public void setMontant(double m) { this.montant = m; }
    public DeviseType getDevise() { return devise; }
    public void setDevise(DeviseType d) { this.devise = d; }
}`,
    },
    {
      path: "src/main/java/com/bank/paiement/TraiterPaiementVoOut.java",
      content: `package com.bank.paiement;
public class TraiterPaiementVoOut {
    private StatutPaiement statut;
    public StatutPaiement getStatut() { return statut; }
    public void setStatut(StatutPaiement s) { this.statut = s; }
}`,
    },
    {
      path: "src/main/java/com/bank/paiement/DeviseType.java",
      content: `package com.bank.paiement;
public enum DeviseType { MAD, EUR, USD, GBP }`,
    },
    {
      path: "src/main/java/com/bank/paiement/StatutPaiement.java",
      content: `package com.bank.paiement;
public enum StatutPaiement { EN_ATTENTE, ACCEPTE, REFUSE, ANNULE }`,
    },
    {
      path: "src/main/java/com/bank/paiement/PaiementRefuseException.java",
      content: `package com.bank.paiement;
public class PaiementRefuseException extends Exception {
    public PaiementRefuseException(String message) { super(message); }
}`,
    },
  ],
  expected: {
    useCases: 1,
    dtos: 2,
    enums: 2,
    exceptions: 1,
    domains: ["paiement"],
  },
};

// ─── 07: JDBC pur (pas JPA) ────────────────────────────────────────────────

export const FIXTURE_07_JDBC: TestFixture = {
  id: "07-jdbc",
  name: "JDBC Pur",
  description: "EJB avec JDBC direct (DataSource, Connection, PreparedStatement)",
  category: "ejb",
  pomXml: POM_ORACLE,
  files: [
    {
      path: "src/main/java/com/bank/reporting/GenererRapportUC.java",
      content: `package com.bank.reporting;
import com.bank.framework.BaseUseCase;
import javax.ejb.Stateless;
import javax.annotation.Resource;
import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
@Stateless
public class GenererRapportUC extends BaseUseCase {
    @Resource(lookup = "java:/jdbc/BanqueDS")
    private DataSource dataSource;
    
    private static final String SQL_RAPPORT = "SELECT * FROM OPERATIONS WHERE DATE_OP >= ? AND DATE_OP <= ?";
    
    public GenererRapportVoOut execute(GenererRapportVoIn voIn) {
        GenererRapportVoOut voOut = new GenererRapportVoOut();
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement(SQL_RAPPORT)) {
            ps.setString(1, voIn.getDateDebut());
            ps.setString(2, voIn.getDateFin());
            ResultSet rs = ps.executeQuery();
            int count = 0;
            while (rs.next()) { count++; }
            voOut.setNbOperations(count);
        } catch (Exception e) {
            voOut.setNbOperations(-1);
        }
        return voOut;
    }
}`,
    },
    {
      path: "src/main/java/com/bank/reporting/GenererRapportVoIn.java",
      content: `package com.bank.reporting;
public class GenererRapportVoIn {
    private String dateDebut;
    private String dateFin;
    public String getDateDebut() { return dateDebut; }
    public void setDateDebut(String d) { this.dateDebut = d; }
    public String getDateFin() { return dateFin; }
    public void setDateFin(String d) { this.dateFin = d; }
}`,
    },
    {
      path: "src/main/java/com/bank/reporting/GenererRapportVoOut.java",
      content: `package com.bank.reporting;
public class GenererRapportVoOut {
    private int nbOperations;
    public int getNbOperations() { return nbOperations; }
    public void setNbOperations(int n) { this.nbOperations = n; }
}`,
    },
  ],
  expected: {
    useCases: 1,
    dtos: 2,
    enums: 0,
    exceptions: 0,
    domains: ["reporting"],
  },
};

// ─── 08: JMS / Kafka ───────────────────────────────────────────────────────

export const FIXTURE_08_JMS: TestFixture = {
  id: "08-jms",
  name: "JMS / Message-Driven",
  description: "MDB avec @MessageDriven + JMS queue",
  category: "multi-tech",
  pomXml: POM_ORACLE,
  files: [
    {
      path: "src/main/java/com/bank/notification/NotificationMDB.java",
      content: `package com.bank.notification;
import javax.ejb.MessageDriven;
import javax.ejb.ActivationConfigProperty;
import javax.jms.MessageListener;
import javax.jms.Message;
import javax.jms.TextMessage;
@MessageDriven(activationConfig = {
    @ActivationConfigProperty(propertyName = "destinationType", propertyValue = "javax.jms.Queue"),
    @ActivationConfigProperty(propertyName = "destination", propertyValue = "jms/queue/NotificationQueue")
})
public class NotificationMDB implements MessageListener {
    public void onMessage(Message message) {
        try {
            TextMessage textMessage = (TextMessage) message;
            String payload = textMessage.getText();
            System.out.println("Notification reçue: " + payload);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}`,
    },
  ],
  expected: {
    useCases: 0,
    dtos: 0,
    enums: 0,
    exceptions: 0,
    domains: [],
    technologies: ["jms"],
  },
};

// ─── 09: SOAP / WebService ──────────────────────────────────────────────────

export const FIXTURE_09_SOAP: TestFixture = {
  id: "09-soap",
  name: "SOAP WebService",
  description: "EJB exposé comme WebService SOAP via @WebService",
  category: "multi-tech",
  pomXml: POM_ORACLE,
  files: [
    {
      path: "src/main/java/com/bank/service/CompteWebService.java",
      content: `package com.bank.service;
import javax.jws.WebService;
import javax.jws.WebMethod;
import javax.jws.WebParam;
import javax.ejb.Stateless;
@Stateless
@WebService(serviceName = "CompteService")
public class CompteWebService {
    @WebMethod
    public double consulterSolde(@WebParam(name = "numCompte") String numCompte) {
        return 1500.0;
    }
    
    @WebMethod
    public String effectuerVirement(@WebParam(name = "source") String source,
                                     @WebParam(name = "dest") String dest,
                                     @WebParam(name = "montant") double montant) {
        return "VIR-" + System.currentTimeMillis();
    }
}`,
    },
  ],
  expected: {
    useCases: 2,
    dtos: 0,
    enums: 0,
    exceptions: 0,
    domains: ["service"],
    technologies: ["soap"],
  },
};

// ─── 10: Struts Action ──────────────────────────────────────────────────────

export const FIXTURE_10_STRUTS: TestFixture = {
  id: "10-struts",
  name: "Struts Action",
  description: "Struts 1.x Action avec ActionForm et ActionForward",
  category: "multi-tech",
  files: [
    {
      path: "src/main/java/com/bank/web/CompteAction.java",
      content: `package com.bank.web;
import org.apache.struts.action.Action;
import org.apache.struts.action.ActionForm;
import org.apache.struts.action.ActionForward;
import org.apache.struts.action.ActionMapping;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
public class CompteAction extends Action {
    public ActionForward execute(ActionMapping mapping, ActionForm form,
            HttpServletRequest request, HttpServletResponse response) {
        String numCompte = request.getParameter("numCompte");
        request.setAttribute("solde", 1000.0);
        return mapping.findForward("success");
    }
}`,
    },
  ],
  expected: {
    useCases: 0,
    dtos: 0,
    enums: 0,
    exceptions: 0,
    domains: [],
    technologies: ["struts"],
  },
};

// ─── 11: Batch (EJB Timer) ──────────────────────────────────────────────────

export const FIXTURE_11_BATCH: TestFixture = {
  id: "11-batch",
  name: "Batch / Timer EJB",
  description: "EJB avec @Schedule pour traitement batch",
  category: "multi-tech",
  pomXml: POM_ORACLE,
  files: [
    {
      path: "src/main/java/com/bank/batch/PurgeComptesJob.java",
      content: `package com.bank.batch;
import javax.ejb.Stateless;
import javax.ejb.Schedule;
import javax.persistence.EntityManager;
import javax.persistence.PersistenceContext;
@Stateless
public class PurgeComptesJob {
    @PersistenceContext
    private EntityManager em;
    
    @Schedule(hour = "2", minute = "0", persistent = false)
    public void purgerComptesInactifs() {
        em.createQuery("DELETE FROM Compte c WHERE c.actif = false").executeUpdate();
    }
}`,
    },
  ],
  expected: {
    useCases: 0,
    dtos: 0,
    enums: 0,
    exceptions: 0,
    domains: [],
    technologies: ["batch"],
  },
};

// ─── 12: Multi-domaine (2 domaines dans le même projet) ─────────────────────

export const FIXTURE_12_MULTI_DOMAIN: TestFixture = {
  id: "12-multi-domain",
  name: "Multi-Domaine",
  description: "2 domaines (compte + virement) dans le même projet EJB",
  category: "ejb",
  pomXml: POM_ORACLE,
  files: [
    {
      path: "src/main/java/com/bank/compte/ConsulterSoldeUC.java",
      content: `package com.bank.compte;
import com.bank.framework.BaseUseCase;
import javax.ejb.Stateless;
@Stateless
public class ConsulterSoldeUC extends BaseUseCase {
    public ConsulterSoldeVoOut execute(ConsulterSoldeVoIn voIn) {
        ConsulterSoldeVoOut voOut = new ConsulterSoldeVoOut();
        voOut.setSolde(5000.0);
        return voOut;
    }
}`,
    },
    {
      path: "src/main/java/com/bank/compte/ConsulterSoldeVoIn.java",
      content: `package com.bank.compte;
public class ConsulterSoldeVoIn {
    private String numCompte;
    public String getNumCompte() { return numCompte; }
    public void setNumCompte(String n) { this.numCompte = n; }
}`,
    },
    {
      path: "src/main/java/com/bank/compte/ConsulterSoldeVoOut.java",
      content: `package com.bank.compte;
public class ConsulterSoldeVoOut {
    private double solde;
    public double getSolde() { return solde; }
    public void setSolde(double s) { this.solde = s; }
}`,
    },
    {
      path: "src/main/java/com/bank/virement/InitierVirementUC.java",
      content: `package com.bank.virement;
import com.bank.framework.BaseUseCase;
import javax.ejb.Stateless;
@Stateless
public class InitierVirementUC extends BaseUseCase {
    public InitierVirementVoOut execute(InitierVirementVoIn voIn) {
        InitierVirementVoOut voOut = new InitierVirementVoOut();
        voOut.setReference("VIR-" + System.currentTimeMillis());
        return voOut;
    }
}`,
    },
    {
      path: "src/main/java/com/bank/virement/InitierVirementVoIn.java",
      content: `package com.bank.virement;
public class InitierVirementVoIn {
    private String source;
    private String dest;
    private double montant;
    public String getSource() { return source; }
    public void setSource(String s) { this.source = s; }
    public String getDest() { return dest; }
    public void setDest(String d) { this.dest = d; }
    public double getMontant() { return montant; }
    public void setMontant(double m) { this.montant = m; }
}`,
    },
    {
      path: "src/main/java/com/bank/virement/InitierVirementVoOut.java",
      content: `package com.bank.virement;
public class InitierVirementVoOut {
    private String reference;
    public String getReference() { return reference; }
    public void setReference(String r) { this.reference = r; }
}`,
    },
  ],
  expected: {
    useCases: 2,
    dtos: 4,
    enums: 0,
    exceptions: 0,
    domains: ["compte", "virement"],
  },
};

// ─── 13: Multi-DataSource ───────────────────────────────────────────────────

export const FIXTURE_13_MULTI_DS: TestFixture = {
  id: "13-multi-datasource",
  name: "Multi-DataSource",
  description: "Projet avec 2 DataSources (Oracle + MySQL)",
  category: "edge-case",
  pomXml: POM_MULTI_DS,
  files: [
    {
      path: "src/main/java/com/bank/compte/CompteService.java",
      content: `package com.bank.compte;
import com.bank.framework.BaseUseCase;
import javax.ejb.Stateless;
import javax.annotation.Resource;
import javax.sql.DataSource;
import java.sql.Connection;
@Stateless
public class CompteService extends BaseUseCase {
    @Resource(lookup = "java:/jdbc/OracleDS")
    private DataSource oracleDS;
    
    @Resource(lookup = "java:/jdbc/MysqlDS")
    private DataSource mysqlDS;
    
    public CompteVoOut execute(CompteVoIn voIn) {
        CompteVoOut voOut = new CompteVoOut();
        voOut.setResult("OK");
        return voOut;
    }
}`,
    },
    {
      path: "src/main/java/com/bank/compte/CompteVoIn.java",
      content: `package com.bank.compte;
public class CompteVoIn {
    private String numCompte;
    public String getNumCompte() { return numCompte; }
    public void setNumCompte(String n) { this.numCompte = n; }
}`,
    },
    {
      path: "src/main/java/com/bank/compte/CompteVoOut.java",
      content: `package com.bank.compte;
public class CompteVoOut {
    private String result;
    public String getResult() { return result; }
    public void setResult(String r) { this.result = r; }
}`,
    },
  ],
  expected: {
    useCases: 1,
    dtos: 2,
    enums: 0,
    exceptions: 0,
    domains: ["compte"],
  },
};

// ─── 14: EJB 2.x (SessionBean) ─────────────────────────────────────────────

export const FIXTURE_14_EJB2X: TestFixture = {
  id: "14-ejb2x",
  name: "EJB 2.x SessionBean",
  description: "EJB 2.x avec SessionBean, ejbCreate, ejb-jar.xml",
  category: "ejb",
  files: [
    {
      path: "src/main/java/com/bank/legacy/CompteBean.java",
      content: `package com.bank.legacy;
import javax.ejb.SessionBean;
import javax.ejb.SessionContext;
public class CompteBean implements SessionBean {
    private SessionContext ctx;
    
    public void ejbCreate() {}
    public void ejbRemove() {}
    public void ejbActivate() {}
    public void ejbPassivate() {}
    public void setSessionContext(SessionContext ctx) { this.ctx = ctx; }
    
    public double consulterSolde(String numCompte) {
        return 2000.0;
    }
}`,
    },
    {
      path: "META-INF/ejb-jar.xml",
      content: `<?xml version="1.0" encoding="UTF-8"?>
<ejb-jar>
  <enterprise-beans>
    <session>
      <ejb-name>CompteBean</ejb-name>
      <ejb-class>com.bank.legacy.CompteBean</ejb-class>
      <session-type>Stateless</session-type>
    </session>
  </enterprise-beans>
</ejb-jar>`,
    },
  ],
  expected: {
    useCases: 0,
    dtos: 0,
    enums: 0,
    exceptions: 0,
    domains: [],
    technologies: ["ejb2x"],
  },
};

// ─── 15: Hibernate (HQL) ───────────────────────────────────────────────────

export const FIXTURE_15_HIBERNATE: TestFixture = {
  id: "15-hibernate",
  name: "Hibernate HQL",
  description: "EJB avec Hibernate SessionFactory et HQL queries",
  category: "multi-tech",
  pomXml: POM_ORACLE,
  files: [
    {
      path: "src/main/java/com/bank/client/RechercherClientUC.java",
      content: `package com.bank.client;
import com.bank.framework.BaseUseCase;
import javax.ejb.Stateless;
import org.hibernate.Session;
import org.hibernate.SessionFactory;
import javax.persistence.PersistenceUnit;
@Stateless
public class RechercherClientUC extends BaseUseCase {
    @PersistenceUnit
    private SessionFactory sessionFactory;
    
    public RechercherClientVoOut execute(RechercherClientVoIn voIn) {
        Session session = sessionFactory.openSession();
        Object result = session.createQuery("FROM Client c WHERE c.nom LIKE :nom")
            .setParameter("nom", "%" + voIn.getNom() + "%")
            .uniqueResult();
        session.close();
        RechercherClientVoOut voOut = new RechercherClientVoOut();
        voOut.setTrouve(result != null);
        return voOut;
    }
}`,
    },
    {
      path: "src/main/java/com/bank/client/RechercherClientVoIn.java",
      content: `package com.bank.client;
public class RechercherClientVoIn {
    private String nom;
    public String getNom() { return nom; }
    public void setNom(String n) { this.nom = n; }
}`,
    },
    {
      path: "src/main/java/com/bank/client/RechercherClientVoOut.java",
      content: `package com.bank.client;
public class RechercherClientVoOut {
    private boolean trouve;
    public boolean isTrouve() { return trouve; }
    public void setTrouve(boolean t) { this.trouve = t; }
}`,
    },
  ],
  expected: {
    useCases: 1,
    dtos: 2,
    enums: 0,
    exceptions: 0,
    domains: ["client"],
    technologies: ["hibernate"],
  },
};

// ─── 16: Projet mixte complet ───────────────────────────────────────────────

export const FIXTURE_16_MIXTE: TestFixture = {
  id: "16-mixte-complet",
  name: "Projet Mixte Complet",
  description: "EJB BOA + Direct + Servlet + Enum + Exception + JDBC + DAO",
  category: "edge-case",
  pomXml: POM_ORACLE,
  files: [
    // UseCase BOA
    {
      path: "src/main/java/com/bank/compte/ConsulterSoldeUC.java",
      content: `package com.bank.compte;
import com.bank.framework.BaseUseCase;
import javax.ejb.Stateless;
@Stateless
public class ConsulterSoldeUC extends BaseUseCase {
    public ConsulterSoldeVoOut execute(ConsulterSoldeVoIn voIn) {
        ConsulterSoldeVoOut voOut = new ConsulterSoldeVoOut();
        voOut.setSolde(1000.0);
        return voOut;
    }
}`,
    },
    {
      path: "src/main/java/com/bank/compte/ConsulterSoldeVoIn.java",
      content: `package com.bank.compte;
public class ConsulterSoldeVoIn {
    private String numCompte;
    public String getNumCompte() { return numCompte; }
    public void setNumCompte(String n) { this.numCompte = n; }
}`,
    },
    {
      path: "src/main/java/com/bank/compte/ConsulterSoldeVoOut.java",
      content: `package com.bank.compte;
public class ConsulterSoldeVoOut {
    private double solde;
    public double getSolde() { return solde; }
    public void setSolde(double s) { this.solde = s; }
}`,
    },
    // EJB Direct
    {
      path: "src/main/java/com/bank/virement/VirementEJB.java",
      content: `package com.bank.virement;
import javax.ejb.Stateless;
@Stateless
public class VirementEJB {
    public String initierVirement(String source, String dest, double montant) {
        return "VIR-OK";
    }
    public String annulerVirement(String reference) {
        return "ANNULE";
    }
}`,
    },
    // DAO (ne doit PAS être UseCase)
    {
      path: "src/main/java/com/bank/dao/CompteDAO.java",
      content: `package com.bank.dao;
import javax.ejb.Stateless;
import javax.persistence.EntityManager;
import javax.persistence.PersistenceContext;
@Stateless
public class CompteDAO {
    @PersistenceContext
    private EntityManager em;
    public double getSolde(String num) { return 0; }
    public void updateSolde(String num, double m) {}
}`,
    },
    // Enum
    {
      path: "src/main/java/com/bank/compte/TypeCompte.java",
      content: `package com.bank.compte;
public enum TypeCompte { COURANT, EPARGNE, PROFESSIONNEL }`,
    },
    // Exception
    {
      path: "src/main/java/com/bank/compte/CompteInexistantException.java",
      content: `package com.bank.compte;
public class CompteInexistantException extends Exception {
    public CompteInexistantException(String msg) { super(msg); }
}`,
    },
  ],
  expected: {
    useCases: 3, // ConsulterSoldeUC + VirementEJB_initierVirement + VirementEJB_annulerVirement
    dtos: 2,
    enums: 1,
    exceptions: 1,
    domains: ["compte", "virement"],
  },
};

// ─── Registry ───────────────────────────────────────────────────────────────

export const ALL_FIXTURES: TestFixture[] = [
  FIXTURE_01_EJB_BOA,
  FIXTURE_02_EJB_DIRECT,
  FIXTURE_03_EJB_DAO,
  FIXTURE_04_SERVLET,
  FIXTURE_05_SERVLET_MULTI,
  FIXTURE_06_EJB_ENUM_EXCEPTION,
  FIXTURE_07_JDBC,
  FIXTURE_08_JMS,
  FIXTURE_09_SOAP,
  FIXTURE_10_STRUTS,
  FIXTURE_11_BATCH,
  FIXTURE_12_MULTI_DOMAIN,
  FIXTURE_13_MULTI_DS,
  FIXTURE_14_EJB2X,
  FIXTURE_15_HIBERNATE,
  FIXTURE_16_MIXTE,
];

export const EJB_FIXTURES = ALL_FIXTURES.filter((f) => f.category === "ejb");
export const SERVLET_FIXTURES = ALL_FIXTURES.filter((f) => f.category === "servlet");
export const MULTI_TECH_FIXTURES = ALL_FIXTURES.filter((f) => f.category === "multi-tech");
export const EDGE_CASE_FIXTURES = ALL_FIXTURES.filter((f) => f.category === "edge-case");
