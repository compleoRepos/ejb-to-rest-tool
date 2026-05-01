/**
 * Infrastructure Generators — Config, Cloud, POM, Remote Adapters, Stubs, Migration Report.
 * Rules: R3 (semantic HTTP status), R8 (stubs for external dependencies).
 * Extracted from spring-generator.ts (v5.5).
 */

import type { ProjectIR, UseCaseIR, DtoIR, RemoteInterfaceIR } from "../java-parser";
import {
  type GeneratedFile, type MigrationReportContext,
  toPascalCase, toMethodName, mapDtoClassName, pluralize,
  inferSemanticEndpoint, mapToSpringType,
} from "./shared";

// ─── Main Application ───────────────────────────────────────────────────────

export function generateMainApplication(basePackage: string, basePath: string, ir: ProjectIR): GeneratedFile {
  const appName = toPascalCase(ir.artifactId) + "Application";
  return {
    path: `${basePath}/${appName}.java`,
    category: "main",
    content: `package ${basePackage};

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * ${ir.projectName || ir.artifactId} — Spring Boot 3.2 Application.
 * Auto-generated from EJB legacy project by Compleo Modernizer.
 */
@SpringBootApplication
public class ${appName} {

    public static void main(String[] args) {
        SpringApplication.run(${appName}.class, args);
    }
}
`,
  };
}

// ─── Remote Service Adapter — R8 ───────────────────────────────────────────

export function generateRemoteServiceAdapter(
  basePackage: string, basePath: string, remote: RemoteInterfaceIR
): GeneratedFile {
  const adapterName = remote.className.replace("Remote", "Adapter");
  const adapterImports = new Set<string>();
  const methods = remote.methods.map(m => {
    const params = m.parameters.map(p => {
      const mappedType = mapToSpringType(p.type, false, new Set(), adapterImports);
      return `${mappedType} ${p.name}`;
    }).join(", ");
    const mappedReturn = mapToSpringType(m.returnType, false, new Set(), adapterImports);
    const roles = m.rolesAllowed.length > 0
      ? `\n    @PreAuthorize("hasAnyRole(${m.rolesAllowed.map(r => `'${r}'`).join(", ")})")`
      : "";
    return `${roles}
    /**
     * ${m.name} — Stub for legacy @Remote method.
     * TODO: Implement the call to core banking system.
     */
    public ${mappedReturn} ${m.name}(${params}) {
        log.warn("STUB: ${m.name} called — not yet implemented");
        // TODO: Implement ${m.name} — migrated from @Remote ${remote.className}
        // TODO: Replace with actual core banking API call
        throw new UnsupportedOperationException("${m.name} not yet implemented — see legacy ${remote.className}");
    }`;
  }).join("\n\n");

  return {
    path: `${basePath}/adapter/${adapterName}.java`,
    category: "service",
    content: `package ${basePackage}.adapter;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;

/**
 * ${adapterName} — Adapter for legacy @Remote interface ${remote.className}.
 * ${remote.methods.length} method(s) to implement.
 * R8: Stub implementation — replace with actual core banking calls.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ${adapterName} {

${methods}
}
`,
  };
}

// ─── Injected Service Stub Generator ──────────────────────────────────────

