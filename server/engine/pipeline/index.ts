/**
 * Pipeline multi-technologies Compleo v3.0.
 * Orchestre : scan fichiers → détection → génération → validation → rapport.
 * @author Hamza NORDINE
 */

import { registry } from "../registry";
import type {
  DetectedComponent,
  GeneratedFile,
  ValidationResult,
  TechnologyType,
  MigrationNote,
} from "../registry/types";

export interface PipelineInput {
  files: { path: string; content: string }[];
  basePackage: string;
  projectName?: string;
}

export interface PipelineResult {
  projectName: string;
  detectedComponents: DetectedComponent[];
  generatedFiles: GeneratedFile[];
  validation: ValidationResult;
  migrationNotes: MigrationNote[];
  technologiesDetected: TechnologyType[];
  stats: PipelineStats;
  maturityScore?: MaturityScore;
}

export interface PipelineStats {
  totalFilesScanned: number;
  totalComponentsDetected: number;
  totalFilesGenerated: number;
  detectionTimeMs: number;
  generationTimeMs: number;
  validationTimeMs: number;
  byTechnology: Record<TechnologyType, {
    components: number;
    generatedFiles: number;
    confidence: number;
  }>;
}

export interface MaturityScore {
  global: number;
  dimensions: {
    technicalComplexity: number;
    codeCoverage: number;
    breakingRisk: number;
    addedValue: number;
    engineConfidence: number;
  };
  label: string;
  attentionPoints: string[];
  estimatedEffort: string;
}

/**
 * Exécute le pipeline complet : detect → generate → validate → score.
 */
export function runPipeline(input: PipelineInput): PipelineResult {
  const projectName = input.projectName || "unknown";

  // ─── Phase 1 : Détection ─────────────────────────────────────────────
  const t0 = Date.now();
  const detectedComponents = registry.detectAll(input.files);
  const detectionTimeMs = Date.now() - t0;

  // ─── Phase 2 : Génération ────────────────────────────────────────────
  const t1 = Date.now();
  const generatedFiles = registry.generateAll(detectedComponents, input.basePackage);

  // Ajouter les fichiers d'infrastructure communs
  const infraFiles = generateInfrastructure(detectedComponents, input.basePackage);
  generatedFiles.push(...infraFiles);

  const generationTimeMs = Date.now() - t1;

  // ─── Phase 3 : Validation ────────────────────────────────────────────
  const t2 = Date.now();
  const validation = registry.validateAll(generatedFiles);
  const validationTimeMs = Date.now() - t2;

  // ─── Phase 4 : Notes de migration ────────────────────────────────────
  const migrationNotes = collectMigrationNotes(detectedComponents);

  // ─── Phase 5 : Statistiques ──────────────────────────────────────────
  const technologiesDetected = [...new Set(detectedComponents.map((c) => c.technology))];
  const stats = computeStats(input, detectedComponents, generatedFiles, detectionTimeMs, generationTimeMs, validationTimeMs);

  // ─── Phase 6 : Score de maturité ────────────────────────────────────
  const maturityScore = computeMaturityScore(detectedComponents, generatedFiles, validation, technologiesDetected);

  return {
    projectName,
    detectedComponents,
    generatedFiles,
    validation,
    migrationNotes,
    technologiesDetected,
    stats,
    maturityScore,
  };
}

// ─── Infrastructure commune ────────────────────────────────────────────────

function generateInfrastructure(components: DetectedComponent[], basePackage: string): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  const pkgPath = basePackage.replace(/\./g, "/");
  const techs = new Set(components.map((c) => c.technology));

  // pom.xml avec dépendances adaptées
  files.push({
    path: "pom.xml",
    content: generatePomXml(basePackage, techs),
    category: "infrastructure",
    technology: "EJB_3X_STATELESS",
  });

  // application.yml
  files.push({
    path: "src/main/resources/application.yml",
    content: generateApplicationYml(techs),
    category: "infrastructure",
    technology: "EJB_3X_STATELESS",
  });

  // GlobalExceptionHandler
  files.push({
    path: `src/main/java/${pkgPath}/config/GlobalExceptionHandler.java`,
    content: generateExceptionHandler(basePackage),
    category: "config",
    technology: "EJB_3X_STATELESS",
  });

  // Dockerfile
  files.push({
    path: "Dockerfile",
    content: generateDockerfile(),
    category: "infrastructure",
    technology: "EJB_3X_STATELESS",
  });

  // docker-compose.yml (si Kafka ou DB)
  if (techs.has("JMS") || techs.has("BATCH")) {
    files.push({
      path: "docker-compose.yml",
      content: generateDockerCompose(techs),
      category: "infrastructure",
      technology: "JMS",
    });
  }

  return files;
}

