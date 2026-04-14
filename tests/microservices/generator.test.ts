/**
 * Tests unitaires — MicroserviceGenerator
 *
 * Vérifie :
 *   - Génération pom.xml (dépendances conditionnelles)
 *   - Application.java
 *   - Service + Controller par EJB
 *   - InternalApiController
 *   - REST clients
 *   - Kafka Producers/Consumers
 *   - Outbox pattern
 *   - application.yml
 *   - Dockerfile + K8s manifests
 *   - SQL schema + migration
 *   - docker-compose.yml global
 *   - MICROSERVICES_REPORT.md
 */

import { describe, it, expect } from "vitest";
import {
  MicroserviceGenerator,
  type MicroserviceOutput,
} from "../../server/engine/microservices/microservice-generator";
import type {
  ServiceCandidate,
  ParsedModule,
} from "../../server/engine/microservices/microservice-splitter";

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

function makeService(overrides: Partial<ServiceCandidate> & { name: string }): ServiceCandidate {
  return {
    ejbs: [],
    ownedTables: [],
    readOnlyTables: [],
    kafkaTopics: [],
    restApis: [],
    restDependencies: [],
    dbSchema: overrides.name.replace("-service", "_SVC").toUpperCase(),
    confidence: 85,
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────

describe("MicroserviceGenerator", () => {
  const generator = new MicroserviceGenerator();

  describe("generateAll() — basic structure", () => {
    it("should generate one project per service", () => {
      const services = [
        makeService({ name: "compte-service", ejbs: ["CompteEJB"] }),
        makeService({ name: "virement-service", ejbs: ["VirementEJB"] }),
      ];
      const modules = [
        makeModule({ id: "CompteEJB" }),
        makeModule({ id: "VirementEJB" }),
      ];

      const output = generator.generateAll(services, modules);
      expect(output.services.length).toBe(2);
      expect(output.services[0].serviceName).toBe("compte-service");
      expect(output.services[1].serviceName).toBe("virement-service");
    });

    it("should generate infrastructure files", () => {
      const services = [makeService({ name: "compte-service", ejbs: ["CompteEJB"] })];
      const modules = [makeModule({ id: "CompteEJB" })];

      const output = generator.generateAll(services, modules);
      expect(output.infrastructure.has("docker-compose.yml")).toBe(true);
      expect(output.infrastructure.has("api-gateway/application.yml")).toBe(true);
    });

    it("should generate a report", () => {
      const services = [makeService({ name: "compte-service", ejbs: ["CompteEJB"], confidence: 92 })];
      const modules = [makeModule({ id: "CompteEJB" })];

      const output = generator.generateAll(services, modules);
      expect(output.report).toContain("compte-service");
      expect(output.report).toContain("92%");
    });
  });

  describe("pom.xml generation", () => {
    it("should include spring-boot-starter-web and data-jpa", () => {
      const services = [makeService({ name: "compte-service", ejbs: ["CompteEJB"] })];
      const modules = [makeModule({ id: "CompteEJB" })];
      const output = generator.generateAll(services, modules);
      const pom = output.services[0].files.get("pom.xml")!;

      expect(pom).toContain("spring-boot-starter-web");
      expect(pom).toContain("spring-boot-starter-data-jpa");
      expect(pom).toContain("spring-boot-starter-actuator");
      expect(pom).toContain("ojdbc11");
    });

    it("should include spring-kafka when service has Kafka topics", () => {
      const services = [makeService({
        name: "notification-service",
        ejbs: ["NotificationEJB"],
        kafkaTopics: [{ name: "notif-events", direction: "PRODUCE", eventType: "NotifEvent" }],
      })];
      const modules = [makeModule({ id: "NotificationEJB" })];
      const output = generator.generateAll(services, modules);
      const pom = output.services[0].files.get("pom.xml")!;

      expect(pom).toContain("spring-kafka");
    });

    it("should NOT include spring-kafka when service has no Kafka topics", () => {
      const services = [makeService({ name: "compte-service", ejbs: ["CompteEJB"] })];
      const modules = [makeModule({ id: "CompteEJB" })];
      const output = generator.generateAll(services, modules);
      const pom = output.services[0].files.get("pom.xml")!;

      expect(pom).not.toContain("spring-kafka");
    });

    it("should include spring-boot-starter-batch for batch services", () => {
      const services = [makeService({ name: "batch-service", ejbs: ["BatchProcessor"] })];
      const modules = [makeModule({ id: "BatchProcessor" })];
      const output = generator.generateAll(services, modules);
      const pom = output.services[0].files.get("pom.xml")!;

      expect(pom).toContain("spring-boot-starter-batch");
    });

    it("should include spring-boot-starter-security for auth service", () => {
      const services = [makeService({ name: "auth-service", ejbs: ["AuthEJB"] })];
      const modules = [makeModule({ id: "AuthEJB" })];
      const output = generator.generateAll(services, modules);
      const pom = output.services[0].files.get("pom.xml")!;

      expect(pom).toContain("spring-boot-starter-security");
    });
  });

  describe("Application.java generation", () => {
    it("should generate correct Application class", () => {
      const services = [makeService({ name: "compte-service", ejbs: ["CompteEJB"] })];
      const modules = [makeModule({ id: "CompteEJB" })];
      const output = generator.generateAll(services, modules);
      const pkg = "ma.bmce.digital.compteService";
      const appFile = output.services[0].files.get(
        `src/main/java/${pkg.replace(/\./g, "/")}/CompteServiceApplication.java`
      )!;

      expect(appFile).toContain("@SpringBootApplication");
      expect(appFile).toContain("@EnableScheduling");
      expect(appFile).toContain("CompteServiceApplication");
    });
  });

  describe("Service + Controller generation", () => {
    it("should generate Service and Controller for each EJB", () => {
      const services = [makeService({ name: "compte-service", ejbs: ["CompteEJB"] })];
      const modules = [makeModule({
        id: "CompteEJB",
        useCases: [{
          methodName: "consulterCompte",
          voInType: "ConsulterCompteVoIn",
          voOutType: "ConsulterCompteVoOut",
          tx: "SUPPORTS",
          httpVerb: "Get",
          sqlConstants: [],
        }],
      })];
      const output = generator.generateAll(services, modules);
      const pkg = "ma.bmce.digital.compteService";
      const srcPath = `src/main/java/${pkg.replace(/\./g, "/")}`;

      const serviceFile = output.services[0].files.get(`${srcPath}/service/CompteEJBService.java`)!;
      expect(serviceFile).toContain("@Service");
      expect(serviceFile).toContain("consulterCompte");
      expect(serviceFile).toContain("@Transactional(readOnly = true)");

      const controllerFile = output.services[0].files.get(`${srcPath}/controller/CompteEJBController.java`)!;
      expect(controllerFile).toContain("@RestController");
      expect(controllerFile).toContain("consulterCompte");
      expect(controllerFile).toContain("@GetMapping");
    });

    it("should generate test file for each controller", () => {
      const services = [makeService({ name: "compte-service", ejbs: ["CompteEJB"] })];
      const modules = [makeModule({ id: "CompteEJB" })];
      const output = generator.generateAll(services, modules);
      const pkg = "ma.bmce.digital.compteService";
      const testPath = `src/test/java/${pkg.replace(/\./g, "/")}`;

      const testFile = output.services[0].files.get(`${testPath}/controller/CompteEJBControllerTest.java`)!;
      expect(testFile).toContain("@WebMvcTest");
      expect(testFile).toContain("CompteEJBControllerTest");
    });
  });

  describe("Internal API generation", () => {
    it("should generate InternalApiController when service has REST APIs", () => {
      const services = [makeService({
        name: "client-service",
        ejbs: ["ClientEJB"],
        restApis: [{ method: "GET", path: "/client/{id}", purpose: "Lecture client" }],
      })];
      const modules = [makeModule({ id: "ClientEJB" })];
      const output = generator.generateAll(services, modules);
      const pkg = "ma.bmce.digital.clientService";
      const srcPath = `src/main/java/${pkg.replace(/\./g, "/")}`;

      const apiFile = output.services[0].files.get(`${srcPath}/api/InternalApiController.java`)!;
      expect(apiFile).toContain("/internal/v1");
      expect(apiFile).toContain("/client/{id}");
    });

    it("should NOT generate InternalApiController when service has no REST APIs", () => {
      const services = [makeService({ name: "compte-service", ejbs: ["CompteEJB"] })];
      const modules = [makeModule({ id: "CompteEJB" })];
      const output = generator.generateAll(services, modules);
      const pkg = "ma.bmce.digital.compteService";
      const srcPath = `src/main/java/${pkg.replace(/\./g, "/")}`;

      expect(output.services[0].files.has(`${srcPath}/api/InternalApiController.java`)).toBe(false);
    });
  });

  describe("REST clients generation", () => {
    it("should generate ServiceClients when service has dependencies", () => {
      const services = [makeService({
        name: "compte-service",
        ejbs: ["CompteEJB"],
        restDependencies: [{
          targetService: "client-service",
          method: "GET",
          path: "/client/{id}",
          isCritical: true,
        }],
      })];
      const modules = [makeModule({ id: "CompteEJB" })];
      const output = generator.generateAll(services, modules);
      const pkg = "ma.bmce.digital.compteService";
      const srcPath = `src/main/java/${pkg.replace(/\./g, "/")}`;

      const clientFile = output.services[0].files.get(`${srcPath}/client/ServiceClients.java`)!;
      expect(clientFile).toContain("ClientServiceClient");
      expect(clientFile).toContain("throw new RuntimeException");
    });

    it("should use non-critical fallback for non-critical dependencies", () => {
      const services = [makeService({
        name: "compte-service",
        ejbs: ["CompteEJB"],
        restDependencies: [{
          targetService: "audit-service",
          method: "GET",
          path: "/audit/{id}",
          isCritical: false,
        }],
      })];
      const modules = [makeModule({ id: "CompteEJB" })];
      const output = generator.generateAll(services, modules);
      const pkg = "ma.bmce.digital.compteService";
      const srcPath = `src/main/java/${pkg.replace(/\./g, "/")}`;

      const clientFile = output.services[0].files.get(`${srcPath}/client/ServiceClients.java`)!;
      expect(clientFile).toContain("non critique");
    });
  });

  describe("Kafka generation", () => {
    it("should generate Kafka producer for PRODUCE topics", () => {
      const services = [makeService({
        name: "notification-service",
        ejbs: ["NotificationEJB"],
        kafkaTopics: [{ name: "notif-events", direction: "PRODUCE", eventType: "NotifEvent" }],
      })];
      const modules = [makeModule({ id: "NotificationEJB" })];
      const output = generator.generateAll(services, modules);
      const pkg = "ma.bmce.digital.notificationService";
      const srcPath = `src/main/java/${pkg.replace(/\./g, "/")}`;

      const producerFile = output.services[0].files.get(`${srcPath}/messaging/NotifEventProducer.java`)!;
      expect(producerFile).toContain("KafkaTemplate");
      expect(producerFile).toContain("notif-events");
    });

    it("should generate Kafka consumer for CONSUME topics", () => {
      const services = [makeService({
        name: "audit-service",
        ejbs: ["AuditEJB"],
        kafkaTopics: [{ name: "audit-events", direction: "CONSUME", eventType: "AuditEvent" }],
      })];
      const modules = [makeModule({ id: "AuditEJB" })];
      const output = generator.generateAll(services, modules);
      const pkg = "ma.bmce.digital.auditService";
      const srcPath = `src/main/java/${pkg.replace(/\./g, "/")}`;

      const consumerFile = output.services[0].files.get(`${srcPath}/messaging/AuditEventConsumer.java`)!;
      expect(consumerFile).toContain("@KafkaListener");
      expect(consumerFile).toContain("audit-events");
    });

    it("should generate Outbox pattern for services with PRODUCE topics", () => {
      const services = [makeService({
        name: "notification-service",
        ejbs: ["NotificationEJB"],
        kafkaTopics: [{ name: "notif-events", direction: "PRODUCE", eventType: "NotifEvent" }],
      })];
      const modules = [makeModule({ id: "NotificationEJB" })];
      const output = generator.generateAll(services, modules);
      const pkg = "ma.bmce.digital.notificationService";
      const srcPath = `src/main/java/${pkg.replace(/\./g, "/")}`;

      expect(output.services[0].files.has(`${srcPath}/outbox/OutboxEvent.java`)).toBe(true);
      expect(output.services[0].files.has(`${srcPath}/outbox/OutboxPublisher.java`)).toBe(true);

      const outbox = output.services[0].files.get(`${srcPath}/outbox/OutboxEvent.java`)!;
      expect(outbox).toContain("T_OUTBOX_EVENTS");
      expect(outbox).toContain("@Entity");
    });
  });

  describe("Config generation", () => {
    it("should generate application.yml with Oracle config", () => {
      const services = [makeService({
        name: "compte-service",
        ejbs: ["CompteEJB"],
        dbSchema: "COMPTE_SVC",
      })];
      const modules = [makeModule({ id: "CompteEJB" })];
      const output = generator.generateAll(services, modules);
      const yml = output.services[0].files.get("src/main/resources/application.yml")!;

      expect(yml).toContain("oracle.jdbc.OracleDriver");
      expect(yml).toContain("COMPTE_SVC");
      expect(yml).toContain("swagger-ui");
    });

    it("should include Kafka config in application.yml when topics exist", () => {
      const services = [makeService({
        name: "notification-service",
        ejbs: ["NotificationEJB"],
        kafkaTopics: [{ name: "notif", direction: "PRODUCE", eventType: "NotifEvent" }],
      })];
      const modules = [makeModule({ id: "NotificationEJB" })];
      const output = generator.generateAll(services, modules);
      const yml = output.services[0].files.get("src/main/resources/application.yml")!;

      expect(yml).toContain("kafka");
      expect(yml).toContain("bootstrap-servers");
    });
  });

  describe("Infrastructure generation", () => {
    it("should generate Dockerfile with JRE 17", () => {
      const services = [makeService({ name: "compte-service", ejbs: ["CompteEJB"] })];
      const modules = [makeModule({ id: "CompteEJB" })];
      const output = generator.generateAll(services, modules);
      const dockerfile = output.services[0].files.get("Dockerfile")!;

      expect(dockerfile).toContain("eclipse-temurin:17-jre-alpine");
      expect(dockerfile).toContain("EXPOSE 8080");
    });

    it("should generate K8s deployment with health checks", () => {
      const services = [makeService({ name: "compte-service", ejbs: ["CompteEJB"] })];
      const modules = [makeModule({ id: "CompteEJB" })];
      const output = generator.generateAll(services, modules);
      const deployment = output.services[0].files.get("k8s/deployment.yaml")!;

      expect(deployment).toContain("replicas: 2");
      expect(deployment).toContain("livenessProbe");
      expect(deployment).toContain("/actuator/health");
    });

    it("should generate K8s service with ClusterIP", () => {
      const services = [makeService({ name: "compte-service", ejbs: ["CompteEJB"] })];
      const modules = [makeModule({ id: "CompteEJB" })];
      const output = generator.generateAll(services, modules);
      const svc = output.services[0].files.get("k8s/service.yaml")!;

      expect(svc).toContain("ClusterIP");
      expect(svc).toContain("port: 8080");
    });
  });

  describe("SQL generation", () => {
    it("should generate schema creation SQL", () => {
      const services = [makeService({
        name: "compte-service",
        ejbs: ["CompteEJB"],
        dbSchema: "COMPTE_SVC",
      })];
      const modules = [makeModule({ id: "CompteEJB" })];
      const output = generator.generateAll(services, modules);
      const sql = output.services[0].files.get("sql/01-create-schema.sql")!;

      expect(sql).toContain("CREATE USER COMPTE_SVC");
      expect(sql).toContain("GRANT CREATE SESSION");
    });

    it("should generate migration SQL with owned and read-only tables", () => {
      const services = [makeService({
        name: "compte-service",
        ejbs: ["CompteEJB"],
        dbSchema: "COMPTE_SVC",
        ownedTables: ["T_COMPTE"],
        readOnlyTables: ["T_CLIENT"],
      })];
      const modules = [makeModule({ id: "CompteEJB" })];
      const output = generator.generateAll(services, modules);
      const sql = output.services[0].files.get("sql/02-migrate-tables.sql")!;

      expect(sql).toContain("CREATE TABLE COMPTE_SVC.T_COMPTE");
      expect(sql).toContain("CREATE OR REPLACE VIEW COMPTE_SVC.V_T_CLIENT_RO");
      expect(sql).toContain("Strangler Fig");
    });
  });

  describe("Docker Compose generation", () => {
    it("should include Oracle and Kafka in docker-compose", () => {
      const services = [makeService({ name: "compte-service", ejbs: ["CompteEJB"] })];
      const modules = [makeModule({ id: "CompteEJB" })];
      const output = generator.generateAll(services, modules);
      const compose = output.infrastructure.get("docker-compose.yml")!;

      expect(compose).toContain("oracle");
      expect(compose).toContain("kafka");
      expect(compose).toContain("zookeeper");
      expect(compose).toContain("compte-service");
    });

    it("should assign unique ports to each service", () => {
      const services = [
        makeService({ name: "compte-service", ejbs: ["CompteEJB"] }),
        makeService({ name: "virement-service", ejbs: ["VirementEJB"] }),
      ];
      const modules = [
        makeModule({ id: "CompteEJB" }),
        makeModule({ id: "VirementEJB" }),
      ];
      const output = generator.generateAll(services, modules);
      const compose = output.infrastructure.get("docker-compose.yml")!;

      expect(compose).toContain("8081:8080");
      expect(compose).toContain("8082:8080");
    });
  });

  describe("Report generation", () => {
    it("should include all services in the report", () => {
      const services = [
        makeService({ name: "compte-service", ejbs: ["CompteEJB"], confidence: 92 }),
        makeService({ name: "virement-service", ejbs: ["VirementEJB"], confidence: 78 }),
      ];
      const modules = [
        makeModule({ id: "CompteEJB" }),
        makeModule({ id: "VirementEJB" }),
      ];
      const output = generator.generateAll(services, modules);

      expect(output.report).toContain("compte-service");
      expect(output.report).toContain("virement-service");
      expect(output.report).toContain("92%");
      expect(output.report).toContain("78%");
      expect(output.report).toContain("Compleo v7.0");
    });
  });
});
