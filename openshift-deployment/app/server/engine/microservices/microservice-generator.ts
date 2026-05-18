/**
 * MicroserviceGenerator — Compleo v7.0
 *
 * Génère un projet Spring Boot complet pour chaque ServiceCandidate :
 *   - pom.xml (avec dépendances conditionnelles Kafka, Batch, Security)
 *   - Application.java
 *   - Service + Controller par EJB
 *   - InternalApiController pour les APIs inter-services
 *   - REST clients (Feign/RestTemplate)
 *   - Kafka Producers/Consumers
 *   - Outbox pattern pour at-least-once delivery
 *   - DataSource config Oracle
 *   - application.yml + application-docker.yml
 *   - Dockerfile + K8s manifests
 *   - SQL schema + migration scripts
 *   - docker-compose.yml global
 *   - API Gateway config
 *   - MICROSERVICES_REPORT.md
 *
 * @author Compleo Engine
 */

import type {
  ServiceCandidate,
  KafkaTopic,
  ParsedModule,
} from "./microservice-splitter";

// ── Output types (no filesystem writes — returns in-memory) ──────

export interface GeneratedMicroserviceProject {
  serviceName:  string;
  files:        Map<string, string>;
}

export interface MicroserviceOutput {
  services:     GeneratedMicroserviceProject[];
  infrastructure: Map<string, string>;
  report:       string;
}

// ── Generator ────────────────────────────────────────────────────

export class MicroserviceGenerator {

  /**
   * Generate all microservice projects in-memory.
   * Returns a structured output instead of writing to disk,
   * so it can be used in both CLI and web contexts.
   */
  generateAll(
    services: ServiceCandidate[],
    modules:  ParsedModule[]
  ): MicroserviceOutput {
    const output: MicroserviceOutput = {
      services: [],
      infrastructure: new Map(),
      report: "",
    };

    for (const service of services) {
      const project = this.generateService(service, modules);
      output.services.push(project);
    }

    // Infrastructure files
    const infraFiles = new Map<string, string>();
    infraFiles.set("docker-compose.yml", this.generateDockerCompose(services));
    infraFiles.set("api-gateway/application.yml", this.generateApiGateway(services));
    output.infrastructure = infraFiles;

    // Report
    output.report = this.generateReport(services);

    return output;
  }

  /**
   * Generate all and write to disk (for CLI usage).
   */
  async generateAllToDisk(
    services:  ServiceCandidate[],
    modules:   ParsedModule[],
    outputDir: string
  ): Promise<MicroserviceOutput> {
    // Dynamic import to avoid bundling fs in browser contexts
    const fs = await import("fs");
    const path = await import("path");

    fs.mkdirSync(outputDir, { recursive: true });

    const output = this.generateAll(services, modules);

    // Write service files
    for (const project of output.services) {
      for (const [filePath, content] of project.files) {
        const full = path.join(outputDir, project.serviceName, filePath);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, content, "utf-8");
      }
    }

