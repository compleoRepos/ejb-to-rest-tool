/**
 * RAG Integration Test — Real BOA/BMCE Project Examples
 *
 * Tests the full RAG pipeline with 15 real-world migration examples
 * extracted from avis-opere, activation-carte, commander-chequier,
 * and mise-disposition projects.
 *
 * Validates:
 *   1. Seed data loads correctly (15 examples)
 *   2. Semantic search returns relevant results for each project type
 *   3. Cross-project search finds the best matching pattern
 *   4. Edge cases: empty queries, very short queries, unknown patterns
 */

import { describe, it, expect, beforeAll } from "vitest";
import { EmbeddingService, MigrationPair } from "../../server/engine/ml/embedding-service";
import { RAG_SEED_EXAMPLES } from "../../server/engine/ml/rag-seed-data";

describe("RAG Real Projects Integration", () => {
  let service: EmbeddingService;

  beforeAll(async () => {
    service = new EmbeddingService("http://localhost:99999", "http://localhost:99999");
    await service.initialize();
    await service.seedFromExamples();
  });

  // ── Seed Data Validation ──────────────────────────────────────

  describe("Seed Data", () => {
    it("should have 15 real-world examples", () => {
      expect(RAG_SEED_EXAMPLES.length).toBe(15);
    });

    it("should load all 15 examples into memory", () => {
      expect(service.getMemoryCount()).toBe(15);
    });

    it("should not duplicate on re-seed", async () => {
      const count = await service.seedFromExamples();
      expect(count).toBe(0); // All already indexed
      expect(service.getMemoryCount()).toBe(15);
    });

    it("should cover all 4 projects", () => {
      const projects = new Set(RAG_SEED_EXAMPLES.map(e => {
        if (e.id.startsWith("avis-opere")) return "avis-opere";
        if (e.id.startsWith("activation-carte")) return "activation-carte";
        if (e.id.startsWith("commander-chequier")) return "commander-chequier";
        if (e.id.startsWith("mise-disposition")) return "mise-disposition";
        return "common";
      }));
      expect(projects.has("avis-opere")).toBe(true);
      expect(projects.has("activation-carte")).toBe(true);
      expect(projects.has("commander-chequier")).toBe(true);
      expect(projects.has("mise-disposition")).toBe(true);
      expect(projects.has("common")).toBe(true);
    });

    it("should cover all major categories", () => {
      const categories = new Set(RAG_SEED_EXAMPLES.map(e => e.category));
      expect(categories.has("EJB_STATELESS_BEAN")).toBe(true);
      expect(categories.has("JDBC_DAO_RAW")).toBe(true);
      expect(categories.has("SOAP_WEBSERVICE_CLIENT")).toBe(true);
      expect(categories.has("JPA_ENTITY_SERVICE")).toBe(true);
      expect(categories.has("EJB_JDBC_DATASOURCE")).toBe(true);
      expect(categories.has("EMAIL_SERVICE_LEGACY")).toBe(true);
    });
  });

  // ── Avis-Opere Searches ───────────────────────────────────────

  describe("Avis-Opere Pattern Search", () => {
    it("should find EJB Stateless Bean pattern for @Stateless + UCStrategie", async () => {
      const results = await service.findSimilar(`
        @Stateless(name = "myBean")
        @Remote(SynchroneService.class)
        public class myBean extends UCStrategie {
            public Envelope process(Envelope env) { return super.process(env); }
        }
      `, 3);

      expect(results.length).toBeGreaterThan(0);
      const ids = results.map(r => r.id);
      // Should match one of the EJB bean examples
      expect(ids.some(id => id.includes("ejb-bean"))).toBe(true);
    });

    it("should find JPA Service pattern for @Service + @Autowired + PersistenceException", async () => {
      const results = await service.findSimilar(`
        @Service
        @ContinueOrStartTransaction
        public class MyService {
            @Autowired
            private ISearchService searchService;
            public String getTypes(String nature) throws PersistenceException {
                List<TypeAoRd> list = searchService.getListTypes(nature);
                return list.stream().map(TypeAoRd::getCode).collect(Collectors.joining(","));
            }
        }
      `, 3);

      expect(results.length).toBeGreaterThan(0);
      const categories = results.map(r => r.meta.javaType);
      // Should match JPA or UseCase pattern
      expect(categories.some(c =>
        c.includes("JPA") || c.includes("USECASE") || c.includes("SERVICE")
      )).toBe(true);
    });
  });

  // ── Commander-Chequier Searches ───────────────────────────────

  describe("Commander-Chequier Pattern Search", () => {
    it("should find JDBC DAO pattern for PreparedStatement + INSERT", async () => {
      const results = await service.findSimilar(`
        public class MyDao {
            public static void save(MyEntity entity, Connection conn) throws SQLException {
                PreparedStatement stmt = null;
                try {
                    String query = "INSERT INTO MY_TABLE (COL1, COL2) VALUES (?, ?)";
                    stmt = conn.prepareStatement(query);
                    stmt.setString(1, entity.getCol1());
                    stmt.setString(2, entity.getCol2());
                    stmt.executeUpdate();
                } finally {
                    if (stmt != null) stmt.close();
                }
            }
        }
      `, 3);

      expect(results.length).toBeGreaterThan(0);
      const ids = results.map(r => r.id);
      // Should match JDBC DAO examples
      expect(ids.some(id =>
        id.includes("dao") || id.includes("jdbc") || id.includes("notification")
      )).toBe(true);
    });

    it("should find SOAP WebService pattern for new XXXService().getPort()", async () => {
      const results = await service.findSimilar(`
        ICommandeService service = new ICommandeService();
        ICommandeServicePortType port = service.getICommandeServicePort();
        SuiviCommandeResponse response = port.suiviCommande(request);
      `, 3);

      expect(results.length).toBeGreaterThan(0);
      const ids = results.map(r => r.id);
      // Should match SOAP example
      expect(ids.some(id => id.includes("soap") || id.includes("commander"))).toBe(true);
    });

    it("should find @Resource DataSource pattern", async () => {
      const results = await service.findSimilar(`
        @Stateless(name = "MyService")
        @Remote(SynchroneService.class)
        public class MyService implements SynchroneService {
            @Resource(name = "jdbc/mydb_xa")
            private DataSource myDataSource;

            public Envelope process(Envelope env) {
                Connection conn = myDataSource.getConnection();
                // ...
            }
        }
      `, 3);

      expect(results.length).toBeGreaterThan(0);
      const ids = results.map(r => r.id);
      // Should match EJB+JDBC example
      expect(ids.some(id =>
        id.includes("jdbc") || id.includes("ejb") || id.includes("datasource")
      )).toBe(true);
    });
  });

  // ── Activation-Carte Searches ─────────────────────────────────

  describe("Activation-Carte Pattern Search", () => {
    it("should find UseCase + external API pattern", async () => {
      const results = await service.findSimilar(`
        @UseCase
        @Transactional(propagation = Propagation.NOT_SUPPORTED)
        public class MyUseCase implements BaseUseCase {
            @Autowired
            AuthentificationService auth;
            @Autowired
            ExternalApiService apiService;

            public ValueObject execute(ValueObject voIn) {
                String token = auth.getValidToken(corporateId).getToken();
                return apiService.callExternalApi(token, request);
            }
        }
      `, 3);

      expect(results.length).toBeGreaterThan(0);
      const ids = results.map(r => r.id);
      // Should match activation-carte or usecase examples
      expect(ids.some(id =>
        id.includes("activation") || id.includes("usecase")
      )).toBe(true);
    });
  });

  // ── Mise-Disposition Searches ─────────────────────────────────

  describe("Mise-Disposition Pattern Search", () => {
    it("should find Hibernate DAO pattern for SessionFactory + createSQLQuery", async () => {
      const results = await service.findSimilar(`
        public class MyHibernateDao {
            @Autowired
            private SessionFactory sessionFactory;

            public List<MyEntity> findByCompte(String numCompte) {
                Session session = sessionFactory.getCurrentSession();
                Query query = session.createSQLQuery(
                    "SELECT * FROM MY_TABLE WHERE NUM_COMPTE = :numCompte"
                );
                query.setParameter("numCompte", numCompte);
                return query.list();
            }
        }
      `, 3);

      expect(results.length).toBeGreaterThan(0);
      const ids = results.map(r => r.id);
      // Should match mise-disposition Hibernate example
      expect(ids.some(id =>
        id.includes("mise-disposition") || id.includes("hibernate") || id.includes("jdbc")
      )).toBe(true);
    });
  });

  // ── Common Pattern Searches ───────────────────────────────────

  describe("Common Pattern Search", () => {
    it("should find Envelope XML parsing pattern", async () => {
      const results = await service.findSimilar(`
        String action = Parser.getValueFromXml(envelopeIn.getBody(), "flux/action");
        String numAccount = Parser.getValueFromXml(envelopeIn.getBody(), "flux/numAccount");
        Envelope envOut = new Envelope();
        envOut.setBody("<flux><result>" + result + "</result></flux>");
      `, 3);

      expect(results.length).toBeGreaterThan(0);
      const ids = results.map(r => r.id);
      expect(ids.some(id => id.includes("envelope") || id.includes("common"))).toBe(true);
    });

    it("should find EaiLog pattern", async () => {
      const results = await service.findSimilar(`
        EaiLog.initLogTraceInfos(envelopeIn);
        EaiLog.info("Processing request: " + request);
        EaiLog.error("Error: ", e);
      `, 3);

      expect(results.length).toBeGreaterThan(0);
      const ids = results.map(r => r.id);
      expect(ids.some(id => id.includes("logging") || id.includes("common"))).toBe(true);
    });

    it("should find Email service pattern", async () => {
      const results = await service.findSimilar(`
        Properties props = new Properties();
        props.put("mail.smtp.host", SMTP_HOST);
        Session session = Session.getDefaultInstance(props);
        MimeMessage message = new MimeMessage(session);
        message.setFrom(new InternetAddress(FROM));
        Transport.send(message);
      `, 3);

      expect(results.length).toBeGreaterThan(0);
      const ids = results.map(r => r.id);
      expect(ids.some(id => id.includes("email"))).toBe(true);
    });

    it("should find JNDI DataSource config pattern", async () => {
      const results = await service.findSimilar(`
        <persistence-unit name="myPU" transaction-type="JTA">
            <jta-data-source>jdbc/mydb_xa</jta-data-source>
            <property name="hibernate.dialect" value="org.hibernate.dialect.Oracle12cDialect"/>
        </persistence-unit>
      `, 3);

      expect(results.length).toBeGreaterThan(0);
      const ids = results.map(r => r.id);
      expect(ids.some(id => id.includes("datasource") || id.includes("config"))).toBe(true);
    });

    it("should find FwkRollbackException pattern", async () => {
      const results = await service.findSimilar(`
        public class CompteException extends FwkRollbackException {
            public CompteException(String message) { super(message); }
        }
        if (!isValidAccount(numCompte)) {
            throw new FormatNumcompteInvalideException("Format invalide");
        }
      `, 3);

      expect(results.length).toBeGreaterThan(0);
      const ids = results.map(r => r.id);
      expect(ids.some(id => id.includes("exception") || id.includes("common"))).toBe(true);
    });
  });

  // ── Edge Cases ────────────────────────────────────────────────

  describe("Edge Cases", () => {
    it("should return results for very short queries", async () => {
      const results = await service.findSimilar("@Stateless", 3);
      expect(results.length).toBeGreaterThan(0);
    });

    it("should return results for unknown patterns (best effort)", async () => {
      const results = await service.findSimilar(`
        public class UnknownPattern {
            private SomeService service;
            public void doSomething() { service.call(); }
        }
      `, 3);
      // Should still return something (best effort matching)
      expect(results.length).toBeGreaterThan(0);
    });

    it("should return correct modern code in results", async () => {
      const results = await service.findSimilar(`
        @Stateless(name = "myBean")
        @Remote(SynchroneService.class)
        public class myBean extends UCStrategie {
            public Envelope process(Envelope env) { return super.process(env); }
        }
      `, 1);

      expect(results.length).toBe(1);
      // The modern code should contain Spring Boot patterns
      expect(results[0].springCode).toContain("@");
      expect(results[0].springCode.length).toBeGreaterThan(100);
    });

    it("should respect topK parameter", async () => {
      const results1 = await service.findSimilar("@Stateless DataSource Connection", 1);
      const results5 = await service.findSimilar("@Stateless DataSource Connection", 5);
      expect(results1.length).toBe(1);
      expect(results5.length).toBe(5);
    });
  });

  // ── Cross-Project Relevance ───────────────────────────────────

  describe("Cross-Project Relevance", () => {
    it("should rank JDBC DAO higher than EJB Bean for SQL INSERT query", async () => {
      const results = await service.findSimilar(`
        PreparedStatement stmt = conn.prepareStatement("INSERT INTO TABLE (COL) VALUES (?)");
        stmt.setString(1, value);
        stmt.executeUpdate();
        stmt.close();
        conn.close();
      `, 5);

      // First result should be JDBC-related, not EJB bean
      expect(results[0].meta.javaType).toMatch(/JDBC|DAO|NOTIFICATION/);
    });

    it("should rank SOAP higher than JDBC for WebService + getPort", async () => {
      const results = await service.findSimilar(`
        IMyService service = new IMyService();
        IMyServicePortType port = service.getIMyServicePort();
        MyResponse response = port.myOperation(request);
      `, 5);

      // First result should be SOAP-related
      expect(results[0].meta.javaType).toMatch(/SOAP|WEBSERVICE/);
    });
  });
});
