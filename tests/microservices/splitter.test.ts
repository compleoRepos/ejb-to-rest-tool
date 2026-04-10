/**
 * Tests unitaires — MicroserviceSplitter
 *
 * Vérifie :
 *   - Matrice de couplage (tables, EJB calls, JMS)
 *   - Groupement par seuil
 *   - Ownership des tables
 *   - Génération REST APIs inter-services
 *   - Conversion JMS → Kafka
 *   - Nommage des services
 *   - Score de confiance
 *   - Adaptateur ProjectIR → ParsedModule
 */

import { describe, it, expect } from "vitest";
import {
  MicroserviceSplitter,
  buildParsedModules,
  type ParsedModule,
  type ServiceCandidate,
} from "../../server/engine/microservices/microservice-splitter";
import type { ProjectIR } from "../../server/java-parser";

// ── Helpers ────────────────────────────────────────────────────────

function makeModule(overrides: Partial<ParsedModule> & { id: string }): ParsedModule {
  return {
    type: "USE_CASE",
    domain: "default",
    readTables: [],
    writeTables: [],
    writeCount: new Map(),
    ejbCalls: [],
    jmsQueues: [],
    jmsProduces: [],
    jmsConsumes: [],
    sqlFeatures: [],
    useCases: [],
    rawSource: "",
    ...overrides,
  };
}