function generatePomXml(basePackage: string, techs: Set<TechnologyType>): string {
  const artifactId = basePackage.split(".").pop() || "app";
  const deps: string[] = [];

  deps.push("        <dependency>\n            <groupId>org.springframework.boot</groupId>\n            <artifactId>spring-boot-starter-web</artifactId>\n        </dependency>");
  deps.push("        <dependency>\n            <groupId>org.springframework.boot</groupId>\n            <artifactId>spring-boot-starter-validation</artifactId>\n        </dependency>");
  deps.push("        <dependency>\n            <groupId>org.projectlombok</groupId>\n            <artifactId>lombok</artifactId>\n            <optional>true</optional>\n        </dependency>");
  deps.push("        <dependency>\n            <groupId>io.swagger.core.v3</groupId>\n            <artifactId>swagger-annotations-jakarta</artifactId>\n            <version>2.2.20</version>\n        </dependency>");

  if (techs.has("JDBC") || techs.has("HIBERNATE") || techs.has("JPA")) {
    deps.push("        <dependency>\n            <groupId>org.springframework.boot</groupId>\n            <artifactId>spring-boot-starter-data-jpa</artifactId>\n        </dependency>");
  }

  if (techs.has("JMS")) {
    deps.push("        <dependency>\n            <groupId>org.springframework.kafka</groupId>\n            <artifactId>spring-kafka</artifactId>\n        </dependency>");
  }

  if (techs.has("BATCH")) {
    deps.push("        <dependency>\n            <groupId>org.springframework.boot</groupId>\n            <artifactId>spring-boot-starter-batch</artifactId>\n        </dependency>");
  }

  deps.push("        <dependency>\n            <groupId>org.springframework.boot</groupId>\n            <artifactId>spring-boot-starter-test</artifactId>\n            <scope>test</scope>\n        </dependency>");

  return `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.2.5</version>
    </parent>
    <groupId>${basePackage}</groupId>
    <artifactId>${artifactId}</artifactId>
    <version>1.0.0-SNAPSHOT</version>
    <name>${artifactId} — Migré par Compleo</name>
    <description>Projet migré automatiquement depuis Java legacy vers Spring Boot</description>

    <properties>
        <java.version>17</java.version>
    </properties>

    <dependencies>
${deps.join("\n")}
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
            </plugin>
        </plugins>
    </build>
</project>
`;
}

function generateApplicationYml(techs: Set<TechnologyType>): string {
  let yml = `# Généré par Compleo v3.0
server:
  port: 8080

spring:
  application:
    name: compleo-migrated-app
`;

  if (techs.has("JDBC") || techs.has("HIBERNATE") || techs.has("JPA")) {
    yml += `
  datasource:
    url: \${DATABASE_URL:jdbc:mysql://localhost:3306/app}
    username: \${DATABASE_USER:root}
    password: \${DATABASE_PASSWORD:}
    driver-class-name: com.mysql.cj.jdbc.Driver
  jpa:
    hibernate:
      ddl-auto: validate
    show-sql: false
    properties:
      hibernate:
        format_sql: true
`;
  }

  if (techs.has("JMS")) {
    yml += `
  kafka:
    bootstrap-servers: \${KAFKA_BOOTSTRAP_SERVERS:localhost:9092}
    consumer:
      group-id: compleo-group
      auto-offset-reset: earliest
    producer:
      key-serializer: org.apache.kafka.common.serialization.StringSerializer
      value-serializer: org.springframework.kafka.support.serializer.JsonSerializer
`;
  }

  if (techs.has("BATCH")) {
    yml += `
  batch:
    job:
      enabled: false
    jdbc:
      initialize-schema: always
`;
  }

  return yml;
}