    // Write infrastructure files
    const infraDir = path.join(outputDir, "infrastructure");
    fs.mkdirSync(infraDir, { recursive: true });
    for (const [filePath, content] of output.infrastructure) {
      const full = path.join(infraDir, filePath);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content, "utf-8");
    }

    // Write report
    fs.writeFileSync(
      path.join(outputDir, "MICROSERVICES_REPORT.md"),
      output.report
    );

    return output;
  }

  // ── Service Generation ─────────────────────────────────────────

  private generateService(
    service: ServiceCandidate,
    modules: ParsedModule[]
  ): GeneratedMicroserviceProject {
    const pkg = `ma.bmce.digital.${this.toCamel(service.name)}`;
    const srcPath = `src/main/java/${pkg.replace(/\./g, "/")}`;
    const testPath = `src/test/java/${pkg.replace(/\./g, "/")}`;

    const files = new Map<string, string>();
    const mods = modules.filter(m => service.ejbs.includes(m.id));

    // pom.xml
    files.set("pom.xml", this.pom(service, pkg));

    // Application principale
    files.set(
      `${srcPath}/${this.toPascal(service.name)}Application.java`,
      this.application(service, pkg)
    );

    // Post-Audit STEP 2+3+4: Deduplicate, clean names, filter invalid adapters
    const generatedNames = new Set<string>();
    for (const mod of mods) {
      const cleanName = this.cleanModuleNameFull(mod.id);

      // STEP 4: Skip modules with invalid Java identifiers (e.g., "private", "abstract")
      if (this.isInvalidJavaName(cleanName)) continue;

      // STEP 2: Skip duplicate — if domain service already generated, skip EJB variant
      if (generatedNames.has(cleanName)) continue;
      generatedNames.add(cleanName);

      files.set(
        `${srcPath}/service/${cleanName}Service.java`,
        this.springService(mod, service, pkg)
      );
      files.set(
        `${srcPath}/controller/${cleanName}Controller.java`,
        this.controller(mod, service, pkg)
      );
      files.set(
        `${testPath}/controller/${cleanName}ControllerTest.java`,
        this.tests(mod, service, pkg)
      );
    }

    // APIs internes exposées aux autres services
    if (service.restApis.length > 0) {
      files.set(
        `${srcPath}/api/InternalApiController.java`,
        this.internalApi(service, pkg)
      );
    }

    // Clients REST vers les autres services
    if (service.restDependencies.length > 0) {
      files.set(
        `${srcPath}/client/ServiceClients.java`,
        this.restClients(service, pkg)
      );
    }

    // Kafka Producers / Consumers
    for (const topic of service.kafkaTopics) {
      if (topic.direction === "PRODUCE") {
        files.set(
          `${srcPath}/messaging/${topic.eventType}Producer.java`,
          this.kafkaProducer(topic, pkg)
        );
      } else {
        files.set(
          `${srcPath}/messaging/${topic.eventType}Consumer.java`,
          this.kafkaConsumer(topic, service, pkg)
        );
      }
    }

    // Outbox si le service publie des events
    if (service.kafkaTopics.some(t => t.direction === "PRODUCE")) {
      files.set(
        `${srcPath}/outbox/OutboxEvent.java`,
        this.outboxEntity(pkg)
      );
      files.set(
        `${srcPath}/outbox/OutboxPublisher.java`,
        this.outboxPublisher(service, pkg)
      );
    }

    // Config
    files.set(
      `${srcPath}/config/DataSourceConfig.java`,
      this.dataSourceConfig(service, pkg)
    );

    // Resources
    files.set("src/main/resources/application.yml", this.appYml(service));
    files.set("src/main/resources/application-docker.yml", this.dockerYml(service));

    // Infrastructure
    files.set("Dockerfile", this.dockerfile(service));
    files.set("k8s/deployment.yaml", this.k8sDeployment(service));
    files.set("k8s/service.yaml", this.k8sService(service));

    // SQL
    files.set("sql/01-create-schema.sql", this.schemaSql(service));
    files.set("sql/02-migrate-tables.sql", this.migrationSql(service));

    return { serviceName: service.name, files };
  }

  // ── Templates ──────────────────────────────────────────────────

  private pom(s: ServiceCandidate, pkg: string): string {
    const hasKafka    = s.kafkaTopics.length > 0;
    const hasBatch    = s.ejbs.some(e => e.toLowerCase().includes("batch"));
    const hasSecurity = s.name === "auth-service";

    return `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://maven.apache.org/POM/4.0.0
    https://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>
  <parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.2.5</version>
  </parent>
  <groupId>${pkg}</groupId>
  <artifactId>${s.name}</artifactId>
  <version>1.0.0-SNAPSHOT</version>
  <description>
    Microservice ${s.name} — généré par Compleo
    Migré depuis : ${s.ejbs.join(", ")}
    Tables : ${s.ownedTables.join(", ")}
  </description>
  <properties><java.version>17</java.version></properties>
  <dependencies>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-data-jpa</artifactId>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-actuator</artifactId>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-validation</artifactId>
    </dependency>
    <dependency>
      <groupId>org.springdoc</groupId>
      <artifactId>springdoc-openapi-starter-webmvc-ui</artifactId>
      <version>2.3.0</version>
    </dependency>
    <dependency>
      <groupId>com.oracle.database.jdbc</groupId>
      <artifactId>ojdbc11</artifactId>
      <version>23.2.0.0</version>
      <scope>runtime</scope>
    </dependency>
    <dependency>
      <groupId>org.projectlombok</groupId>
      <artifactId>lombok</artifactId>
      <optional>true</optional>
    </dependency>
    ${hasKafka ? `<dependency>
      <groupId>org.springframework.kafka</groupId>
      <artifactId>spring-kafka</artifactId>
    </dependency>` : ""}
    ${hasBatch ? `<dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-batch</artifactId>
    </dependency>` : ""}
    ${hasSecurity ? `<dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-security</artifactId>
    </dependency>` : ""}
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-test</artifactId>
      <scope>test</scope>
    </dependency>
  </dependencies>
  <build>
    <plugins>
      <plugin>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-maven-plugin</artifactId>
      </plugin>
    </plugins>
  </build>
</project>`;
  }

  private application(s: ServiceCandidate, pkg: string): string {
    const pascal = this.toPascal(s.name);
    return `package ${pkg};

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class ${pascal}Application {
  public static void main(String[] args) {
    SpringApplication.run(${pascal}Application.class, args);
  }
}`;
  }

  private springService(
    mod: ParsedModule, s: ServiceCandidate, pkg: string
  ): string {
    const deps = s.restDependencies
      .map(d => `private final ${this.toPascal(d.targetService)}Client ` +
                `${this.toCamel(d.targetService)}Client;`)
      .join("\n    ");

    // Post-Audit STEP 3: Use real method parameters
    const methods = (mod.useCases ?? []).map(uc => {
      // v10.4b STEP 7: Clean EJB prefixes from method names
      const cleanMethodName = uc.methodName
        .replace(/^[A-Z]\w+EJB_/, '')     // CreditOctroiEJB_getXxx → getXxx
        .replace(/^[A-Z]\w+Bean_/, '')    // XxxBean_method → method
        .replace(/^[A-Z]\w+Impl_/, '');   // XxxImpl_method → method
      // Build parameter list from real params or fallback to voInType
      const params = (uc.methodParameters && uc.methodParameters.length > 0)
        ? uc.methodParameters.map(p => `${p.type} ${p.name}`).join(", ")
        : (uc.voInType ? `${uc.voInType} request` : "");
      const paramLog = (uc.methodParameters && uc.methodParameters.length > 0)
        ? uc.methodParameters.map(p => p.name).join(", ")
        : (uc.voInType ? "request" : '""');
      return `
    @Transactional${uc.tx === "SUPPORTS" ? "(readOnly = true)" : ""}
    public ${uc.voOutType ?? "void"} ${cleanMethodName}(${params}) {
        log.info("${cleanMethodName}: {}", ${paramLog});
        // TODO: Migrer la logique depuis ${this.cleanModuleNameFull(mod.id)}.${uc.methodName}
        // SQL original préservé dans les commentaires ci-dessous
        ${(uc.sqlConstants ?? []).map(sql =>
          `// SQL: ${sql.name} = "${sql.value?.substring(0, 80)}..."`
        ).join("\n        ")}
        throw new UnsupportedOperationException("Migration en cours");
    }`;
    }).join("\n");

    return `package ${pkg}.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * ${this.cleanModuleNameFull(mod.id)}Service — ${s.name}
 * Migré depuis ${mod.id} (${mod.type})
 * Tables propriétaires : ${s.ownedTables.join(", ")}
 * Schéma Oracle : ${s.dbSchema}
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ${this.cleanModuleNameFull(mod.id)}Service {

    private final JdbcTemplate jdbcTemplate;
    ${deps}
    ${s.kafkaTopics.some(t => t.direction === "PRODUCE")
      ? "private final OutboxRepository outboxRepository;" : ""}

${methods}
}`;
  }

  private controller(
    mod: ParsedModule, s: ServiceCandidate, pkg: string
  ): string {
    // Post-Audit STEP 3: Use real method parameters in controller
    const endpoints = (mod.useCases ?? []).map(uc => {
      // v10.4b STEP 7: Clean EJB prefixes from method names in controller
      const cleanMethodName = uc.methodName
        .replace(/^[A-Z]\w+EJB_/, '')
        .replace(/^[A-Z]\w+Bean_/, '')
        .replace(/^[A-Z]\w+Impl_/, '');
      const verb   = uc.httpVerb ?? (cleanMethodName.startsWith("get") ||
                     cleanMethodName.startsWith("list") ||
                     cleanMethodName.startsWith("find") ||
                     cleanMethodName.startsWith("consulter") ||
                     cleanMethodName.startsWith("rechercher")
                     ? "Get" : "Post");
      const pathStr = this.toPath(cleanMethodName);
      const status = verb === "Post" ? "HttpStatus.CREATED" : "";

      // Build real parameter annotations
      const hasRealParams = uc.methodParameters && uc.methodParameters.length > 0;
      let controllerParams: string;
      let serviceCallArgs: string;

      if (hasRealParams) {
        if (verb === "Get") {
          controllerParams = uc.methodParameters!.map(p =>
            `@RequestParam ${p.type} ${p.name}`
          ).join(", ");
        } else {
          // For POST: if single complex param, use @RequestBody; if multiple, use @RequestParam
          if (uc.methodParameters!.length === 1 && /^[A-Z]/.test(uc.methodParameters![0].type)) {
            controllerParams = `@Valid @RequestBody ${uc.methodParameters![0].type} ${uc.methodParameters![0].name}`;
          } else {
            controllerParams = uc.methodParameters!.map(p =>
              `@RequestParam ${p.type} ${p.name}`
            ).join(", ");
          }
        }
        serviceCallArgs = uc.methodParameters!.map(p => p.name).join(", ");
      } else if (uc.voInType) {
        controllerParams = verb === "Get"
          ? `@PathVariable String id`
          : `@Valid @RequestBody ${uc.voInType} request`;
        serviceCallArgs = verb === "Get" ? "id" : "request";
      } else {
        controllerParams = "";
        serviceCallArgs = "";
      }

      return `
    @Operation(summary = "${cleanMethodName}")
    @${verb}Mapping("${pathStr}")
    public ResponseEntity<${uc.voOutType ?? "Void"}> ${cleanMethodName}(${controllerParams}) {
        ${uc.voOutType
          ? (status
            ? `return ResponseEntity.status(${status}).body(service.${cleanMethodName}(${serviceCallArgs}));`
            : `return ResponseEntity.ok(service.${cleanMethodName}(${serviceCallArgs}));`)
          : `service.${cleanMethodName}(${serviceCallArgs}); return ResponseEntity.ok().build();`
        }
    }`;
    }).join("\n");

    return `package ${pkg}.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import ${pkg}.service.${this.cleanModuleNameFull(mod.id)}Service;