export function generateInjectedServiceStub(
  basePackage: string, basePath: string, serviceType: string, sourceContent: string,
  usedMethods?: Set<string>
): GeneratedFile {
  const adapterName = serviceType.endsWith("Service")
    ? serviceType.replace(/Service$/, "Adapter")
    : serviceType + "Adapter";

  const methods: string[] = [];
  const seenMethods = new Set<string>();

  if (sourceContent) {
    // FIX v7.8 BUG-7: Match both interface declarations (ending with ;) AND class method implementations (ending with {)
    // This handles EJB implementation classes (NotificationMulticanalEJB) not just interfaces
    const methodRegex = /^\s*(?:public\s+)?([A-Z]\w*(?:<[^>]+>)?(?:\[\])?|void|boolean|int|long|double|float|char|byte|short|String)\s+(\w+)\s*\(([^)]*)\)\s*(?:throws\s+[\w,\s]+)?\s*[;{]/gm;
    let mm;
    while ((mm = methodRegex.exec(sourceContent)) !== null) {
      const returnType = mm[1].trim();
      const methodName = mm[2];
      const params = mm[3].trim();
      // Validate: return type must be a valid Java type
      if (!/^(?:void|boolean|int|long|double|float|char|byte|short|String|[A-Z]\w*)/.test(returnType)) continue;
      // Skip duplicates
      if (seenMethods.has(methodName)) continue;
      // FIX 3: If usedMethods is provided, only include methods that are actually called
      if (usedMethods && usedMethods.size > 0 && !usedMethods.has(methodName)) continue;
      seenMethods.add(methodName);
      const springReturn = returnType === "void" ? "void" : returnType;
      const defaultReturn = springReturn === "void" ? "" : springReturn === "String" ? "return \"\";" : springReturn === "boolean" ? "return false;" : `return null;`;
      // v10.15: Enhanced stub with RestTemplate pattern and business context
      const isCoreBanking = /Magix|Tsi|Grc|Envelope|SynchroneService|CoreBanking/i.test(serviceType);
      const isNotification = /Notification|Mail|Sms|Email/i.test(serviceType);
      const isAuth = /Auth|Login|Session|Token|Ldap/i.test(serviceType);
      let stubBody: string;
      if (isCoreBanking) {
        stubBody = springReturn === "void"
          ? `        log.info("Calling core banking: ${serviceType}.${methodName}");
        // Core banking integration via REST adapter
        // Map<String, Object> request = Map.of("operation", "${methodName}"${params ? `, "params", Map.of(${params.split(",").map((p: string) => { const parts = p.trim().split(/\s+/); return parts.length >= 2 ? `"${parts[parts.length-1]}", ${parts[parts.length-1]}` : ""; }).filter(Boolean).join(", ")})` : ")"};
        // ResponseEntity<Map> response = restTemplate.postForEntity(coreBankingUrl + "/${methodName}", request, Map.class);
        // TODO: Map response to business objects`
          : `        log.info("Calling core banking: ${serviceType}.${methodName}");
        // Core banking integration via REST adapter
        // Map<String, Object> request = Map.of("operation", "${methodName}"${params ? `, "params", Map.of(${params.split(",").map((p: string) => { const parts = p.trim().split(/\s+/); return parts.length >= 2 ? `"${parts[parts.length-1]}", ${parts[parts.length-1]}` : ""; }).filter(Boolean).join(", ")})` : ")"};
        // ResponseEntity<${springReturn}> response = restTemplate.postForEntity(coreBankingUrl + "/${methodName}", request, ${springReturn}.class);
        // return response.getBody();
        ${defaultReturn}`;
      } else if (isNotification) {
        stubBody = `        log.info("Sending notification via ${serviceType}.${methodName}");
        // Notification service integration
        // TODO: Configure notification channel (email/SMS/push)
        ${springReturn === "void" ? "// Notification sent" : defaultReturn}`;
      } else if (isAuth) {
        stubBody = `        log.info("Authentication via ${serviceType}.${methodName}");
        // Authentication/Authorization service integration
        // TODO: Integrate with Spring Security or external IdP
        ${springReturn === "void" ? "// Auth completed" : defaultReturn}`;
      } else {
        stubBody = `        log.info("${serviceType}.${methodName} called");
        // Legacy service adapter — implement business logic
        ${springReturn === "void" ? "// Operation completed" : defaultReturn}`;
      }
      methods.push(`
    /**
     * ${methodName} — Adapter for legacy ${serviceType}.${methodName}.
     * Migrated from EJB @Inject/${serviceType} to Spring @Service.
     * Original signature: ${springReturn} ${methodName}(${params})
     */
    public ${springReturn} ${methodName}(${params}) {
${stubBody}
    }`);
    }
  }

  // If no source content but we have usedMethods from inference, generate stubs from method names
  if (methods.length === 0 && usedMethods && usedMethods.size > 0) {
    for (const methodName of usedMethods) {
      if (seenMethods.has(methodName)) continue;
      seenMethods.add(methodName);
      methods.push(`
    /**
     * ${methodName} — Stub inferred from usage in UseCase.
     * TODO: Implement the call to core banking system.
     */
    public Object ${methodName}(Object... args) {
        log.info("${serviceType}.${methodName} called — adapter pattern");
        // Legacy service adapter — inferred from usage in UseCase
        // TODO: Determine correct signature from legacy code and implement
        throw new UnsupportedOperationException("${serviceType}.${methodName} — signature to be refined from legacy source");
    }`);
    }
  }

  if (methods.length === 0) {
    methods.push(`
    /**
     * Placeholder — no methods could be extracted from legacy source.
     * TODO: Add methods matching the legacy ${serviceType} interface.
     */
    public void execute(String transactionCode, Map<String, String> request) {
        log.warn("STUB: ${serviceType}.execute called — not yet implemented");
        throw new UnsupportedOperationException("${serviceType}.execute not yet implemented");
    }`);
  }

  return {
    path: `${basePath}/adapter/${adapterName}.java`,
    category: "service" as const,
    content: `package ${basePackage}.adapter;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import java.util.Map;

/**
 * ${adapterName} — Adapter for legacy ${serviceType}.
 * Migrated from EJB @Inject to Spring @Service (Adapter pattern).
 * ${methods.length} method(s) migrated — implement core banking integration.
 *
 * @see <a href="https://docs.spring.io/spring-framework/reference/web/webflux-webclient.html">WebClient docs</a>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ${adapterName} {

    // TODO: Configure the core banking endpoint URL in application.yml
    // @Value("\${core-banking.${serviceType.toLowerCase()}.url:http://localhost:8080}")
    // private String coreBankingUrl;
    // private final RestTemplate restTemplate;
${methods.join("\n")}
}
`,
  };
}