function generateExceptionHandler(basePackage: string): string {
  return `package ${basePackage}.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Gestionnaire global des exceptions — Généré par Compleo.
 */
@RestControllerAdvice
@Slf4j
public class GlobalExceptionHandler {

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> handleValidation(MethodArgumentNotValidException ex) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("timestamp", LocalDateTime.now());
        body.put("status", 422);
        body.put("error", "Validation échouée");
        body.put("details", ex.getBindingResult().getFieldErrors().stream()
                .map(e -> e.getField() + ": " + e.getDefaultMessage())
                .toList());
        return ResponseEntity.unprocessableEntity().body(body);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, Object>> handleBadRequest(IllegalArgumentException ex) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("timestamp", LocalDateTime.now());
        body.put("status", 400);
        body.put("error", ex.getMessage());
        return ResponseEntity.badRequest().body(body);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleGeneric(Exception ex) {
        log.error("Erreur inattendue", ex);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("timestamp", LocalDateTime.now());
        body.put("status", 500);
        body.put("error", "Erreur interne du serveur");
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(body);
    }
}
`;
}

function generateDockerfile(): string {
  return `FROM eclipse-temurin:17-jre-alpine
WORKDIR /app
COPY target/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
`;
}

function generateDockerCompose(techs: Set<TechnologyType>): string {
  let compose = `version: '3.8'
services:
  app:
    build: .
    ports:
      - "8080:8080"
    environment:
      - SPRING_PROFILES_ACTIVE=docker
`;

  if (techs.has("JMS")) {
    compose += `
  zookeeper:
    image: confluentinc/cp-zookeeper:7.5.0
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181

  kafka:
    image: confluentinc/cp-kafka:7.5.0
    depends_on:
      - zookeeper
    ports:
      - "9092:9092"
    environment:
      KAFKA_BROKER_ID: 1
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
`;
  }

  return compose;
}

// ─── Migration notes ───────────────────────────────────────────────────────

function collectMigrationNotes(components: DetectedComponent[]): MigrationNote[] {
  const notes: MigrationNote[] = [];
  const techs = new Set(components.map((c) => c.technology));

  if (components.some((c) => c.technology === "SERVLET" && (c.metadata as any)?.usesSession)) {
    notes.push({
      title: "Migration HttpSession → JWT Stateless",
      content: "Des Servlets utilisent HttpSession pour stocker l'état utilisateur. Dans l'architecture REST générée, l'état de session doit être géré par JWT (JSON Web Token) côté client. Un SecurityConfig est fourni comme point de départ.",
      severity: "warning",
      technology: "SERVLET",
      affectedFiles: components.filter((c) => c.technology === "SERVLET" && (c.metadata as any)?.usesSession).map((c) => c.filePath),
    });
  }

  if (techs.has("SOAP")) {
    notes.push({
      title: "Migration SOAP → REST : plan de transition",
      content: "Ce service était exposé en SOAP. Les clients existants (ESB, partenaires) utilisent le WSDL. Un adapter de compatibilité SOAP→REST est généré pour permettre une migration progressive sans rupture.",
      severity: "critical",
      technology: "SOAP",
      affectedFiles: components.filter((c) => c.technology === "SOAP").map((c) => c.filePath),
    });
  }

  if (techs.has("JMS")) {
    notes.push({
      title: "Migration JMS → Kafka",
      content: "Les queues/topics JMS sont migrés vers Apache Kafka. Le broker Kafka doit être provisionné (docker-compose fourni). Les noms de topics doivent être configurés dans application.yml.",
      severity: "warning",
      technology: "JMS",
      affectedFiles: components.filter((c) => c.technology === "JMS").map((c) => c.filePath),
    });
  }

  if (techs.has("EJB_2X")) {
    notes.push({
      title: "Migration EJB 2.x → Spring Boot",
      content: "Les EJB 2.x utilisent le pattern Home/Remote/Bean qui n'existe pas en Spring. Les interfaces Home sont supprimées, les RemoteException sont retirées, et les méthodes lifecycle (ejbCreate, ejbRemove) sont remplacées par @PostConstruct/@PreDestroy.",
      severity: "info",
      technology: "EJB_2X",
      affectedFiles: components.filter((c) => c.technology === "EJB_2X").map((c) => c.filePath),
    });
  }

  if (techs.has("JSP")) {
    notes.push({
      title: "Migration JSP → API REST + Frontend séparé",
      content: "Les JSP sont des vues serveur-side. Dans l'architecture moderne, le frontend est séparé (React/Angular). Compleo génère les endpoints REST qui exposent les données. Le frontend doit être développé séparément.",
      severity: "warning",
      technology: "JSP",
      affectedFiles: components.filter((c) => c.technology === "JSP").map((c) => c.filePath),
    });
  }

  return notes;
}

// ─── Statistics ─────────────────────────────────────────────────────────────