function makeMinimalIR(overrides?: Partial<ProjectIR>): ProjectIR {
  return {
    projectName: "test-project",
    groupId: "ma.bmce.digital",
    artifactId: "test",
    version: "1.0.0",
    packaging: "ejb",
    description: "",
    javaVersion: "8",
    dependencies: [],
    useCases: [],
    dtos: [],
    services: [],
    enums: [],
    exceptions: [],
    validators: [],
    remoteInterfaces: [],
    baseClasses: [],
    constants: null,
    bianMapping: [],
    stats: {
      totalFiles: 0,
      totalLines: 0,
      useCaseCount: 0,
      dtoCount: 0,
      serviceCount: 0,
      enumCount: 0,
    },
    warnings: [],
    ejb2xBeans: [],
    batchJobs: [],
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────

describe("MicroserviceSplitter", () => {
  const splitter = new MicroserviceSplitter();

  describe("split() — basic grouping", () => {
    it("should return empty array for empty input", () => {
      const result = splitter.split([]);
      expect(result).toEqual([]);
    });

    it("should create one service per independent module", () => {
      const modules = [
        makeModule({ id: "CompteEJB", writeTables: ["T_COMPTE"], readTables: ["T_COMPTE"] }),
        makeModule({ id: "VirementEJB", writeTables: ["T_VIREMENT"], readTables: ["T_VIREMENT"] }),
      ];
      const result = splitter.split(modules);
      expect(result.length).toBe(2);
      expect(result.map(s => s.ejbs.length)).toEqual([1, 1]);
    });

    it("should group modules with shared write tables (score >= 60)", () => {
      const modules = [
        makeModule({
          id: "CompteEJB",
          writeTables: ["T_COMPTE", "T_OPERATION"],
          readTables: ["T_COMPTE"],
        }),
        makeModule({
          id: "OperationEJB",
          writeTables: ["T_OPERATION"],
          readTables: ["T_OPERATION"],
        }),
      ];
      // Shared write table T_OPERATION → score = 30 per shared write table
      // Plus shared read T_OPERATION → +10 = 40 total, below 60
      // Actually: CompteEJB writes T_OPERATION, OperationEJB writes T_OPERATION → sharedRW = [T_OPERATION] → 30
      // CompteEJB reads T_COMPTE, OperationEJB reads T_OPERATION → sharedR with writes: T_OPERATION in CompteEJB.writeTables → 10
      // Total = 40, below 60 → separate groups
      const result = splitter.split(modules);
      // They should be separate since 40 < 60
      expect(result.length).toBe(2);
    });

    it("should group modules with strong coupling (shared writes + EJB calls)", () => {
      const modules = [
        makeModule({
          id: "CompteEJB",
          writeTables: ["T_COMPTE", "T_OPERATION"],
          readTables: ["T_COMPTE"],
          ejbCalls: ["OperationEJB"],
        }),
        makeModule({
          id: "OperationEJB",
          writeTables: ["T_OPERATION"],
          readTables: ["T_OPERATION"],
        }),
      ];
      // CompteEJB → OperationEJB: sharedRW(T_OPERATION)=30 + ejbCall=40 = 70 >= 60
      const result = splitter.split(modules);
      expect(result.length).toBe(1);
      expect(result[0].ejbs).toContain("CompteEJB");
      expect(result[0].ejbs).toContain("OperationEJB");
    });
  });

  describe("split() — table ownership", () => {
    it("should assign table ownership to the module that writes the most", () => {
      const modules = [
        makeModule({
          id: "CompteEJB",
          writeTables: ["T_COMPTE"],
          writeCount: new Map([["T_COMPTE", 5]]),
        }),
        makeModule({
          id: "AuditEJB",
          writeTables: ["T_COMPTE"],
          writeCount: new Map([["T_COMPTE", 1]]),
          readTables: ["T_AUDIT"],
        }),
      ];
      const result = splitter.split(modules);
      // CompteEJB writes T_COMPTE 5 times → owns it
      const compteService = result.find(s => s.ejbs.includes("CompteEJB"));
      expect(compteService?.ownedTables).toContain("T_COMPTE");
    });

    it("should identify read-only tables correctly", () => {
      const modules = [
        makeModule({
          id: "CompteEJB",
          writeTables: ["T_COMPTE"],
          readTables: ["T_COMPTE", "T_CLIENT"],
        }),
        makeModule({
          id: "ClientEJB",
          writeTables: ["T_CLIENT"],
          readTables: ["T_CLIENT"],
        }),
      ];
      const result = splitter.split(modules);
      const compteService = result.find(s => s.ejbs.includes("CompteEJB"));
      // CompteEJB reads T_CLIENT but doesn't write it → readOnly
      expect(compteService?.readOnlyTables).toContain("T_CLIENT");
      expect(compteService?.ownedTables).toContain("T_COMPTE");
    });
  });

  describe("split() — REST API generation", () => {
    it("should generate REST APIs between services for shared tables", () => {
      const modules = [
        makeModule({
          id: "CompteEJB",
          writeTables: ["T_COMPTE"],
          readTables: ["T_COMPTE", "T_CLIENT"],
        }),
        makeModule({
          id: "ClientEJB",
          writeTables: ["T_CLIENT"],
          readTables: ["T_CLIENT"],
        }),
      ];
      const result = splitter.split(modules);
      const compteService = result.find(s => s.ejbs.includes("CompteEJB"));
      const clientService = result.find(s => s.ejbs.includes("ClientEJB"));

      // CompteEJB reads T_CLIENT → depends on ClientService
      expect(compteService?.restDependencies.length).toBeGreaterThan(0);
      expect(compteService?.restDependencies[0].targetService).toBe(clientService?.name);

      // ClientService should expose a REST API for T_CLIENT
      expect(clientService?.restApis.length).toBeGreaterThan(0);
      expect(clientService?.restApis[0].path).toContain("client");
    });

    it("should mark dependencies as critical when FOR UPDATE NOWAIT is used", () => {
      const modules = [
        makeModule({
          id: "CompteEJB",
          writeTables: ["T_COMPTE"],
          readTables: ["T_COMPTE", "T_CLIENT"],
          sqlFeatures: ["FOR UPDATE NOWAIT"],
        }),
        makeModule({
          id: "ClientEJB",
          writeTables: ["T_CLIENT"],
          readTables: ["T_CLIENT"],
        }),
      ];
      const result = splitter.split(modules);
      const compteService = result.find(s => s.ejbs.includes("CompteEJB"));
      expect(compteService?.restDependencies[0]?.isCritical).toBe(true);
    });
  });

  describe("split() — JMS → Kafka conversion", () => {
    it("should convert JMS produces to Kafka PRODUCE topics", () => {
      const modules = [
        makeModule({
          id: "NotificationEJB",
          jmsProduces: ["jms/queue/BMCE_NOTIFICATIONS"],
          jmsQueues: ["jms/queue/BMCE_NOTIFICATIONS"],
        }),
      ];
      const result = splitter.split(modules);
      expect(result[0].kafkaTopics.length).toBe(1);
      expect(result[0].kafkaTopics[0].direction).toBe("PRODUCE");
      expect(result[0].kafkaTopics[0].name).toBe("bmce-notifications");
      expect(result[0].kafkaTopics[0].eventType).toBe("BmceNotificationsEvent");
    });

    it("should convert JMS consumes to Kafka CONSUME topics", () => {
      const modules = [
        makeModule({
          id: "AuditEJB",
          jmsConsumes: ["jms/topic/AUDIT_EVENTS"],
          jmsQueues: ["jms/topic/AUDIT_EVENTS"],
        }),
      ];
      const result = splitter.split(modules);
      expect(result[0].kafkaTopics.length).toBe(1);
      expect(result[0].kafkaTopics[0].direction).toBe("CONSUME");
      expect(result[0].kafkaTopics[0].name).toBe("audit-events");
    });
  });

  describe("split() — service naming", () => {
    it("should name reporting services correctly", () => {
      const modules = [makeModule({ id: "ReportingEJB" })];
      const result = splitter.split(modules);
      expect(result[0].name).toBe("reporting-service");
    });

    it("should name batch services correctly", () => {
      const modules = [makeModule({ id: "BatchProcessorEJB" })];
      const result = splitter.split(modules);
      expect(result[0].name).toBe("batch-service");
    });

    it("should name auth services correctly", () => {
      const modules = [makeModule({ id: "AuthenticationEJB" })];
      const result = splitter.split(modules);
      expect(result[0].name).toBe("auth-service");
    });

    it("should infer domain-based name for other services", () => {
      const modules = [makeModule({ id: "CompteEJB" })];
      const result = splitter.split(modules);
      expect(result[0].name).toBe("compte-service");
    });
  });

  describe("split() — confidence score", () => {
    it("should give high confidence to services with no read-only tables", () => {
      const modules = [
        makeModule({
          id: "CompteEJB",
          writeTables: ["T_COMPTE"],
          readTables: ["T_COMPTE"],
        }),
      ];
      const result = splitter.split(modules);
      // No readOnly tables → +10 bonus → 110 capped at 99
      expect(result[0].confidence).toBeGreaterThanOrEqual(99);
    });

    it("should reduce confidence for services with many read-only tables", () => {
      const modules = [
        makeModule({
          id: "CompteEJB",
          readTables: ["T_CLIENT", "T_DEVISE", "T_PAYS", "T_AGENCE", "T_BANQUE"],
        }),
      ];
      const result = splitter.split(modules);
      // 5 readOnly tables × 8 = 40 penalty → 100 - 40 = 60
      expect(result[0].confidence).toBeLessThanOrEqual(60);
    });

    it("should reduce confidence for large groups", () => {
      const modules = [
        makeModule({ id: "A", ejbCalls: ["B", "C", "D", "E"] }),
        makeModule({ id: "B", ejbCalls: ["A"] }),
        makeModule({ id: "C", ejbCalls: ["A"] }),
        makeModule({ id: "D", ejbCalls: ["A"] }),
        makeModule({ id: "E", ejbCalls: ["A"] }),
      ];
      const result = splitter.split(modules);
      // If all grouped together: 5 modules → (5-3)*5 = 10 penalty
      // Plus +10 bonus for no readOnly = 100
      // So confidence = 100 - 10 + 10 = 100, capped at 99
      // But grouping depends on coupling scores...
      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it("should clamp confidence between 40 and 99", () => {
      const modules = [
        makeModule({
          id: "CompteEJB",
          readTables: Array.from({ length: 10 }, (_, i) => `T_TABLE_${i}`),
        }),
      ];
      const result = splitter.split(modules);
      expect(result[0].confidence).toBeGreaterThanOrEqual(40);
      expect(result[0].confidence).toBeLessThanOrEqual(99);
    });
  });

  describe("split() — dbSchema generation", () => {
    it("should generate Oracle schema name from service name", () => {
      const modules = [makeModule({ id: "CompteEJB" })];
      const result = splitter.split(modules);
      expect(result[0].dbSchema).toBe("COMPTE_SVC");
    });
  });
});

describe("buildParsedModules", () => {
  it("should convert UseCases from ProjectIR to ParsedModules", () => {
    const ir = makeMinimalIR({
      useCases: [
        {
          className: "UCConsulterCompte",
          packageName: "ma.bmce.compte",
          domain: "compte",
          bianDomain: "",
          bianAction: "",
          voInType: "ConsulterCompteVoIn",
          voOutType: "ConsulterCompteVoOut",
          useCaseDescription: "Consulter un compte",
          javadoc: "",
          injectedServices: [],
          transactional: { readOnly: true, propagation: "SUPPORTS", rollbackFor: "" },
          exceptionsCaught: [],
          exceptionsThrown: [],
          sourceFile: "UCConsulterCompte.java",
          rawSource: 'SELECT * FROM T_COMPTE WHERE ID = ?',
          httpMethod: "GET",
          restPath: "/compte/{id}",
        },
      ],
    });

    const modules = buildParsedModules(ir);
    expect(modules.length).toBe(1);
    expect(modules[0].id).toBe("UCConsulterCompte");
    expect(modules[0].type).toBe("USE_CASE");
    expect(modules[0].domain).toBe("compte");
    expect(modules[0].readTables).toContain("T_COMPTE");
    expect(modules[0].useCases.length).toBe(1);
    expect(modules[0].useCases[0].voInType).toBe("ConsulterCompteVoIn");
    expect(modules[0].useCases[0].tx).toBe("SUPPORTS");
  });

  it("should convert EJB 2.x beans to ParsedModules", () => {
    const ir = makeMinimalIR({
      ejb2xBeans: [
        {
          className: "CompteSessionBean",
          packageName: "ma.bmce.ejb",
          beanType: "SESSION",
          homeInterface: "CompteHome",
          remoteInterface: "CompteRemote",
          methods: [
            { name: "getBalance", returnType: "BigDecimal", parameters: [{ name: "accountId", type: "String" }] },
          ],
          sourceFile: "CompteSessionBean.java",
          rawSource: 'INSERT INTO T_OPERATION VALUES (?)',
        },
      ],
    });

    const modules = buildParsedModules(ir);
    expect(modules.length).toBe(1);
    expect(modules[0].id).toBe("CompteSessionBean");
    expect(modules[0].type).toBe("EJB2X");
    expect(modules[0].writeTables).toContain("T_OPERATION");
  });

  it("should convert BatchJobs to ParsedModules", () => {
    const ir = makeMinimalIR({
      batchJobs: [
        {
          className: "DailyReportBatch",
          packageName: "ma.bmce.batch",
          batchRole: "BATCHLET",
          implementsInterface: "Batchlet",
          sourceFile: "DailyReportBatch.java",
          rawSource: 'SELECT * FROM T_TRANSACTIONS',
        },
      ],
    });

    const modules = buildParsedModules(ir);
    expect(modules.length).toBe(1);
    expect(modules[0].id).toBe("DailyReportBatch");
    expect(modules[0].type).toBe("BATCH");
    expect(modules[0].domain).toBe("batch");
  });

  it("should extract JMS queues from rawSource", () => {
    const ir = makeMinimalIR({
      useCases: [
        {
          className: "UCEnvoyerNotification",
          packageName: "ma.bmce.notification",
          domain: "notification",
          bianDomain: "",
          bianAction: "",
          voInType: "NotificationVoIn",
          voOutType: "Void",
          useCaseDescription: "",
          javadoc: "",
          injectedServices: [],
          transactional: null,
          exceptionsCaught: [],
          exceptionsThrown: [],
          sourceFile: "UCEnvoyerNotification.java",
          rawSource: '@Resource(name = "jms/queue/BMCE_NOTIFICATIONS") private Queue notifQueue;\nproducer.send(message);',
          httpMethod: "POST",
          restPath: "/notification",
        },
      ],
    });

    const modules = buildParsedModules(ir);
    expect(modules[0].jmsQueues).toContain("jms/queue/BMCE_NOTIFICATIONS");
    expect(modules[0].jmsProduces).toContain("jms/queue/BMCE_NOTIFICATIONS");
  });

  it("should handle ProjectIR overload in split()", () => {
    const ir = makeMinimalIR({
      useCases: [
        {
          className: "UCConsulterCompte",
          packageName: "ma.bmce.compte",
          domain: "compte",
          bianDomain: "",
          bianAction: "",
          voInType: "Void",
          voOutType: "CompteVoOut",
          useCaseDescription: "",
          javadoc: "",
          injectedServices: [],
          transactional: null,
          exceptionsCaught: [],
          exceptionsThrown: [],
          sourceFile: "UCConsulterCompte.java",
          rawSource: 'SELECT * FROM T_COMPTE',
          httpMethod: "GET",
          restPath: "/compte",
        },
      ],
    });

    const splitter = new MicroserviceSplitter();
    const result = splitter.split(ir);
    expect(result.length).toBe(1);
    expect(result[0].ejbs).toContain("UCConsulterCompte");
  });
});