// ─── Config Generators ──────────────────────────────────────────────────────

export function generateApplicationYml(ir: ProjectIR): GeneratedFile {
  return {
    path: "src/main/resources/application.yml",
    category: "config",
    content: `# ${ir.projectName || ir.artifactId} — Spring Boot Configuration
# Auto-generated by Compleo Modernizer

spring:
  application:
    name: ${ir.artifactId}
  datasource:
    url: \${DATABASE_URL:jdbc:mysql://localhost:3306/${ir.artifactId.replace(/-/g, "_")}}
    username: \${DATABASE_USER:root}
    password: \${DATABASE_PASSWORD:}
    driver-class-name: com.mysql.cj.jdbc.Driver
  jpa:
    hibernate:
      ddl-auto: validate
    show-sql: false
    properties:
      hibernate:
        dialect: org.hibernate.dialect.MySQLDialect
        format_sql: true

server:
  port: \${PORT:8080}
  servlet:
    context-path: /

management:
  endpoints:
    web:
      exposure:
        include: health,info,metrics
  endpoint:
    health:
      show-details: when_authorized

logging:
  level:
    root: INFO
    ${ir.groupId || "com.example"}: DEBUG

# OpenAPI / Swagger
springdoc:
  api-docs:
    path: /api-docs
  swagger-ui:
    path: /swagger-ui.html
`,
  };
}

export function generateApplicationProperties(ir: ProjectIR): GeneratedFile {
  return {
    path: "src/main/resources/application.properties",
    category: "config",
    content: `# ${ir.projectName || ir.artifactId} — Spring Boot Properties
# Auto-generated by Compleo Modernizer
spring.application.name=${ir.artifactId}
`,
  };
}

