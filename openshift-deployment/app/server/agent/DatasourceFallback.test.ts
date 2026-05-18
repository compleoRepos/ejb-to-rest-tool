/**
 * Tests pour le fallback DATASOURCE_MIGRATION et buildLegacyMigrationRules.
 * Valide que :
 * 1. Le rapport factuel est généré quand aucune datasource n'est détectée
 * 2. Le rapport factuel est généré avec des datasources
 * 3. buildLegacyMigrationRules détecte les patterns SOAP/EJB/JDBC
 */

import { describe, it, expect } from "vitest";
import { ReportEnhancer } from "../engine/ml/report-enhancer";
import { CompilationLoop } from "./CompilationLoop";

describe("DATASOURCE_MIGRATION Fallback", () => {
  const enhancer = new ReportEnhancer({
    ollamaUrl: "http://localhost:11434",
    model: "qwen2.5:1.5b",
    enabled: true,
    language: "fr",
  });

  it("should generate factual report when no datasources detected", async () => {
    const ctx = {
      projectName: "interface-send-sms",
      modules: [{ id: "SendSmsService", type: "SOAP" }],
      services: [{ name: "sms-service", confidence: 90 }],
      dataSources: [],
      useCasesCount: 2,
      confidenceScore: 90,
      qualityReport: { score: 85, grade: "B+", checks: [] },
      estimatedDuration: 3,
      criticalDependencies: [],
      requiredInfrastructure: [],
    };

    const report = await enhancer.enhanceDatasourceReport(ctx as any);

    expect(report).toContain("# Migration DataSources");
    expect(report).toContain("interface-send-sms");
    expect(report).toContain("Aucune DataSource détectée");
    expect(report).toContain("SOAP/REST/EJB");
    expect(report).toContain("Spring Data JPA");
    expect(report.length).toBeGreaterThan(100);
    expect(report).toContain("#");
  });

  it("should generate factual report with datasources when LLM fails", async () => {
    const ctx = {
      projectName: "virement-permanent",
      modules: [{ id: "VirementService", type: "EJB" }],
      services: [{ name: "virement-service", confidence: 85 }],
      dataSources: [
        {
          jndi: "java:/OracleDS",
          vendor: "ORACLE",
          schema: "VIREMENT",
          tables: ["T_VIREMENT", "T_BENEFICIAIRE", "T_COMPTE"],
          sqlFeatures: ["FOR UPDATE NOWAIT", "SEQUENCE"],
        },
      ],
      useCasesCount: 10,
      confidenceScore: 85,
      qualityReport: { score: 90, grade: "A", checks: [] },
      estimatedDuration: 6,
      criticalDependencies: [],
      requiredInfrastructure: [],
    };

    // Access private method via prototype trick
    const report = (enhancer as any).generateFactualDatasourceReport(ctx);

    expect(report).toContain("# Migration DataSources");
    expect(report).toContain("virement-permanent");
    expect(report).toContain("ORACLE");
    expect(report).toContain("java:/OracleDS");
    expect(report).toContain("T_VIREMENT");
    expect(report).toContain("FOR UPDATE NOWAIT");
    expect(report).toContain("oracle.jdbc.OracleDriver");
    expect(report).toContain("OracleDialect");
    expect(report).toContain("Strangler Fig Pattern");
    expect(report.length).toBeGreaterThan(200);
  });
});

describe("buildLegacyMigrationRules", () => {
  const loop = new CompilationLoop({ enableLLM: false });

  it("should detect SOAP SynchroneService pattern", () => {
    const content = `
      public class SendSmsServiceImpl {
        public void execute() {
          SynchroneService.process(envelope);
        }
      }
    `;
    const rules = (loop as any).buildLegacyMigrationRules(content);
    expect(rules).toContain("MIGRATION SOAP");
    expect(rules).toContain("WebClient");
    expect(rules).toContain("SynchroneService");
  });

  it("should detect Services.find() ServiceLocator pattern", () => {
    const content = `
      public class MyService {
        public void execute() {
          IService svc = Services.find(IService.class);
        }
      }
    `;
    const rules = (loop as any).buildLegacyMigrationRules(content);
    expect(rules).toContain("MIGRATION SERVICE LOCATOR");
    expect(rules).toContain("@Autowired");
  });

  it("should detect Envelope/VoIn/VoOut EAI pattern", () => {
    const content = `
      public class MyService {
        public Envelope execute(VoIn input) {
          VoOut output = new VoOut();
          return new Envelope(output);
        }
      }
    `;
    const rules = (loop as any).buildLegacyMigrationRules(content);
    expect(rules).toContain("MIGRATION EAI ENVELOPE");
    expect(rules).toContain("DTO");
  });

  it("should detect GenerateFlux XML pattern", () => {
    const content = `
      public class MyService {
        public String execute() {
          return GenerateFlux.generate(data);
        }
      }
    `;
    const rules = (loop as any).buildLegacyMigrationRules(content);
    expect(rules).toContain("MIGRATION FLUX XML");
    expect(rules).toContain("ObjectMapper");
  });

  it("should detect JNDI/InitialContext pattern", () => {
    const content = `
      public class MyService {
        public void execute() {
          Context ctx = new InitialContext();
          Object ref = ctx.lookup("java:comp/env/ejb/MyEJB");
        }
      }
    `;
    const rules = (loop as any).buildLegacyMigrationRules(content);
    expect(rules).toContain("MIGRATION JNDI");
  });

  it("should detect EJB annotations", () => {
    const content = `
      @Stateless
      public class MyBean {
        @EJB
        private IRemoteService remoteService;
      }
    `;
    const rules = (loop as any).buildLegacyMigrationRules(content);
    expect(rules).toContain("MIGRATION EJB");
    expect(rules).toContain("@Service");
  });

  it("should detect JDBC direct access", () => {
    const content = `
      public class MyDAO {
        public List<String> findAll() {
          PreparedStatement ps = conn.prepareStatement("SELECT * FROM T_DATA");
          ResultSet rs = ps.executeQuery();
          return results;
        }
      }
    `;
    const rules = (loop as any).buildLegacyMigrationRules(content);
    expect(rules).toContain("MIGRATION JDBC");
    expect(rules).toContain("JpaRepository");
  });

  it("should return empty rules for clean Spring Boot code", () => {
    const content = `
      @Service
      @RequiredArgsConstructor
      public class MyService {
        private final MyRepository repository;
        public List<Entity> findAll() {
          return repository.findAll();
        }
      }
    `;
    const rules = (loop as any).buildLegacyMigrationRules(content);
    expect(rules.trim()).toBe("");
  });
});