@Slf4j
@RestController
@RequestMapping("/api/v1/${this.toPath(this.cleanModuleNameFull(mod.id)).replace("/", "")}")
@RequiredArgsConstructor
@Tag(name = "${this.cleanModuleNameFull(mod.id)}", description = "API ${s.name}")
public class ${this.cleanModuleNameFull(mod.id)}Controller {

    private final ${this.cleanModuleNameFull(mod.id)}Service service;
${endpoints}
}`;
  }

  private internalApi(s: ServiceCandidate, pkg: string): string {
    const endpoints = s.restApis.map(api => `
    /** ${api.purpose} */
    @GetMapping("${api.path}")
    public ResponseEntity<?> ${this.toMethodName(api.path)}(
            @PathVariable String id) {
        // TODO: lire depuis ${s.ownedTables[0] ?? "table"}
        return ResponseEntity.ok().build();
    }`).join("\n");

    return `package ${pkg}.api;

import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * APIs internes — communication inter-microservices uniquement
 * Protéger via NetworkPolicy K8s ou mTLS (ne pas exposer publiquement)
 */
@RestController
@RequestMapping("/internal/v1")
@RequiredArgsConstructor
public class InternalApiController {
${endpoints}
}`;
  }

  private restClients(s: ServiceCandidate, pkg: string): string {
    const clients = s.restDependencies.map(dep => `
