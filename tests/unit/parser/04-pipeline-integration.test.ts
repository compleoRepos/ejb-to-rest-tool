/**
 * tests/unit/parser/04-pipeline-integration.test.ts
 *
 * Tests unitaires pour le pipeline multi-tech.
 * Vérifie que runPipeline détecte et génère correctement
 * pour différentes combinaisons de technologies.
 *
 * IMPORTANT : Le pipeline utilise un registry singleton qui doit être
 * initialisé avec registerAllDetectors/registerAllGenerators avant usage.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { runPipeline } from "../../../server/engine/pipeline/index";
import { registry } from "../../../server/engine/registry/index";
import { registerAllDetectors } from "../../../server/engine/detectors/index";
import { registerAllGenerators } from "../../../server/engine/generators/index";

beforeAll(() => {
  registerAllDetectors(registry);
  registerAllGenerators(registry);
});

describe("Pipeline integration", () => {
  describe("Servlet detection via pipeline", () => {
    it("détecte un Servlet et génère un controller Spring", () => {
      const files = [
        {
          path: "src/main/java/com/bank/web/LoginServlet.java",
          content: `
            package com.bank.web;
            import javax.servlet.annotation.WebServlet;
            import javax.servlet.http.HttpServlet;
            import javax.servlet.http.HttpServletRequest;
            import javax.servlet.http.HttpServletResponse;
            @WebServlet("/login")
            public class LoginServlet extends HttpServlet {
              protected void doGet(HttpServletRequest req, HttpServletResponse resp) {
                resp.setStatus(200);
              }
              protected void doPost(HttpServletRequest req, HttpServletResponse resp) {
                String user = req.getParameter("user");
              }
            }
          `,
        },
      ];
      const result = runPipeline({
        files,
        basePackage: "com.bank.web",
        projectName: "test-servlet",
      });
      expect(result.technologiesDetected).toContain("SERVLET");
      expect(result.detectedComponents.length).toBeGreaterThanOrEqual(1);
      expect(result.generatedFiles.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("SOAP detection via pipeline", () => {
    it("détecte un @WebService et génère un controller REST", () => {
      const files = [
        {
          path: "src/main/java/com/bank/ws/AccountWS.java",
          content: `
            package com.bank.ws;
            import javax.jws.WebService;
            import javax.jws.WebMethod;
            @WebService(serviceName = "AccountService")
            public class AccountWS {
              @WebMethod
              public double getBalance(String accountNo) { return 1000.0; }
              @WebMethod
              public String transfer(String from, String to, double amount) { return "OK"; }
            }
          `,
        },
      ];
      const result = runPipeline({
        files,
        basePackage: "com.bank.ws",
        projectName: "test-soap",
      });
      expect(result.technologiesDetected).toContain("SOAP");
      expect(result.generatedFiles.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("JDBC detection via pipeline", () => {
    it("détecte du JDBC et génère un repository Spring Data", () => {
      const files = [
        {
          path: "src/main/java/com/bank/dao/AccountDao.java",
          content: `
            package com.bank.dao;
            import java.sql.Connection;
            import java.sql.PreparedStatement;
            import java.sql.ResultSet;
            public class AccountDao {
              private static final String SQL_GET = "SELECT BALANCE FROM T_ACCOUNTS WHERE ID=?";
              public double getBalance(Connection conn, String id) throws Exception {
                PreparedStatement ps = conn.prepareStatement(SQL_GET);
                ps.setString(1, id);
                ResultSet rs = ps.executeQuery();
                if (rs.next()) return rs.getDouble(1);
                return 0;
              }
            }
          `,
        },
      ];
      const result = runPipeline({
        files,
        basePackage: "com.bank.dao",
        projectName: "test-jdbc",
      });
      expect(result.technologiesDetected).toContain("JDBC");
    });
  });

  describe("JMS detection via pipeline", () => {
    it("détecte un MDB @MessageDriven", () => {
      const files = [
        {
          path: "src/main/java/com/bank/jms/PaymentMDB.java",
          content: `
            package com.bank.jms;
            import javax.ejb.MessageDriven;
            import javax.jms.MessageListener;
            import javax.jms.Message;
            @MessageDriven(activationConfig = {
              @ActivationConfigProperty(propertyName = "destinationType", propertyValue = "javax.jms.Queue")
            })
            public class PaymentMDB implements MessageListener {
              public void onMessage(Message msg) { }
            }
          `,
        },
      ];
      const result = runPipeline({
        files,
        basePackage: "com.bank.jms",
        projectName: "test-jms",
      });
      expect(result.technologiesDetected).toContain("JMS");
    });
  });

  describe("Batch detection via pipeline", () => {
    it("détecte un ItemReader JSR-352", () => {
      const files = [
        {
          path: "src/main/java/com/bank/batch/AccountReader.java",
          content: `
            package com.bank.batch;
            import javax.batch.api.chunk.ItemReader;
            public class AccountReader implements ItemReader {
              public Object readItem() { return null; }
              public void open(java.io.Serializable checkpoint) { }
              public void close() { }
            }
          `,
        },
      ];
      const result = runPipeline({
        files,
        basePackage: "com.bank.batch",
        projectName: "test-batch",
      });
      expect(result.technologiesDetected).toContain("BATCH");
    });
  });

  describe("Multi-tech project", () => {
    it("détecte EJB + Servlet dans le même projet", () => {
      const files = [
        {
          path: "src/main/java/com/bank/ejb/AccountEJB.java",
          content: `
            package com.bank.ejb;
            import javax.ejb.Stateless;
            @Stateless
            public class AccountEJB {
              public double getBalance(String id) { return 0; }
            }
          `,
        },
        {
          path: "src/main/java/com/bank/web/LoginServlet.java",
          content: `
            package com.bank.web;
            import javax.servlet.annotation.WebServlet;
            import javax.servlet.http.HttpServlet;
            @WebServlet("/login")
            public class LoginServlet extends HttpServlet {
              protected void doGet(javax.servlet.http.HttpServletRequest req, javax.servlet.http.HttpServletResponse resp) { }
            }
          `,
        },
      ];
      const result = runPipeline({
        files,
        basePackage: "com.bank",
        projectName: "test-multi",
      });
      // Doit détecter au moins 2 technologies
      const techs = result.technologiesDetected;
      expect(techs.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("Pipeline stats", () => {
    it("retourne des statistiques non-nulles", () => {
      const files = [
        {
          path: "src/main/java/com/bank/ejb/AccountEJB.java",
          content: `
            package com.bank.ejb;
            import javax.ejb.Stateless;
            @Stateless
            public class AccountEJB {
              public double getBalance(String id) { return 0; }
            }
          `,
        },
      ];
      const result = runPipeline({
        files,
        basePackage: "com.bank",
        projectName: "test-stats",
      });
      expect(result.stats).toBeDefined();
      expect(result.projectName).toBe("test-stats");
    });
  });

  describe("Pipeline validation", () => {
    it("retourne un résultat de validation", () => {
      const files = [
        {
          path: "src/main/java/com/bank/ejb/AccountEJB.java",
          content: `
            package com.bank.ejb;
            import javax.ejb.Stateless;
            @Stateless
            public class AccountEJB {
              public double getBalance(String id) { return 0; }
            }
          `,
        },
      ];
      const result = runPipeline({
        files,
        basePackage: "com.bank",
        projectName: "test-validation",
      });
      expect(result.validation).toBeDefined();
    });
  });
});