export function generateDockerfile(ir: ProjectIR): GeneratedFile {
  return {
    path: "Dockerfile",
    category: "cloud",
    content: `# ${ir.projectName || ir.artifactId} — Multi-stage Docker build
# Auto-generated by Compleo Modernizer

# Stage 1: Build
FROM eclipse-temurin:17-jdk-alpine AS builder
WORKDIR /app
COPY pom.xml .
COPY src ./src
RUN apk add --no-cache maven && mvn clean package -DskipTests

# Stage 2: Runtime
FROM eclipse-temurin:17-jre-alpine
WORKDIR /app
COPY --from=builder /app/target/*.jar app.jar

# Security: non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:8080/actuator/health || exit 1

ENTRYPOINT ["java", "-jar", "app.jar"]
`,
  };
}

export function generateDockerCompose(ir: ProjectIR): GeneratedFile {
  const serviceName = ir.artifactId;
  return {
    path: "docker-compose.yml",
    category: "cloud",
    content: `# ${ir.projectName || ir.artifactId} — Docker Compose
# Auto-generated by Compleo Modernizer
version: '3.8'

services:
  ${serviceName}:
    build: .
    ports:
      - "8080:8080"
    environment:
      - SPRING_PROFILES_ACTIVE=docker
      - DATABASE_URL=jdbc:mysql://mysql:3306/${serviceName.replace(/-/g, "_")}
      - DATABASE_USER=root
      - DATABASE_PASSWORD=root
    depends_on:
      mysql:
        condition: service_healthy

  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: root
      MYSQL_DATABASE: ${serviceName.replace(/-/g, "_")}
    ports:
      - "3306:3306"
    volumes:
      - mysql-data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  mysql-data:
`,
  };
}

export function generateK8sDeployment(ir: ProjectIR): GeneratedFile {
  return {
    path: "k8s/deployment.yaml",
    category: "cloud",
    content: `# ${ir.projectName || ir.artifactId} — Kubernetes Deployment
# Auto-generated by Compleo Modernizer
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${ir.artifactId}
  labels:
    app: ${ir.artifactId}
spec:
  replicas: 2
  selector:
    matchLabels:
      app: ${ir.artifactId}
  template:
    metadata:
      labels:
        app: ${ir.artifactId}
    spec:
      containers:
        - name: ${ir.artifactId}
          image: ${ir.artifactId}:latest
          ports:
            - containerPort: 8080
          env:
            - name: SPRING_PROFILES_ACTIVE
              value: "kubernetes"
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: ${ir.artifactId}-secrets
                  key: database-url
          resources:
            requests:
              memory: "256Mi"
              cpu: "250m"
            limits:
              memory: "512Mi"
              cpu: "500m"
          livenessProbe:
            httpGet:
              path: /actuator/health
              port: 8080
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /actuator/health
              port: 8080
            initialDelaySeconds: 15
            periodSeconds: 5
`,
  };
}

export function generateK8sService(ir: ProjectIR): GeneratedFile {
  return {
    path: "k8s/service.yaml",
    category: "cloud",
    content: `# ${ir.projectName || ir.artifactId} — Kubernetes Service
# Auto-generated by Compleo Modernizer
apiVersion: v1
kind: Service
metadata:
  name: ${ir.artifactId}
spec:
  selector:
    app: ${ir.artifactId}
  ports:
    - protocol: TCP
      port: 80
      targetPort: 8080
  type: ClusterIP
`,
  };
}

// ─── POM.xml Generator ──────────────────────────────────────────────────────