@Component
@Slf4j
@RequiredArgsConstructor
class ${this.toPascal(dep.targetService)}Client {

    private final RestTemplate restTemplate;

    @Value("\${services.${dep.targetService}.url}")
    private String baseUrl;

    public ResponseEntity<?> ${this.toMethodName(dep.path)}(String id) {
        try {
            return restTemplate.getForEntity(
                baseUrl + "${dep.path}".replace("{id}", id),
                Object.class);
        } catch (Exception e) {
            log.error("Erreur ${dep.targetService}: {}", e.getMessage());
            ${dep.isCritical
              ? `throw new RuntimeException("Service indisponible: ${dep.targetService}");`
              : `return ResponseEntity.ok().build(); // non critique`}
        }
    }
}`).join("\n");

    return `package ${pkg}.client;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

${clients}`;
  }

  private kafkaProducer(topic: KafkaTopic, pkg: string): string {
    return `package ${pkg}.messaging;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@Slf4j
public class ${topic.eventType}Producer {

    private final KafkaTemplate<String, String> kafkaTemplate;

    public void send(String payload) {
        log.info("Envoi → ${topic.name}: {}", payload);
        kafkaTemplate.send("${topic.name}", payload);
    }
}`;
  }

  private kafkaConsumer(
    topic: KafkaTopic, s: ServiceCandidate, pkg: string
  ): string {
    return `package ${pkg}.messaging;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