function computeStats(
  input: PipelineInput,
  components: DetectedComponent[],
  files: GeneratedFile[],
  detectionTimeMs: number,
  generationTimeMs: number,
  validationTimeMs: number
): PipelineStats {
  const byTechnology: PipelineStats["byTechnology"] = {} as any;

  for (const tech of new Set(components.map((c) => c.technology))) {
    const techComponents = components.filter((c) => c.technology === tech);
    const techFiles = files.filter((f) => f.technology === tech);
    const avgConfidence = techComponents.reduce((sum, c) => sum + c.confidence, 0) / techComponents.length;
    byTechnology[tech] = {
      components: techComponents.length,
      generatedFiles: techFiles.length,
      confidence: Math.round(avgConfidence),
    };
  }

  return {
    totalFilesScanned: input.files.length,
    totalComponentsDetected: components.length,
    totalFilesGenerated: files.length,
    detectionTimeMs,
    generationTimeMs,
    validationTimeMs,
    byTechnology,
  };
}

// ─── Maturity Score ─────────────────────────────────────────────────────────

function computeMaturityScore(
  components: DetectedComponent[],
  files: GeneratedFile[],
  validation: ValidationResult,
  techs: TechnologyType[]
): MaturityScore {
  const attentionPoints: string[] = [];

  // 1. Complexité technique (25%) — plus c'est simple, plus le score est élevé
  let techComplexity = 100;
  if (techs.includes("EJB_2X")) { techComplexity -= 15; attentionPoints.push("EJB 2.x détecté — migration complexe"); }
  if (techs.includes("SOAP")) { techComplexity -= 10; attentionPoints.push("Service SOAP → plan de transition clients nécessaire"); }
  if (techs.includes("STRUTS_1") || techs.includes("STRUTS_2")) techComplexity -= 5;
  if (techs.length > 5) { techComplexity -= 10; attentionPoints.push(`${techs.length} technologies différentes détectées`); }
  techComplexity = Math.max(0, Math.min(100, techComplexity));

  // 2. Couverture du code (25%)
  const totalClasses = components.length;
  const resolvedTypes = components.filter((c) => c.confidence >= 70).length;
  const codeCoverage = totalClasses > 0 ? Math.round((resolvedTypes / totalClasses) * 100) : 0;

  // 3. Risque de rupture (25%) — 100 = risque faible
  let breakingRisk = 100;
  if (components.some((c) => c.technology === "SOAP")) { breakingRisk -= 20; }
  if (components.some((c) => c.technology === "SERVLET" && (c.metadata as any)?.usesSession)) {
    breakingRisk -= 15;
    attentionPoints.push("HttpSession détecté → plan JWT recommandé");
  }
  if (techs.includes("JMS")) { breakingRisk -= 10; attentionPoints.push("JMS → Kafka : provisionnement broker nécessaire"); }
  if (techs.includes("EJB_2X")) breakingRisk -= 10;
  breakingRisk = Math.max(0, Math.min(100, breakingRisk));

  // 4. Valeur ajoutée estimée (15%)
  let addedValue = 70;
  if (techs.includes("EJB_2X")) addedValue += 15; // EJB 2.x → gros gain
  if (techs.includes("JDBC")) addedValue += 10; // JDBC raw → JPA = gros gain
  if (techs.includes("SERVLET")) addedValue += 5;
  addedValue = Math.min(100, addedValue);

  // 5. Confiance du moteur (10%)
  const avgConfidence = components.length > 0
    ? Math.round(components.reduce((sum, c) => sum + c.confidence, 0) / components.length)
    : 0;
  const engineConfidence = avgConfidence;

  // Score global pondéré
  const global = Math.round(
    techComplexity * 0.25 +
    codeCoverage * 0.25 +
    breakingRisk * 0.25 +
    addedValue * 0.15 +
    engineConfidence * 0.10
  );

  // Label
  let label: string;
  if (global >= 80) label = "Excellent candidat à la modernisation";
  else if (global >= 60) label = "Bon candidat à la modernisation";
  else if (global >= 40) label = "Migration possible avec accompagnement";
  else label = "Migration complexe — audit approfondi recommandé";

  // Effort estimé
  const effort = components.length <= 5 ? "1-2 jours développeur"
    : components.length <= 15 ? "3-5 jours développeur"
    : components.length <= 30 ? "1-2 semaines développeur"
    : "2-4 semaines développeur";

  return {
    global,
    dimensions: {
      technicalComplexity: techComplexity,
      codeCoverage,
      breakingRisk,
      addedValue,
      engineConfidence,
    },
    label,
    attentionPoints,
    estimatedEffort: effort,
  };
}