export function generatePomXml(ir: ProjectIR, basePackage: string): GeneratedFile {
  return {
    path: "pom.xml",
    category: "pom",
    content: `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.2.5</version>
        <relativePath/>
    </parent>

    <groupId>${ir.groupId || "com.example"}</groupId>
    <artifactId>${ir.artifactId}</artifactId>
    <version>1.0.0-SNAPSHOT</version>
    <name>${ir.projectName || ir.artifactId}</name>
    <description>Modernized from EJB to Spring Boot 3.2 by Compleo Modernizer</description>

    <properties>
        <java.version>17</java.version>
    </properties>

    <dependencies>
        <!-- Spring Boot Starters -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-validation</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-data-jpa</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-actuator</artifactId>
        </dependency>

        <!-- OpenAPI / Swagger -->
        <dependency>
            <groupId>org.springdoc</groupId>
            <artifactId>springdoc-openapi-starter-webmvc-ui</artifactId>
            <version>2.3.0</version>
        </dependency>

        <!-- Database -->
        <dependency>
            <groupId>com.mysql</groupId>
            <artifactId>mysql-connector-j</artifactId>
            <scope>runtime</scope>
        </dependency>

        <!-- Lombok -->
        <dependency>
            <groupId>org.projectlombok</groupId>
            <artifactId>lombok</artifactId>
            <optional>true</optional>
        </dependency>

        <!-- Test -->
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
                <configuration>
                    <excludes>
                        <exclude>
                            <groupId>org.projectlombok</groupId>
                            <artifactId>lombok</artifactId>
                        </exclude>
                    </excludes>
                </configuration>
            </plugin>
        </plugins>
    </build>
</project>
`,
  };
}

// ─── Migration Report Generator ─────────────────────────────────────────────