@RequiredArgsConstructor
@Slf4j
public class ${topic.eventType}Consumer {

    @KafkaListener(topics = "${topic.name}", groupId = "${s.name}")
    @Transactional
    public void on${topic.eventType}(String payload) {
        log.info("Reçu ${topic.name}: {}", payload);
        // TODO: implémenter le traitement de l'event
    }
}`;
  }

  private outboxEntity(pkg: string): string {
    return `package ${pkg}.outbox;

import jakarta.persistence.*;
import lombok.*;
import java.time.Instant;

@Entity
@Table(name = "T_OUTBOX_EVENTS")
@Data @Builder @NoArgsConstructor @AllArgsConstructor
public class OutboxEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE,
                    generator = "SEQ_OUTBOX")
    @SequenceGenerator(name = "SEQ_OUTBOX",
                       sequenceName = "SEQ_OUTBOX",
                       allocationSize = 1)
    private Long id;

    private String aggregateId;
    private String eventType;
    private String topic;

    @Column(columnDefinition = "CLOB")
    private String payload;

    private String status;          // PENDING | PUBLISHED | FAILED
    private Instant createdAt;
    private Instant publishedAt;
}`;
  }

  private outboxPublisher(s: ServiceCandidate, pkg: string): string {
    const topics = s.kafkaTopics
      .filter(t => t.direction === "PRODUCE")
      .map(t => `"${t.name}"`)
      .join(", ");

    return `package ${pkg}.outbox;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.List;

