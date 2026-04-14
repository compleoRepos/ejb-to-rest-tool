/**
 * tests/unit/parser/03-multitech-detection.test.ts
 *
 * Tests unitaires pour la détection multi-technologies.
 * Vérifie que les détecteurs identifient correctement
 * Servlet, SOAP, JMS, Batch, JAX-RS, Hibernate, JDBC.
 */
import { describe, it, expect } from "vitest";
import {
  ServletDetector,
  SoapDetector,
  JmsDetector,
  BatchDetector,
  JaxRsDetector,
  HibernateDetector,
  JdbcDetector,
  Ejb3xDetector,
  StrutsDetector,
} from "../../../server/engine/detectors/index";

describe("Multi-tech detection", () => {
  describe("ServletDetector", () => {
    const detector = new ServletDetector();

    it("détecte @WebServlet", () => {
      const content = `
        package com.bank.web;
        import javax.servlet.annotation.WebServlet;
        import javax.servlet.http.HttpServlet;
        @WebServlet("/login")
        public class LoginServlet extends HttpServlet {
          protected void doGet(HttpServletRequest req, HttpServletResponse resp) { }
        }
      `;
      expect(detector.canDetect(content, "LoginServlet.java")).toBe(true);
      const components = detector.detect(content, "LoginServlet.java");
      expect(components.length).toBeGreaterThanOrEqual(1);
      expect(components[0].technology).toBe("SERVLET");
    });

    it("détecte extends HttpServlet", () => {
      const content = `
        package com.bank.web;
        import javax.servlet.http.HttpServlet;
        public class OldServlet extends HttpServlet {
          protected void doPost(HttpServletRequest req, HttpServletResponse resp) { }
        }
      `;
      expect(detector.canDetect(content, "OldServlet.java")).toBe(true);
    });

    it("ne détecte pas un POJO normal", () => {
      const content = `
        package com.bank.service;
        public class AccountService {
          public double getBalance(String id) { return 0; }
        }
      `;
      expect(detector.canDetect(content, "AccountService.java")).toBe(false);
    });
  });

  describe("SoapDetector", () => {
    const detector = new SoapDetector();

    it("détecte @WebService", () => {
      const content = `
        package com.bank.ws;
        import javax.jws.WebService;
        @WebService
        public class AccountWS {
          public double getBalance(String accountNo) { return 0; }
        }
      `;
      expect(detector.canDetect(content, "AccountWS.java")).toBe(true);
      const components = detector.detect(content, "AccountWS.java");
      expect(components.length).toBeGreaterThanOrEqual(1);
      expect(components[0].technology).toBe("SOAP");
    });

    it("détecte @WebMethod", () => {
      const content = `
        package com.bank.ws;
        import javax.jws.WebMethod;
        public class PaymentWS {
          @WebMethod
          public String processPayment(String req) { return "OK"; }
        }
      `;
      expect(detector.canDetect(content, "PaymentWS.java")).toBe(true);
    });
  });

  describe("JmsDetector", () => {
    const detector = new JmsDetector();

    it("détecte @MessageDriven", () => {
      const content = `
        package com.bank.jms;
        import javax.ejb.MessageDriven;
        import javax.jms.MessageListener;
        @MessageDriven(activationConfig = {
          @ActivationConfigProperty(propertyName = "destinationType", propertyValue = "javax.jms.Queue")
        })
        public class PaymentMDB implements MessageListener {
          public void onMessage(javax.jms.Message msg) { }
        }
      `;
      expect(detector.canDetect(content, "PaymentMDB.java")).toBe(true);
      const components = detector.detect(content, "PaymentMDB.java");
      expect(components.length).toBeGreaterThanOrEqual(1);
      expect(components[0].technology).toBe("JMS");
    });

    it("détecte javax.jms imports", () => {
      const content = `
        package com.bank.jms;
        import javax.jms.QueueSender;
        import javax.jms.QueueSession;
        public class NotificationSender {
          private QueueSender sender;
          public void send(String msg) { }
        }
      `;
      expect(detector.canDetect(content, "NotificationSender.java")).toBe(true);
    });
  });

  describe("BatchDetector", () => {
    const detector = new BatchDetector();

    it("détecte JSR-352 ItemReader", () => {
      const content = `
        package com.bank.batch;
        import javax.batch.api.chunk.ItemReader;
        public class AccountReader implements ItemReader {
          public Object readItem() { return null; }
          public void open(java.io.Serializable checkpoint) { }
          public void close() { }
        }
      `;
      expect(detector.canDetect(content, "AccountReader.java")).toBe(true);
      const components = detector.detect(content, "AccountReader.java");
      expect(components.length).toBeGreaterThanOrEqual(1);
      expect(components[0].technology).toBe("BATCH");
    });

    it("détecte @BatchProperty", () => {
      const content = `
        package com.bank.batch;
        import javax.batch.api.BatchProperty;
        import javax.inject.Inject;
        public class ReportBatchlet {
          @Inject @BatchProperty
          private String reportType;
          public String process() { return "COMPLETED"; }
        }
      `;
      expect(detector.canDetect(content, "ReportBatchlet.java")).toBe(true);
    });
  });

  describe("JaxRsDetector", () => {
    const detector = new JaxRsDetector();

    it("détecte @Path", () => {
      const content = `
        package com.bank.rest;
        import javax.ws.rs.Path;
        import javax.ws.rs.GET;
        @Path("/accounts")
        public class AccountResource {
          @GET
          public String getAccounts() { return "[]"; }
        }
      `;
      expect(detector.canDetect(content, "AccountResource.java")).toBe(true);
      const components = detector.detect(content, "AccountResource.java");
      expect(components.length).toBeGreaterThanOrEqual(1);
      expect(components[0].technology).toBe("JAX_RS");
    });
  });

  describe("HibernateDetector", () => {
    const detector = new HibernateDetector();

    it("détecte SessionFactory Hibernate", () => {
      const content = `
        package com.bank.dao;
        import org.hibernate.SessionFactory;
        import org.hibernate.Session;
        public class AccountDao {
          private SessionFactory sessionFactory;
          public Object findById(Long id) {
            Session session = sessionFactory.openSession();
            return session.get(Object.class, id);
          }
        }
      `;
      expect(detector.canDetect(content, "AccountDao.java")).toBe(true);
      const components = detector.detect(content, "AccountDao.java");
      expect(components.length).toBeGreaterThanOrEqual(1);
      expect(components[0].technology).toBe("HIBERNATE");
    });
  });

  describe("JdbcDetector", () => {
    const detector = new JdbcDetector();

    it("détecte java.sql.Connection", () => {
      const content = `
        package com.bank.dao;
        import java.sql.Connection;
        import java.sql.PreparedStatement;
        import java.sql.ResultSet;
        public class AccountJdbcDao {
          public double getBalance(Connection conn, String id) {
            PreparedStatement ps = conn.prepareStatement("SELECT BALANCE FROM T_ACCOUNTS WHERE ID=?");
            ps.setString(1, id);
            ResultSet rs = ps.executeQuery();
            return rs.getDouble(1);
          }
        }
      `;
      expect(detector.canDetect(content, "AccountJdbcDao.java")).toBe(true);
      const components = detector.detect(content, "AccountJdbcDao.java");
      expect(components.length).toBeGreaterThanOrEqual(1);
      expect(components[0].technology).toBe("JDBC");
    });
  });

  describe("Ejb3xDetector", () => {
    const detector = new Ejb3xDetector();

    it("détecte @Stateless", () => {
      const content = `
        package com.bank.service;
        import javax.ejb.Stateless;
        @Stateless
        public class AccountService {
          public double getBalance(String id) { return 0; }
        }
      `;
      expect(detector.canDetect(content, "AccountService.java")).toBe(true);
    });

    it("détecte @Singleton", () => {
      const content = `
        package com.bank.service;
        import javax.ejb.Singleton;
        @Singleton
        public class CacheService {
          public Object get(String key) { return null; }
        }
      `;
      expect(detector.canDetect(content, "CacheService.java")).toBe(true);
    });
  });

  describe("StrutsDetector", () => {
    const detector = new StrutsDetector();

    it("détecte extends Action (Struts 1)", () => {
      const content = `
        package com.bank.web;
        import org.apache.struts.action.Action;
        import org.apache.struts.action.ActionForm;
        import org.apache.struts.action.ActionForward;
        import org.apache.struts.action.ActionMapping;
        public class LoginAction extends Action {
          public ActionForward execute(ActionMapping mapping, ActionForm form,
            HttpServletRequest request, HttpServletResponse response) {
            return mapping.findForward("success");
          }
        }
      `;
      expect(detector.canDetect(content, "LoginAction.java")).toBe(true);
      const components = detector.detect(content, "LoginAction.java");
      expect(components.length).toBeGreaterThanOrEqual(1);
    });
  });
});