export function generateMigrationReport(
  ir: ProjectIR, domainMap: Map<string, UseCaseIR[]>, dtoMap: Map<string, DtoIR>,
  reportContext?: MigrationReportContext
): GeneratedFile {
  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];
  const timeStr = now.toISOString().split("T")[1].substring(0, 5).replace(":", "h");

  function computeConfidence(uc: UseCaseIR): number {
    let score = 70;
    if (uc.voInType && uc.voInType !== "Void") score += 8;
    if (uc.voOutType && uc.voOutType !== "Void") score += 8;
    if (uc.injectedServices.length > 0) score += 4;
    if (uc.transactional) score += 5;
    if (uc.bianDomain && uc.bianAction) score += 5;
    return Math.min(score, 99);
  }

  const confidenceScores = ir.useCases.map(uc => computeConfidence(uc));
  const globalConfidence = confidenceScores.length > 0
    ? Math.round(confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length)
    : 0;

  const totalTests = [...domainMap.keys()].length * ir.useCases.length;
  const stubCount = ir.remoteInterfaces.length;
  const ambiguityTotal = reportContext?.ambiguities?.length || 0;
  const userResolved = reportContext?.userResolvedCount || 0;
  const autoResolved = reportContext?.autoResolvedCount || (ambiguityTotal - userResolved);

  let mappingTable = "| Classe source | Type | Endpoint genere | Methode | Confiance |\n";
  mappingTable += "|---------------|------|-----------------|---------|-----------|\n";
  for (let i = 0; i < ir.useCases.length; i++) {
    const uc = ir.useCases[i];
    const semantic = inferSemanticEndpoint(uc, uc.domain || "general");
    const conf = confidenceScores[i];
    mappingTable += `| ${uc.className} | UseCase | ${semantic.method} ${semantic.path} | ${toMethodName(uc.className)} | ${conf}% |\n`;
  }

  let choicesSection = "";
  if (reportContext?.ambiguities && reportContext.ambiguities.length > 0) {
    let choicesTable = "| Ambiguite | Classe concernee | Choix fait | Recommandation moteur |\n";
    choicesTable += "|-----------|-----------------|------------|----------------------|\n";
    for (const amb of reportContext.ambiguities) {
      const choice = reportContext.userChoices?.find(c => c.ambiguityId === amb.id);
      const selectedOption = choice
        ? amb.options.find(o => o.id === choice.selectedOptionId)
        : amb.options.find(o => o.label.includes("(recommande)") || o.id === "recommended");
      const selectedLabel = selectedOption?.label || "Auto (recommandation)";
      const isAligned = !choice || choice.selectedOptionId === amb.options[0]?.id;
      choicesTable += `| ${amb.type} | ${amb.affectedClass} | ${selectedLabel} | ${amb.recommendation} ${isAligned ? "(aligne)" : "(divergent)"} |\n`;
    }
    choicesSection = `\n## 3. Choix effectues par l'utilisateur\n\n${choicesTable}\n`;
  } else {
    choicesSection = `\n## 3. Choix effectues par l'utilisateur\n\nAucune ambiguite detectee — toutes les decisions ont ete prises automatiquement par le moteur.\n`;
  }

  let depsSection = "";
  if (ir.remoteInterfaces.length > 0) {
    let depsTable = "| Classe | Type | Stub genere | Action requise |\n";
    depsTable += "|--------|------|-------------|----------------|\n";
    for (const remote of ir.remoteInterfaces) {
      const adapterName = remote.className.replace("Remote", "Adapter");
      const methodNames = remote.methods.map(m => m.name).join(", ");
      depsTable += `| ${remote.className} | Service core banking | ${adapterName}.java | Implementer ${methodNames} |\n`;
    }
    depsSection = `\n## 4. Dependances externes non resolues\n\nCes composants n'etaient pas dans le ZIP et ont ete generes en tant que stubs a implementer :\n\n${depsTable}\n`;
  } else {
    depsSection = `\n## 4. Dependances externes non resolues\n\nAucune dependance externe detectee.\n`;
  }

  const attentionPoints: string[] = [];
  if (reportContext?.ambiguities && reportContext?.userChoices) {
    for (const choice of reportContext.userChoices) {
      const amb = reportContext.ambiguities.find(a => a.id === choice.ambiguityId);
      if (amb) {
        const recOption = amb.options[0];
        if (recOption && choice.selectedOptionId !== recOption.id) {
          attentionPoints.push(`L'URL choisie pour ${amb.affectedClass} diverge de la recommandation REST. Verifier avec votre architecte API.`);
        }
      }
    }
  }
  for (const remote of ir.remoteInterfaces) {
    const adapterName = remote.className.replace("Remote", "Adapter");
    attentionPoints.push(`${adapterName} est un stub. L'appel au core banking doit etre implemente avant la mise en production.`);
  }
  for (const w of ir.warnings) {
    attentionPoints.push(w);
  }

  const attentionSection = attentionPoints.length > 0
    ? attentionPoints.map(p => `- ${p}`).join("\n")
    : "Aucun point d'attention.";

  let dtoTable = "| DTO Legacy | DTO Spring | Direction | Champs | Requis |\n";
  dtoTable += "|------------|------------|-----------|--------|--------|\n";
  for (const dto of ir.dtos) {
    const newName = mapDtoClassName(dto.className);
    const reqCount = dto.fields.filter(f => f.required).length;
    dtoTable += `| ${dto.className} | ${newName} | ${dto.direction} | ${dto.fields.length} | ${reqCount} |\n`;
  }

  const controllersCount = [...domainMap.keys()].length;
  const servicesCount = [...domainMap.keys()].length;
  const testsCount = [...domainMap.keys()].length;
  const totalFilesGenerated = ir.dtos.length + ir.enums.length + ir.exceptions.length + ir.validators.length + controllersCount * 3 + 8;

  return {
    path: "MIGRATION_REPORT.md",
    category: "report",
    content: `# Rapport de modernisation Compleo

Projet source : **${ir.projectName || ir.artifactId}** v${ir.version}
Genere le : ${dateStr} a ${timeStr}
Moteur Compleo : v2.0.0

---

## 1. Resume executif

| Metrique | Valeur |
|----------|--------|
| Classes EJB analysees | ${ir.stats.totalFiles} |
| UseCases detectes | ${ir.stats.useCaseCount} |
| DTOs detectes (VoIn/VoOut) | ${ir.stats.dtoCount} |
| Controllers REST generes | ${controllersCount} |
| Endpoints REST crees | ${ir.useCases.length} |
| Services generes | ${servicesCount} |
| Tests generes | ${ir.useCases.length * 3} (3 par endpoint) |
| Stubs crees (dependances externes) | ${stubCount}${ir.remoteInterfaces.length > 0 ? ` (${ir.remoteInterfaces.map(r => r.className.replace("Remote", "Adapter")).join(", ")})` : ""} |
| Score de confiance global | **${globalConfidence}%** |
| Ambiguites resolues par l'utilisateur | ${userResolved} |
| Ambiguites auto-resolues (recommandation) | ${autoResolved} |

---

## 2. Mapping complet EJB → REST

${mappingTable}

---
${choicesSection}
---
${depsSection}
---

## 5. Points d'attention

${attentionSection}

---

## 6. Prochaines etapes recommandees

1. ${ir.remoteInterfaces.length > 0 ? `Implementer ${ir.remoteInterfaces.map(r => r.className.replace("Remote", "Adapter")).join(", ")}` : "Implementer la logique metier dans les methodes Service (marquees TODO)"}
2. Configurer la datasource dans application.yml
3. ${attentionPoints.some(p => p.includes("diverge")) ? "Verifier les URLs divergentes avec votre equipe architecture" : "Verifier les endpoints REST avec votre equipe architecture"}
4. Executer les tests : \`mvn test\`
5. Demarrer l'application : \`mvn spring-boot:run\`
6. Acceder a Swagger UI : \`http://localhost:8080/swagger-ui.html\`

---

## Annexe A — Mapping DTO

${dtoTable}

## Annexe B — Domaines

${[...domainMap.entries()].map(([d, ucs]) => `- **${d}**: ${ucs.length} endpoint(s) — ${ucs.map(u => u.className).join(", ")}`).join("\n")}

## Annexe C — Regles qualite appliquees

| Regle | Description | Statut |
|-------|-------------|--------|
| R1 | Nommage semantique des endpoints | Appliquee |
| R2 | PathVariable vs RequestBody | Appliquee |
| R3 | Codes HTTP semantiques | Appliquee |
| R4 | Pas de try/catch dans les Controllers | Appliquee |
| R5 | Javadoc → @Operation OpenAPI | Appliquee |
| R6 | Injection par constructeur | Appliquee |
| R7 | @Transactional au bon niveau | Appliquee |
| R8 | Stub pour dependances externes | Appliquee |
| R9 | Types stricts, jamais Object | Appliquee |
| R10 | Bean Validation inferee | Appliquee |
| R11 | Donnees de test realistes | Appliquee |
| R12 | Minimum 3 tests par endpoint | Appliquee |

## Annexe D — Fichiers generes

| Categorie | Nombre |
|-----------|--------|
| Controllers | ${controllersCount} |
| Services | ${servicesCount} |
| DTOs | ${ir.dtos.length} |
| Tests | ${testsCount} |
| Enums | ${ir.enums.length} |
| Exceptions | ${ir.exceptions.length + 1} |
| Validators | ${ir.validators.length} |
| Config | 2 |
| Cloud | 4 |
| Total | ~${totalFilesGenerated} |

## Annexe E — Stack technique cible

| Legacy | Moderne |
|--------|--------|
| EJB 3.x | Spring Boot 3.2 |
| @UseCase + BaseUseCase | @RestController + @Service |
| ValueObject / VoIn / VoOut | Lombok @Data @Builder DTOs |
| JAXB @XmlElement | Jakarta Validation |
| @Transactional (JTA) | @Transactional (Spring) |
| FwkRollbackException | @RestControllerAdvice |
| EaiLog | Slf4j @Slf4j |
| Maven EJB Plugin | Spring Boot Maven Plugin |
| JUnit 4 | JUnit 5 + MockMvc |
| Injection manuelle | @RequiredArgsConstructor |
`,
  };
}