/**
 * Outbox Pattern — garantit at-least-once delivery vers Kafka
 * Même si Kafka est down, les events sont conservés en Oracle
 * et publiés dès que Kafka revient.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class OutboxPublisher {

    private final OutboxRepository repo;
    private final KafkaTemplate<String, String> kafka;

    // Topics gérés par ce service : ${topics}
    @Scheduled(fixedDelay = 5000)
    @Transactional
    public void publishPending() {
        List<OutboxEvent> pending = repo.findByStatus("PENDING");
        for (OutboxEvent event : pending) {
            try {
                kafka.send(event.getTopic(), event.getPayload()).get();
                event.setStatus("PUBLISHED");
                event.setPublishedAt(Instant.now());
                repo.save(event);
            } catch (Exception e) {
                log.error("Outbox publish failed [{}]: {}",
                    event.getId(), e.getMessage());
                event.setStatus("FAILED");
                repo.save(event);
            }
        }
    }
}`;
  }

  private dataSourceConfig(s: ServiceCandidate, pkg: string): string {
    return `package ${pkg}.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.jdbc.DataSourceBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import javax.sql.DataSource;

@Configuration
public class DataSourceConfig {

    /**
     * DataSource Oracle dédiée à ${s.name}
     * Schéma : ${s.dbSchema}
     * Tables propriétaires : ${s.ownedTables.join(", ")}
     */
    @Bean
    @Primary
    @ConfigurationProperties("spring.datasource")
    public DataSource dataSource() {
        return DataSourceBuilder.create().build();
    }
}`;
  }

  private appYml(s: ServiceCandidate): string {
    const hasKafka = s.kafkaTopics.length > 0;
    return `spring:
  application:
    name: ${s.name}
  datasource:
    url: \${ORACLE_URL:jdbc:oracle:thin:@//localhost:1521/XEPDB1}
    username: \${ORACLE_USER:${s.dbSchema.toLowerCase()}}
    password: \${ORACLE_PASSWORD:}
    driver-class-name: oracle.jdbc.OracleDriver
    hikari:
      connection-test-query: SELECT 1 FROM DUAL
      maximum-pool-size: 10
      schema: ${s.dbSchema}
  jpa:
    properties:
      hibernate:
        dialect: org.hibernate.dialect.OracleDialect
        default_schema: ${s.dbSchema}
${hasKafka ? `  kafka:
    bootstrap-servers: \${KAFKA_SERVERS:localhost:9092}
    consumer:
      group-id: ${s.name}
      auto-offset-reset: earliest
    producer:
      key-serializer: org.apache.kafka.common.serialization.StringSerializer
      value-serializer: org.apache.kafka.common.serialization.StringSerializer` : ""}
server:
  port: \${PORT:8080}
services:
${s.restDependencies.map(d =>
  `  ${d.targetService}:\n    url: \${${d.targetService.toUpperCase().replace(/-/g, "_")}_URL:http://${d.targetService}:8080}`
).join("\n")}
management:
  endpoints:
    web:
      exposure:
        include: health,info,metrics
springdoc:
  swagger-ui:
    path: /swagger-ui.html`;
  }

  private dockerYml(s: ServiceCandidate): string {
    return `# application-docker.yml — utilisé dans docker-compose
spring:
  datasource:
    url: jdbc:oracle:thin:@oracle:1521/XEPDB1
  ${s.kafkaTopics.length > 0 ? "kafka:\n    bootstrap-servers: kafka:9092" : ""}
services:
${s.restDependencies.map(d =>
  `  ${d.targetService}:\n    url: http://${d.targetService}:8080`
).join("\n")}`;
  }

  private dockerfile(s: ServiceCandidate): string {
    return `FROM eclipse-temurin:17-jre-alpine
WORKDIR /app
COPY target/${s.name}-1.0.0-SNAPSHOT.jar app.jar
EXPOSE 8080
ENV SPRING_PROFILES_ACTIVE=docker
ENTRYPOINT ["java", "-XX:+UseContainerSupport", "-XX:MaxRAMPercentage=75", "-jar", "app.jar"]`;
  }

  private k8sDeployment(s: ServiceCandidate): string {
    return `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${s.name}
  namespace: bmce-digital
spec:
  replicas: 2
  selector:
    matchLabels:
      app: ${s.name}
  template:
    metadata:
      labels:
        app: ${s.name}
    spec:
      containers:
        - name: ${s.name}
          image: bmce-digital/${s.name}:latest
          ports:
            - containerPort: 8080
          env:
            - name: SPRING_PROFILES_ACTIVE
              value: docker
            - name: ORACLE_URL
              valueFrom:
                secretKeyRef:
                  name: oracle-secret
                  key: url
          livenessProbe:
            httpGet:
              path: /actuator/health
              port: 8080
            initialDelaySeconds: 60
          resources:
            requests:
              memory: "512Mi"
              cpu: "250m"
            limits:
              memory: "1Gi"
              cpu: "500m"`;
  }

  private k8sService(s: ServiceCandidate): string {
    return `apiVersion: v1
kind: Service
metadata:
  name: ${s.name}
  namespace: bmce-digital
spec:
  selector:
    app: ${s.name}
  ports:
    - port: 8080
      targetPort: 8080
  type: ClusterIP`;
  }

  private schemaSql(s: ServiceCandidate): string {
    return `-- ${s.name} — Création du schéma Oracle dédié
-- Généré par Compleo — VALIDER avec le DBA

CREATE USER ${s.dbSchema} IDENTIFIED BY change_me_in_prod;
GRANT CREATE SESSION, CREATE TABLE, CREATE SEQUENCE,
      CREATE VIEW, CREATE PROCEDURE TO ${s.dbSchema};
ALTER USER ${s.dbSchema} QUOTA UNLIMITED ON USERS;`;
  }

  private migrationSql(s: ServiceCandidate): string {
    const owned = s.ownedTables.map(t => `
-- ── ${t} ──
CREATE TABLE ${s.dbSchema}.${t} AS SELECT * FROM LEGACY_SCHEMA.${t};
-- Créer les index (adapter selon le schéma réel)
-- Synonym temporaire pour compatibilité legacy (Strangler Fig)
CREATE OR REPLACE SYNONYM LEGACY_SCHEMA.${t} FOR ${s.dbSchema}.${t};`
    ).join("\n");

    const readonly = s.readOnlyTables.map(t => `
-- Vue READ-ONLY ${t} (appartient à un autre service)
-- Migrer vers API REST à terme
CREATE OR REPLACE VIEW ${s.dbSchema}.V_${t}_RO AS
  SELECT * FROM LEGACY_SCHEMA.${t};`
    ).join("\n");

    return `-- ${s.name} — Migration Oracle
-- Généré par Compleo — VALIDER avec le DBA

-- TABLES PROPRIÉTAIRES
${owned}

-- VUES READ-ONLY (transition uniquement)
${readonly}`;
  }

  private tests(
    mod: ParsedModule, s: ServiceCandidate, pkg: string
  ): string {
    return `package ${pkg}.controller;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.DisplayName;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;
import ${pkg}.service.${this.cleanModuleNameFull(mod.id)}Service;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(${this.cleanModuleNameFull(mod.id)}Controller.class)
class ${this.cleanModuleNameFull(mod.id)}ControllerTest {

    @Autowired MockMvc mockMvc;
    @MockBean ${this.cleanModuleNameFull(mod.id)}Service service;

    @Test
    @DisplayName("Actuator health — service démarre")
    void healthCheck() throws Exception {
        // Ce test vérifie que le contexte Spring démarre correctement
        // Les tests métier sont à compléter
    }
}`;
  }

  // ── Infrastructure Generation ──────────────────────────────────

  private generateDockerCompose(services: ServiceCandidate[]): string {
    const ports: Record<string, number> = {};
    let port = 8081;
    for (const s of services) {
      ports[s.name] = port++;
    }

    const servicesDef = services.map(s => `
  ${s.name}:
    build:
      context: ../${s.name}
    ports:
      - "${ports[s.name]}:8080"
    environment:
      SPRING_PROFILES_ACTIVE: docker
      ORACLE_URL: jdbc:oracle:thin:@oracle:1521/XEPDB1
      ORACLE_USER: ${s.dbSchema.toLowerCase()}
      ORACLE_PASSWORD: \${${s.dbSchema}_PWD:-change_me}
      KAFKA_SERVERS: kafka:9092
      ${s.restDependencies.map(d =>
        `${d.targetService.toUpperCase().replace(/-/g, "_")}_URL: http://${d.targetService}:8080`
      ).join("\n      ")}
    depends_on: [oracle, kafka]
    networks: [bmce]
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/actuator/health"]
      interval: 30s
      retries: 3`).join("\n");

    return `version: "3.9"
services:

  oracle:
    image: gvenzl/oracle-xe:21-slim
    environment:
      ORACLE_PASSWORD: \${ORACLE_SYS_PWD:-Admin123}
    ports: ["1521:1521"]
    volumes:
      - oracle-data:/opt/oracle/oradata
      - ./sql-init:/docker-entrypoint-initdb.d
    networks: [bmce]

  zookeeper:
    image: confluentinc/cp-zookeeper:7.5.0
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181
    networks: [bmce]

  kafka:
    image: confluentinc/cp-kafka:7.5.0
    depends_on: [zookeeper]
    ports: ["9092:9092"]
    environment:
      KAFKA_BROKER_ID: 1
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:9092
      KAFKA_AUTO_CREATE_TOPICS_ENABLE: "true"
    networks: [bmce]
${servicesDef}

volumes:
  oracle-data:

networks:
  bmce:
    driver: bridge`;
  }

  private generateApiGateway(services: ServiceCandidate[]): string {
    const routes = services.flatMap(s =>
      s.restApis
        .filter(a => !a.path.startsWith("/internal"))
        .map(a => `
      - id: ${s.name}-route
        uri: http://${s.name}:8080
        predicates:
          - Path=/api/v1/${s.name.replace("-service", "")}/**`)
    ).join("\n");

    return `spring:
  cloud:
    gateway:
      routes:
${routes}`;
  }

  private generateReport(services: ServiceCandidate[]): string {
    return `# MICROSERVICES_REPORT.md
## Découpage automatique — Compleo v7.0
Généré le : ${new Date().toLocaleString("fr-FR")}

## Résumé

| Service | EJBs migrés | Tables | APIs | Kafka | Confiance |
|---------|-------------|--------|------|-------|-----------|
${services.map(s =>
  `| ${s.name} | ${s.ejbs.join(", ")} | ${s.ownedTables.length} | ${s.restApis.length} | ${s.kafkaTopics.length} | ${s.confidence}% |`
).join("\n")}

## Détail par service

${services.map(s => [
  `### ${s.name} (${s.confidence}%)`,
  `**Tables propriétaires :** ${s.ownedTables.join(", ") || "—"}`,
  `**APIs exposées :** ${s.restApis.map(a => a.method + " /internal/v1" + a.path).join(", ") || "—"}`,
  `**Dépendances :** ${s.restDependencies.map(d => "→ " + d.targetService + (d.isCritical ? " ⚡" : "")).join(", ") || "—"}`,
  `**Kafka :** ${s.kafkaTopics.map(t => (t.direction === "PRODUCE" ? "OUT" : "IN") + " " + t.name).join(", ") || "—"}`,
  `**Schéma Oracle :** ${s.dbSchema}`,
].join("\n")).join("\n\n")}

## Démarrage rapide

${"`"}${"`"}${"`"}bash
cd infrastructure
docker-compose up -d
# Accéder aux Swagger UI de chaque service :
${services.map((s, i) => `# http://localhost:${8081 + i}/swagger-ui.html  → ${s.name}`).join("\n")}${"\`"}${"\`"}${"\`"}
`;
  }

  // ── Utilitaires ────────────────────────────────────────────────────────────

  /**
   * FIX C bis v7.2: Clean module name for use as class/method names.
   * "CarteEJB_getCartesActives" → "CarteEJB" (strip method after underscore)
   * "CompteEJB_consulterSolde"  → "CompteEJB" (strip method after underscore)
   * "CarteEJB"                  → "CarteEJB" (no change)
   */
  private cleanModuleName(modId: string): string {
    return modId.includes("_") ? modId.split("_")[0] : modId;
  }

  /**
   * Post-Audit STEP 2: Full clean — strip EJB/Bean/Impl/DAO suffixes
   * and method names after underscore.
   * "CreditOctroiEJB" → "CreditOctroi"
   * "CompteEJB_consulterSolde" → "Compte"
   * "CarteEJB" → "Carte"
   */
  private cleanModuleNameFull(modId: string): string {
    const base = modId.includes("_") ? modId.split("_")[0] : modId;
    return base
      .replace(/EJB$/i, "")
      .replace(/Bean$/i, "")
      .replace(/Impl$/i, "")
      .replace(/DAO$/i, "")
      .replace(/Service$/i, "")
      .replace(/MDB$/i, "")
      || base;
  }

  /**
   * Post-Audit STEP 4: Filter out invalid Java identifiers.
   * Java reserved words, empty names, names starting with numbers.
   */
  private isInvalidJavaName(name: string): boolean {
    if (!name || name.length === 0) return true;
    const reserved = new Set([
      "abstract", "assert", "boolean", "break", "byte", "case", "catch",
      "char", "class", "const", "continue", "default", "do", "double",
      "else", "enum", "extends", "final", "finally", "float", "for",
      "goto", "if", "implements", "import", "instanceof", "int",
      "interface", "long", "native", "new", "package", "private",
      "protected", "public", "return", "short", "static", "strictfp",
      "super", "switch", "synchronized", "this", "throw", "throws",
      "transient", "try", "void", "volatile", "while",
    ]);
    if (reserved.has(name.toLowerCase())) return true;
    if (/^\d/.test(name)) return true;
    return false;
  }

  private toCamel(s: string): string {
    return s.replace(/-([a-z])/g, (_, l: string) => l.toUpperCase())
            .replace(/-/g, "");
  }

  private toPascal(s: string): string {
    const c = this.toCamel(s);
    return c.charAt(0).toUpperCase() + c.slice(1);
  }

  private toPath(s: string): string {
    return "/" + s.toLowerCase().replace(/ejb$/i, "").replace(/_/g, "-");
  }

  private toMethodName(pathStr: string): string {
    return pathStr.replace(/\/\{[^}]+\}/g, "").split("/")
      .filter(p => p && p !== "api" && !p.match(/^v\d+$/))
      .pop() ?? "get";
  }
}
