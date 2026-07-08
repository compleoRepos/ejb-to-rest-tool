/**
 * BIAN Wrapper Generator
 * Generates Spring Boot projects that wrap Adapter REST endpoints
 * following BIAN (Banking Industry Architecture Network) standards.
 *
 * Key design decisions:
 * - DTOs are namespaced per adapter to avoid collisions (e.g., SaveRequest → VirementSaveRequest)
 * - A single unified RestAdapter per wrapper handles all backend calls
 * - Service layer references the unified adapter
 * - OpenAPI paths include adapter prefix to avoid path collisions
 * - Proper HTTP method handling (GET/POST/PUT/DELETE)
 */
import path from "path";
import fs from "fs/promises";
import { ZipArchive } from "archiver";
import { createWriteStream } from "fs";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AdapterEndpoint {
  operation: string;
  method: string;
  path: string;
  requestFields: FieldDef[];
  responseFields: FieldDef[];
  ejbClassName?: string;
}

export interface FieldDef {
  name: string;
  type: string;
  required?: boolean;
}

export interface BianProject {
  adapterName: string;
  endpoints: AdapterEndpoint[];
  serviceDomain?: string;
}

export interface BianGenerationOptions {
  projects: BianProject[];
  outputDir: string;
  groupId: string;
  basePackage: string;
}

export interface BianGenerationResult {
  success: boolean;
  wrappers: BianWrapperInfo[];
  errors: string[];
}

export interface BianWrapperInfo {
  name: string;
  serviceDomain: string;
  domainId: string;
  endpoints: number;
  filesGenerated: number;
  outputDir: string;
}

// Internal type for endpoints with adapter context and unique naming
interface ResolvedEndpoint {
  operation: string;
  method: string;
  path: string;
  requestFields: FieldDef[];
  responseFields: FieldDef[];
  adapterName: string;
  /** Unique DTO prefix to avoid collisions (e.g., "VirementSave") */
  dtoPrefix: string;
  /** Unique method name in Java (e.g., "virementSave") */
  javaMethodName: string;
  /** BIAN action term */
  actionTerm: string;
  /** BIAN path segment */
  bianPathSegment: string;
}

// ─── BIAN Service Domain Mapping ──────────────────────────────────────────────

const BIAN_DOMAIN_RULES: Array<{ keywords: string[]; domain: string; domainId: string }> = [
  { keywords: ["carte", "card", "3dsecure", "token", "monetique", "releve", "vente", "plafond"], domain: "Card Administration", domainId: "card-administration" },
  { keywords: ["chequier", "dotation", "disposition", "virement", "payment", "transfer", "gsim"], domain: "Payment Order", domainId: "payment-order" },
  { keywords: ["epargne", "assistance", "opv", "offer", "souscription", "carnet", "depot"], domain: "Customer Offer", domainId: "customer-offer" },
  { keywords: ["notification", "sms", "push", "otp", "envoi"], domain: "Party Notification", domainId: "party-notification" },
  { keywords: ["compte", "avenir", "opere", "account", "ouverture"], domain: "Current Account", domainId: "current-account" },
  { keywords: ["credit", "jocker", "loan", "pret"], domain: "Consumer Loan", domainId: "consumer-loan" },
  { keywords: ["transfert", "euro", "exchange", "devise"], domain: "Foreign Exchange", domainId: "foreign-exchange" },
  { keywords: ["facture", "paiement", "vignette", "fatourati", "recharge", "cmi"], domain: "Payment Execution", domainId: "payment-execution" },
  { keywords: ["titre", "valeur", "bourse"], domain: "Securities Trading", domainId: "securities-trading" },
  { keywords: ["sso", "authentification", "login", "session"], domain: "Party Authentication", domainId: "party-authentication" },
  { keywords: ["reporting", "report", "dematerialise"], domain: "Regulatory Reporting", domainId: "regulatory-reporting" },
];

function inferBianDomain(adapterName: string): { domain: string; domainId: string } {
  const lower = adapterName.toLowerCase();
  for (const rule of BIAN_DOMAIN_RULES) {
    if (rule.keywords.some((kw) => lower.includes(kw))) {
      return { domain: rule.domain, domainId: rule.domainId };
    }
  }
  return { domain: "Customer Management", domainId: "customer-management" };
}

// ─── BIAN Action Term Mapping ─────────────────────────────────────────────────

function inferBianActionTerm(operation: string, method: string): string {
  const lower = operation.toLowerCase();
  if (lower.startsWith("find") || lower.startsWith("get") || lower.startsWith("search") || lower.startsWith("list") || lower.startsWith("count") || lower.startsWith("sum")) return "Retrieve";
  if (lower.startsWith("save") || lower.startsWith("create") || lower.startsWith("add") || lower.startsWith("insert") || lower.startsWith("enrg")) return "Initiate";
  if (lower.startsWith("update") || lower.startsWith("modify") || lower.startsWith("edit")) return "Update";
  if (lower.startsWith("delete") || lower.startsWith("remove") || lower.startsWith("cancel")) return "Control";
  if (lower.startsWith("validate") || lower.startsWith("check") || lower.startsWith("verify") || lower.startsWith("control")) return "Evaluate";
  if (lower.startsWith("execute") || lower.startsWith("process") || lower.startsWith("run") || lower.startsWith("exe")) return "Execute";
  if (method === "GET") return "Retrieve";
  if (method === "POST") return "Initiate";
  if (method === "PUT") return "Update";
  if (method === "DELETE") return "Control";
  return "Execute";
}

// ─── Endpoint Resolution (deduplication + namespacing) ────────────────────────

function resolveEndpoints(endpoints: Array<AdapterEndpoint & { adapterName: string }>): ResolvedEndpoint[] {
  const seen = new Map<string, number>();
  const resolved: ResolvedEndpoint[] = [];

  for (const ep of endpoints) {
    // Create a short adapter prefix from the adapter name
    const adapterPrefix = getAdapterPrefix(ep.adapterName);
    const operationPascal = toPascalCase(ep.operation);
    
    // Build unique DTO prefix: AdapterPrefix + Operation
    let baseDtoPrefix = adapterPrefix + operationPascal;
    
    // Handle duplicates: same adapter + same operation name from different EJB classes
    const key = baseDtoPrefix.toLowerCase();
    const count = seen.get(key) || 0;
    seen.set(key, count + 1);

    // Append suffix for duplicates (2nd occurrence gets "V2", 3rd gets "V3", etc.)
    const suffix = count > 0 ? `V${count + 1}` : "";
    const dtoPrefix = baseDtoPrefix + suffix;
    const javaMethodName = toCamelCase(adapterPrefix) + operationPascal + suffix;
    const actionTerm = inferBianActionTerm(ep.operation, ep.method);
    const bianPathSegment = toKebabCase(adapterPrefix + "-" + ep.operation) + (suffix ? `-v${count + 1}` : "");

    resolved.push({
      ...ep,
      dtoPrefix,
      javaMethodName,
      actionTerm,
      bianPathSegment,
    });
  }

  return resolved;
}

/** Extract a short prefix from adapter name (e.g., "virement-bmcedirect" → "Virement") */
function getAdapterPrefix(adapterName: string): string {
  // Take the first meaningful segment
  const parts = adapterName.split("-").filter((p) => p !== "bmcedirect" && p !== "bmce" && p.length > 2);
  if (parts.length === 0) return toPascalCase(adapterName.split("-")[0]);
  // Use first 1-2 parts for brevity
  return toPascalCase(parts.slice(0, 2).join("-"));
}

// ─── Main Generation Function ─────────────────────────────────────────────────

export async function generateBianWrappers(options: BianGenerationOptions): Promise<BianGenerationResult> {
  const { projects, outputDir, groupId, basePackage } = options;
  const errors: string[] = [];
  const wrappers: BianWrapperInfo[] = [];

  // Step 1: Group projects by BIAN Service Domain
  const domainGroups = new Map<string, { domain: string; domainId: string; endpoints: Array<AdapterEndpoint & { adapterName: string }> }>();

  for (const project of projects) {
    const { domain, domainId } = project.serviceDomain
      ? { domain: project.serviceDomain, domainId: project.serviceDomain.toLowerCase().replace(/\s+/g, "-") }
      : inferBianDomain(project.adapterName);

    if (!domainGroups.has(domainId)) {
      domainGroups.set(domainId, { domain, domainId, endpoints: [] });
    }

    const group = domainGroups.get(domainId)!;
    for (const ep of project.endpoints) {
      group.endpoints.push({ ...ep, adapterName: project.adapterName });
    }
  }

  // Step 2: Generate a Spring Boot project per domain
  for (const [domainId, group] of Array.from(domainGroups.entries())) {
    try {
      const wrapperDir = path.join(outputDir, `${domainId}-wrapper`);
      await fs.mkdir(wrapperDir, { recursive: true });

      const artifactId = `${domainId}-wrapper`;
      const pkg = `${basePackage}.${domainId.replace(/-/g, "")}`;

      // Resolve endpoints with unique naming
      const resolvedEndpoints = resolveEndpoints(group.endpoints);

      await generateSpringBootProject({
        outputDir: wrapperDir,
        groupId,
        artifactId,
        basePackage: pkg,
        serviceDomain: group.domain,
        domainId,
        endpoints: resolvedEndpoints,
        rawEndpoints: group.endpoints,
      });

      const filesGenerated = await countFiles(wrapperDir);

      wrappers.push({
        name: artifactId,
        serviceDomain: group.domain,
        domainId,
        endpoints: group.endpoints.length,
        filesGenerated,
        outputDir: wrapperDir,
      });
    } catch (err: any) {
      errors.push(`Failed to generate ${domainId}: ${err.message}`);
    }
  }

  return {
    success: errors.length === 0,
    wrappers,
    errors,
  };
}

// ─── Spring Boot Project Generation ──────────────────────────────────────────

interface SpringBootGenOptions {
  outputDir: string;
  groupId: string;
  artifactId: string;
  basePackage: string;
  serviceDomain: string;
  domainId: string;
  endpoints: ResolvedEndpoint[];
  rawEndpoints: Array<AdapterEndpoint & { adapterName: string }>;
}

async function generateSpringBootProject(opts: SpringBootGenOptions): Promise<void> {
  const { outputDir, groupId, artifactId, basePackage, serviceDomain, domainId, endpoints, rawEndpoints } = opts;
  const pkgPath = basePackage.replace(/\./g, "/");

  // Create directory structure
  const dirs = [
    `src/main/java/${pkgPath}/controller`,
    `src/main/java/${pkgPath}/service`,
    `src/main/java/${pkgPath}/adapter`,
    `src/main/java/${pkgPath}/dto/request`,
    `src/main/java/${pkgPath}/dto/response`,
    `src/main/java/${pkgPath}/mapper`,
    `src/main/java/${pkgPath}/config`,
    `src/main/resources`,
    `src/test/java/${pkgPath}`,
    `docs`,
  ];

  for (const dir of dirs) {
    await fs.mkdir(path.join(outputDir, dir), { recursive: true });
  }

  // Generate files
  await generatePom(outputDir, groupId, artifactId, basePackage);
  await generateApplication(outputDir, pkgPath, basePackage, artifactId);
  await generateApplicationYml(outputDir, artifactId, domainId, rawEndpoints);
  await generateResilience4jConfig(outputDir, pkgPath, basePackage);
  await generateController(outputDir, pkgPath, basePackage, serviceDomain, domainId, endpoints);
  await generateService(outputDir, pkgPath, basePackage, serviceDomain, domainId, endpoints);
  await generateRestAdapter(outputDir, pkgPath, basePackage, domainId, endpoints, rawEndpoints);
  await generateDtos(outputDir, pkgPath, basePackage, endpoints);
  await generateMapper(outputDir, pkgPath, basePackage);
  await generateDockerfile(outputDir, artifactId);
  await generateOpenApiSpec(outputDir, serviceDomain, domainId, basePackage, endpoints);
  await generateTests(outputDir, pkgPath, basePackage, serviceDomain, domainId);

  // Documentation
  await generateBianReadme(outputDir, artifactId, serviceDomain, domainId, rawEndpoints);
  await generateBianDeveloperGuide(outputDir, artifactId, serviceDomain, basePackage, endpoints, rawEndpoints);
  await generateBianDeploymentGuide(outputDir, artifactId, serviceDomain);
  await generateBianArchitecture(outputDir, artifactId, serviceDomain, domainId);
}

// ─── File Generators ──────────────────────────────────────────────────────────

async function generatePom(dir: string, groupId: string, artifactId: string, basePackage: string): Promise<void> {
  const content = `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.2.4</version>
        <relativePath/>
    </parent>

    <groupId>${groupId}</groupId>
    <artifactId>${artifactId}</artifactId>
    <version>1.0.0-SNAPSHOT</version>
    <packaging>jar</packaging>
    <name>${artifactId}</name>
    <description>BIAN-compliant wrapper for ${artifactId}</description>

    <properties>
        <java.version>17</java.version>
        <resilience4j.version>2.2.0</resilience4j.version>
        <springdoc.version>2.4.0</springdoc.version>
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
            <artifactId>spring-boot-starter-actuator</artifactId>
        </dependency>

        <!-- Resilience4j -->
        <dependency>
            <groupId>io.github.resilience4j</groupId>
            <artifactId>resilience4j-spring-boot3</artifactId>
            <version>\${resilience4j.version}</version>
        </dependency>
        <dependency>
            <groupId>io.github.resilience4j</groupId>
            <artifactId>resilience4j-circuitbreaker</artifactId>
            <version>\${resilience4j.version}</version>
        </dependency>
        <dependency>
            <groupId>io.github.resilience4j</groupId>
            <artifactId>resilience4j-retry</artifactId>
            <version>\${resilience4j.version}</version>
        </dependency>
        <dependency>
            <groupId>io.github.resilience4j</groupId>
            <artifactId>resilience4j-bulkhead</artifactId>
            <version>\${resilience4j.version}</version>
        </dependency>

        <!-- OpenAPI / Swagger -->
        <dependency>
            <groupId>org.springdoc</groupId>
            <artifactId>springdoc-openapi-starter-webmvc-ui</artifactId>
            <version>\${springdoc.version}</version>
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
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-compiler-plugin</artifactId>
                <version>3.12.1</version>
                <configuration>
                    <source>17</source>
                    <target>17</target>
                    <annotationProcessorPaths>
                        <path>
                            <groupId>org.projectlombok</groupId>
                            <artifactId>lombok</artifactId>
                            <version>1.18.30</version>
                        </path>
                    </annotationProcessorPaths>
                </configuration>
            </plugin>
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
`;
  await fs.writeFile(path.join(dir, "pom.xml"), content);
}

async function generateApplication(dir: string, pkgPath: string, basePackage: string, artifactId: string): Promise<void> {
  const className = toPascalCase(artifactId) + "Application";
  const content = `package ${basePackage};

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class ${className} {

    public static void main(String[] args) {
        SpringApplication.run(${className}.class, args);
    }
}
`;
  await fs.writeFile(path.join(dir, `src/main/java/${pkgPath}/${className}.java`), content);
}

async function generateApplicationYml(dir: string, artifactId: string, domainId: string, endpoints: Array<AdapterEndpoint & { adapterName: string }>): Promise<void> {
  const adapters = Array.from(new Set(endpoints.map((e) => e.adapterName)));
  const adapterUrls = adapters.map((a) => `    ${a}: \${${a.toUpperCase().replace(/-/g, "_")}_URL:http://localhost:8080/${a}/api}`).join("\n");

  const content = `server:
  port: 8081

spring:
  application:
    name: ${artifactId}
  profiles:
    active: \${SPRING_PROFILES_ACTIVE:dev}

# Adapter REST endpoints
adapter:
  urls:
${adapterUrls}

# Resilience4j Configuration
resilience4j:
  circuitbreaker:
    instances:
      adapterService:
        registerHealthIndicator: true
        slidingWindowSize: 10
        minimumNumberOfCalls: 5
        permittedNumberOfCallsInHalfOpenState: 3
        automaticTransitionFromOpenToHalfOpenEnabled: true
        waitDurationInOpenState: 30s
        failureRateThreshold: 50
        eventConsumerBufferSize: 10
  retry:
    instances:
      adapterService:
        maxAttempts: 3
        waitDuration: 1s
        enableExponentialBackoff: true
        exponentialBackoffMultiplier: 2
        retryExceptions:
          - org.springframework.web.client.ResourceAccessException
          - java.net.ConnectException
  bulkhead:
    instances:
      adapterService:
        maxConcurrentCalls: 25
        maxWaitDuration: 500ms

# Actuator
management:
  endpoints:
    web:
      exposure:
        include: health,info,metrics,circuitbreakers
  endpoint:
    health:
      show-details: always

# OpenAPI
springdoc:
  api-docs:
    path: /v3/api-docs
  swagger-ui:
    path: /swagger-ui.html
    operationsSorter: method
`;
  await fs.writeFile(path.join(dir, "src/main/resources/application.yml"), content);
}

async function generateResilience4jConfig(dir: string, pkgPath: string, basePackage: string): Promise<void> {
  const content = `package ${basePackage}.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestTemplate;

@Configuration
public class ResilienceConfig {

    @Bean
    public RestTemplate restTemplate() {
        return new RestTemplate();
    }
}
`;
  await fs.writeFile(path.join(dir, `src/main/java/${pkgPath}/config/ResilienceConfig.java`), content);
}

async function generateController(dir: string, pkgPath: string, basePackage: string, serviceDomain: string, domainId: string, endpoints: ResolvedEndpoint[]): Promise<void> {
  const className = toPascalCase(domainId) + "Controller";
  const serviceName = toPascalCase(domainId) + "Service";
  const serviceVar = toCamelCase(domainId) + "Service";

  // Collect unique imports (no duplicates)
  const importSet = new Set<string>();
  for (const ep of endpoints) {
    importSet.add(`import ${basePackage}.dto.request.${ep.dtoPrefix}Request;`);
    importSet.add(`import ${basePackage}.dto.response.${ep.dtoPrefix}Response;`);
  }
  const imports = Array.from(importSet).sort().join("\n");

  const methods = endpoints.map((ep) => {
    const reqDto = ep.dtoPrefix + "Request";
    const respDto = ep.dtoPrefix + "Response";
    const httpAnnotation = getSpringHttpAnnotation(ep.method);
    const bianPath = `/{cr-reference-id}/${ep.actionTerm.toLowerCase()}/${ep.bianPathSegment}`;

    const bodyParam = ep.method === "GET"
      ? ""
      : `\n            @Valid @RequestBody ${reqDto} request`;
    const serviceCall = ep.method === "GET"
      ? `${serviceVar}.${ep.javaMethodName}(crReferenceId)`
      : `${serviceVar}.${ep.javaMethodName}(crReferenceId, request)`;

    return `
    /**
     * ${ep.actionTerm} - ${ep.operation}
     * Adapter: ${ep.adapterName}
     * Original path: ${ep.method} ${ep.path}
     */
    ${httpAnnotation}("${bianPath}")
    @Operation(summary = "${ep.actionTerm} ${ep.operation}", description = "Adapter: ${ep.adapterName}")
    public ResponseEntity<ApiResponse<${respDto}>> ${ep.javaMethodName}(
            @PathVariable("cr-reference-id") String crReferenceId${bodyParam ? "," : ""}${bodyParam}) {
        ${respDto} result = ${serviceCall};
        return ResponseEntity.ok(ApiResponse.success(result));
    }`;
  }).join("\n");

  const content = `package ${basePackage}.controller;

import ${basePackage}.dto.response.ApiResponse;
import ${basePackage}.service.${serviceName};
${imports}
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * BIAN Controller for Service Domain: ${serviceDomain}
 * Exposes endpoints following BIAN naming conventions.
 */
@RestController
@RequestMapping("/api/v1/${domainId}")
@RequiredArgsConstructor
@Tag(name = "${serviceDomain}", description = "BIAN ${serviceDomain} Service Domain")
public class ${className} {

    private final ${serviceName} ${serviceVar};
${methods}
}
`;
  await fs.writeFile(path.join(dir, `src/main/java/${pkgPath}/controller/${className}.java`), content);
}

async function generateService(dir: string, pkgPath: string, basePackage: string, serviceDomain: string, domainId: string, endpoints: ResolvedEndpoint[]): Promise<void> {
  const className = toPascalCase(domainId) + "Service";
  const adapterName = toPascalCase(domainId) + "RestAdapter";
  const adapterVar = toCamelCase(domainId) + "RestAdapter";

  // Collect unique imports
  const importSet = new Set<string>();
  for (const ep of endpoints) {
    importSet.add(`import ${basePackage}.dto.request.${ep.dtoPrefix}Request;`);
    importSet.add(`import ${basePackage}.dto.response.${ep.dtoPrefix}Response;`);
  }
  const imports = Array.from(importSet).sort().join("\n");

  const methods = endpoints.map((ep) => {
    const reqDto = ep.dtoPrefix + "Request";
    const respDto = ep.dtoPrefix + "Response";

    const params = ep.method === "GET"
      ? "String crReferenceId"
      : `String crReferenceId, ${reqDto} request`;
    const adapterCall = ep.method === "GET"
      ? `${adapterVar}.${ep.javaMethodName}(crReferenceId)`
      : `${adapterVar}.${ep.javaMethodName}(crReferenceId, request)`;

    return `
    /**
     * ${ep.operation} — calls adapter ${ep.adapterName} at ${ep.method} ${ep.path}
     */
    @CircuitBreaker(name = "adapterService", fallbackMethod = "${ep.javaMethodName}Fallback")
    @Retry(name = "adapterService")
    @Bulkhead(name = "adapterService")
    public ${respDto} ${ep.javaMethodName}(${params}) {
        return ${adapterCall};
    }

    private ${respDto} ${ep.javaMethodName}Fallback(${params}, Throwable t) {
        log.error("Fallback for ${ep.javaMethodName}: {}", t.getMessage());
        throw new RuntimeException("Service temporarily unavailable for ${ep.operation}", t);
    }`;
  }).join("\n");

  const content = `package ${basePackage}.service;

import ${basePackage}.adapter.${adapterName};
${imports}
import io.github.resilience4j.bulkhead.annotation.Bulkhead;
import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import io.github.resilience4j.retry.annotation.Retry;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * Service layer for BIAN ${serviceDomain}.
 * Applies Resilience4j patterns (Circuit Breaker, Retry, Bulkhead).
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ${className} {

    private final ${adapterName} ${adapterVar};
${methods}
}
`;
  await fs.writeFile(path.join(dir, `src/main/java/${pkgPath}/service/${className}.java`), content);
}

async function generateRestAdapter(dir: string, pkgPath: string, basePackage: string, domainId: string, endpoints: ResolvedEndpoint[], rawEndpoints: Array<AdapterEndpoint & { adapterName: string }>): Promise<void> {
  const className = toPascalCase(domainId) + "RestAdapter";

  // Collect unique adapter names
  const adapterNames = Array.from(new Set(rawEndpoints.map((e) => e.adapterName)));

  // Collect unique imports
  const importSet = new Set<string>();
  for (const ep of endpoints) {
    importSet.add(`import ${basePackage}.dto.request.${ep.dtoPrefix}Request;`);
    importSet.add(`import ${basePackage}.dto.response.${ep.dtoPrefix}Response;`);
  }
  const imports = Array.from(importSet).sort().join("\n");

  // Generate @Value fields for adapter URLs
  const adapterUrlFields = adapterNames.map((a) => {
    const fieldName = toCamelCase(a) + "Url";
    return `    @Value("\${adapter.urls.${a}}")\n    private String ${fieldName};`;
  }).join("\n\n");

  // Generate init method to populate map
  const initLines = adapterNames.map((a) => {
    const fieldName = toCamelCase(a) + "Url";
    return `        adapterUrls.put("${a}", ${fieldName});`;
  }).join("\n");

  // Generate methods with proper HTTP handling
  const methods = endpoints.map((ep) => {
    const reqDto = ep.dtoPrefix + "Request";
    const respDto = ep.dtoPrefix + "Response";

    const params = ep.method === "GET"
      ? "String crReferenceId"
      : `String crReferenceId, ${reqDto} request`;

    let httpCall: string;
    switch (ep.method) {
      case "GET":
        httpCall = `ResponseEntity<${respDto}> response = restTemplate.getForEntity(url, ${respDto}.class);
        return response.getBody();`;
        break;
      case "PUT":
        httpCall = `restTemplate.put(url, request);
        return new ${respDto}(); // PUT returns void in RestTemplate; adapt as needed`;
        break;
      case "DELETE":
        httpCall = `restTemplate.delete(url);
        return new ${respDto}(); // DELETE returns void in RestTemplate; adapt as needed`;
        break;
      default: // POST
        httpCall = `ResponseEntity<${respDto}> response = restTemplate.postForEntity(url, request, ${respDto}.class);
        return response.getBody();`;
        break;
    }

    return `
    public ${respDto} ${ep.javaMethodName}(${params}) {
        String url = adapterUrls.get("${ep.adapterName}") + "${ep.path}";
        log.debug("Calling adapter: {} {}", "${ep.method}", url);
        ${httpCall}
    }`;
  }).join("\n");

  const content = `package ${basePackage}.adapter;

${imports}
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import jakarta.annotation.PostConstruct;
import java.util.HashMap;
import java.util.Map;

/**
 * Unified REST Adapter for ${domainId} — calls the legacy Adapter WAR endpoints.
 * Each method corresponds to one EJB operation exposed via the Adapter.
 */
@Component
@Slf4j
public class ${className} {

    private final RestTemplate restTemplate;
    private final Map<String, String> adapterUrls = new HashMap<>();

${adapterUrlFields}

    public ${className}(RestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    @PostConstruct
    public void init() {
${initLines}
    }
${methods}
}
`;
  await fs.writeFile(path.join(dir, `src/main/java/${pkgPath}/adapter/${className}.java`), content);
}

async function generateDtos(dir: string, pkgPath: string, basePackage: string, endpoints: ResolvedEndpoint[]): Promise<void> {
  // Generate ApiResponse wrapper
  const apiResponse = `package ${basePackage}.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ApiResponse<T> {
    private boolean success;
    private String message;
    private T data;
    private String errorCode;

    public static <T> ApiResponse<T> success(T data) {
        return ApiResponse.<T>builder()
                .success(true)
                .message("OK")
                .data(data)
                .build();
    }

    public static <T> ApiResponse<T> error(String message, String errorCode) {
        return ApiResponse.<T>builder()
                .success(false)
                .message(message)
                .errorCode(errorCode)
                .build();
    }
}
`;
  await fs.writeFile(path.join(dir, `src/main/java/${pkgPath}/dto/response/ApiResponse.java`), apiResponse);

  // Generate ApiRequest wrapper
  const apiRequest = `package ${basePackage}.dto.request;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ApiRequest<T> {
    private String crReferenceId;
    private T payload;
    private String requestId;
    private String timestamp;
}
`;
  await fs.writeFile(path.join(dir, `src/main/java/${pkgPath}/dto/request/ApiRequest.java`), apiRequest);

  // Generate unique Request/Response DTOs for each endpoint (no collisions)
  const generated = new Set<string>();
  for (const ep of endpoints) {
    const reqClassName = ep.dtoPrefix + "Request";
    const respClassName = ep.dtoPrefix + "Response";

    // Skip if already generated (shouldn't happen with proper dedup, but safety check)
    if (generated.has(reqClassName)) continue;
    generated.add(reqClassName);

    const reqFields = (ep.requestFields || []).map((f) => `    private ${mapJavaType(f.type)} ${f.name};`).join("\n");
    const respFields = (ep.responseFields || []).map((f) => `    private ${mapJavaType(f.type)} ${f.name};`).join("\n");

    // Only add @AllArgsConstructor if there are actual fields (avoids duplicate constructor)
    const reqAnnotations = reqFields
      ? `@Data\n@Builder\n@NoArgsConstructor\n@AllArgsConstructor`
      : `@Data\n@Builder\n@NoArgsConstructor`;
    const respAnnotations = respFields
      ? `@Data\n@Builder\n@NoArgsConstructor\n@AllArgsConstructor`
      : `@Data\n@Builder\n@NoArgsConstructor`;

    const reqImports = reqFields
      ? `import lombok.AllArgsConstructor;\nimport lombok.Builder;\nimport lombok.Data;\nimport lombok.NoArgsConstructor;`
      : `import lombok.Builder;\nimport lombok.Data;\nimport lombok.NoArgsConstructor;`;
    const respImports = respFields
      ? `import lombok.AllArgsConstructor;\nimport lombok.Builder;\nimport lombok.Data;\nimport lombok.NoArgsConstructor;`
      : `import lombok.Builder;\nimport lombok.Data;\nimport lombok.NoArgsConstructor;`;

    const reqContent = `package ${basePackage}.dto.request;

import jakarta.validation.constraints.NotNull;
${reqImports}

${reqAnnotations}
public class ${reqClassName} {
${reqFields || "    // Fields to be defined based on the adapter contract"}
}
`;

    const respContent = `package ${basePackage}.dto.response;

${respImports}

${respAnnotations}
public class ${respClassName} {
${respFields || "    // Fields to be defined based on the adapter contract"}
}
`;

    await fs.writeFile(path.join(dir, `src/main/java/${pkgPath}/dto/request/${reqClassName}.java`), reqContent);
    await fs.writeFile(path.join(dir, `src/main/java/${pkgPath}/dto/response/${respClassName}.java`), respContent);
  }
}

async function generateMapper(dir: string, pkgPath: string, basePackage: string): Promise<void> {
  const content = `package ${basePackage}.mapper;

/**
 * ACL Mapper — Anti-Corruption Layer
 * Maps between BIAN domain DTOs and Adapter REST DTOs.
 * Extend this class to add custom mapping logic.
 */
public class BianAclMapper {

    private BianAclMapper() {
        // Utility class
    }

    // Add mapping methods as needed for complex transformations
    // between BIAN canonical models and adapter-specific formats.
}
`;
  await fs.writeFile(path.join(dir, `src/main/java/${pkgPath}/mapper/BianAclMapper.java`), content);
}

async function generateDockerfile(dir: string, artifactId: string): Promise<void> {
  const content = `# Multi-stage Dockerfile for ${artifactId}
# Stage 1: Build
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline -B
COPY src ./src
RUN mvn clean package -DskipTests -B

# Stage 2: Runtime
FROM eclipse-temurin:17-jre-alpine
WORKDIR /app

# Create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=build /app/target/${artifactId}-1.0.0-SNAPSHOT.jar app.jar

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \\
  CMD wget --no-verbose --tries=1 --spider http://localhost:8081/actuator/health || exit 1

USER appuser

EXPOSE 8081

ENTRYPOINT ["java", "-XX:+UseContainerSupport", "-XX:MaxRAMPercentage=75.0", "-jar", "app.jar"]
`;
  await fs.writeFile(path.join(dir, "Dockerfile"), content);
}

async function generateOpenApiSpec(dir: string, serviceDomain: string, domainId: string, basePackage: string, endpoints: ResolvedEndpoint[]): Promise<void> {
  const paths: Record<string, any> = {};

  for (const ep of endpoints) {
    // Use the unique bianPathSegment to avoid collisions
    const bianPath = `/api/v1/${domainId}/{cr-reference-id}/${ep.actionTerm.toLowerCase()}/${ep.bianPathSegment}`;

    const operation: any = {
      summary: `${ep.actionTerm} ${ep.operation} (${ep.adapterName})`,
      operationId: ep.javaMethodName,
      tags: [serviceDomain],
      parameters: [
        { name: "cr-reference-id", in: "path", required: true, schema: { type: "string" } },
      ],
      responses: {
        "200": { description: "Success" },
        "400": { description: "Bad Request" },
        "500": { description: "Internal Server Error" },
      },
    };

    if (ep.method !== "GET") {
      operation.requestBody = {
        required: true,
        content: {
          "application/json": {
            schema: { "$ref": `#/components/schemas/${ep.dtoPrefix}Request` },
          },
        },
      };
    }

    paths[bianPath] = {
      [ep.method.toLowerCase()]: operation,
    };
  }

  const spec = {
    openapi: "3.0.3",
    info: {
      title: `${serviceDomain} — BIAN Wrapper API`,
      version: "1.0.0",
      description: `BIAN-compliant API for ${serviceDomain} Service Domain`,
    },
    servers: [{ url: "http://localhost:8081", description: "Local development" }],
    paths,
  };

  await fs.writeFile(path.join(dir, "src/main/resources/openapi.json"), JSON.stringify(spec, null, 2));
}

async function generateTests(dir: string, pkgPath: string, basePackage: string, serviceDomain: string, domainId: string): Promise<void> {
  const controllerTest = toPascalCase(domainId) + "ControllerTest";

  const content = `package ${basePackage};

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class ${controllerTest} {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void contextLoads() {
        // Verify Spring context loads successfully
    }

    @Test
    void actuatorHealthReturnsOk() throws Exception {
        mockMvc.perform(get("/actuator/health"))
                .andExpect(status().isOk());
    }
}
`;
  await fs.writeFile(path.join(dir, `src/test/java/${pkgPath}/${controllerTest}.java`), content);
}

// ─── Documentation Generators ─────────────────────────────────────────────────

async function generateBianReadme(dir: string, artifactId: string, serviceDomain: string, domainId: string, endpoints: Array<AdapterEndpoint & { adapterName: string }>): Promise<void> {
  const adapters = Array.from(new Set(endpoints.map((e) => e.adapterName)));

  const content = `# ${artifactId} — BIAN Wrapper Spring Boot

## Vue d'ensemble

Ce projet est un **wrapper Spring Boot** conforme aux standards BIAN (Banking Industry Architecture Network)
pour le Service Domain **${serviceDomain}**.

Il expose des APIs REST suivant la nomenclature BIAN et appelle en backend les Adapters WAR
deployes sur WebSphere.

## Statistiques

| Metrique | Valeur |
|----------|--------|
| Service Domain BIAN | ${serviceDomain} |
| Endpoints exposes | ${endpoints.length} |
| Adapters backend | ${adapters.length} (${adapters.join(", ")}) |
| Framework | Spring Boot 3.2 |
| Resilience | Resilience4j (Circuit Breaker, Retry, Bulkhead) |

## Architecture

\`\`\`
Client -> [Controller BIAN] -> [Service + Resilience4j] -> [RestAdapter] -> Adapter WAR (WebSphere)
\`\`\`

## Demarrage rapide

\`\`\`bash
# Compilation
mvn clean package

# Lancement
java -jar target/${artifactId}-1.0.0-SNAPSHOT.jar

# Swagger UI
open http://localhost:8081/swagger-ui.html
\`\`\`

## Configuration

Les URLs des Adapters backend sont configurees dans \`application.yml\` :
\`\`\`yaml
adapter:
  urls:
${adapters.map((a) => `    ${a}: http://websphere-host:9080/${a}/api`).join("\n")}
\`\`\`

## Documentation complementaire

- [DEVELOPER-GUIDE.md](DEVELOPER-GUIDE.md) — Guide detaille pour les developpeurs
- [DEPLOYMENT.md](DEPLOYMENT.md) — Guide de deploiement complet
- [ARCHITECTURE.md](ARCHITECTURE.md) — Architecture technique detaillee
`;
  await fs.writeFile(path.join(dir, "README.md"), content);
}

async function generateBianDeveloperGuide(dir: string, artifactId: string, serviceDomain: string, basePackage: string, endpoints: ResolvedEndpoint[], rawEndpoints: Array<AdapterEndpoint & { adapterName: string }>): Promise<void> {
  const content = `# Guide Developpeur — ${artifactId}

## Structure du projet

\`\`\`
src/main/java/${basePackage.replace(/\./g, "/")}/
├── controller/        # Controllers REST BIAN
├── service/           # Service layer avec Resilience4j
├── adapter/           # REST Adapter unifie (appels HTTP vers les Adapters WAR)
├── dto/
│   ├── request/       # DTOs de requete (prefixes par adapter pour eviter les collisions)
│   └── response/      # DTOs de reponse + ApiResponse<T>
├── mapper/            # ACL Mapper (Anti-Corruption Layer)
├── config/            # Configuration Spring (RestTemplate, Resilience4j)
└── Application.java   # Point d'entree Spring Boot
\`\`\`

## Comprendre le code genere

### 1. Controller BIAN

Le Controller expose les endpoints REST suivant la nomenclature BIAN :
- URL pattern : \`/api/v1/{service-domain}/{cr-reference-id}/{action-term}/{operation}\`
- Action Terms BIAN : Initiate, Retrieve, Update, Control, Execute, Evaluate

### 2. Service Layer

La couche Service applique les patterns de resilience via Resilience4j :
- **Circuit Breaker** : Coupe les appels si le taux d'erreur depasse 50%
- **Retry** : Reessaie 3 fois avec backoff exponentiel
- **Bulkhead** : Limite a 25 appels concurrents

### 3. REST Adapter (Unifie)

Un seul RestAdapter par wrapper gere tous les appels vers les Adapters WAR :
- Utilise \`RestTemplate\` de Spring
- URLs configurables via \`application.yml\`
- Methode HTTP correcte (GET/POST/PUT/DELETE) selon l'operation

### 4. DTOs

- **Nommage** : Prefixes par le nom de l'adapter pour eviter les collisions
  (ex: \`VirementSaveRequest\` au lieu de \`SaveRequest\`)
- **Request DTOs** : Valides avec Bean Validation
- **Response DTOs** : Wrappes dans \`ApiResponse<T>\`
- **ApiRequest<T>** : Enveloppe standard pour les requetes entrantes

### 5. ACL Mapper

L'Anti-Corruption Layer permet de transformer les modeles entre le domaine BIAN
et les formats specifiques des Adapters.

## Endpoints generes

| Operation | Method | BIAN Action | Adapter | DTO Prefix |
|-----------|--------|-------------|---------|------------|
${endpoints.map((ep) => `| ${ep.operation} | ${ep.method} | ${ep.actionTerm} | ${ep.adapterName} | ${ep.dtoPrefix} |`).join("\n")}

## Ajouter un endpoint

1. Ajouter la methode dans le Controller avec l'annotation BIAN appropriee
2. Creer les DTOs Request/Response dans \`dto/\` avec le prefixe adapter
3. Ajouter la methode dans le Service avec les annotations Resilience4j
4. Ajouter l'appel dans le RestAdapter
5. Mettre a jour le Mapper si une transformation est necessaire

## Tests

\`\`\`bash
# Lancer tous les tests
mvn test
\`\`\`

## Profils Spring

| Profil | Usage | Particularites |
|--------|-------|----------------|
| dev | Developpement local | Logs DEBUG, mocks possibles |
| staging | Pre-production | Adapters staging |
| prod | Production | Adapters production, monitoring |
`;
  await fs.writeFile(path.join(dir, "DEVELOPER-GUIDE.md"), content);
}

async function generateBianDeploymentGuide(dir: string, artifactId: string, serviceDomain: string): Promise<void> {
  const content = `# Guide de Deploiement — ${artifactId}

## Prerequis

| Composant | Version |
|-----------|---------|
| JDK | 17+ |
| Maven | 3.9+ |
| Docker | 24+ (optionnel) |
| Kubernetes | 1.28+ (optionnel) |

## Compilation

\`\`\`bash
mvn clean package -DskipTests
\`\`\`

## Deploiement local

### Option 1 : JAR direct

\`\`\`bash
export SPRING_PROFILES_ACTIVE=dev
java -jar target/${artifactId}-1.0.0-SNAPSHOT.jar

# Verification
curl http://localhost:8081/actuator/health
curl http://localhost:8081/swagger-ui.html
\`\`\`

### Option 2 : Docker

\`\`\`bash
docker build -t ${artifactId}:latest .
docker run -d --name ${artifactId} -p 8081:8081 -e SPRING_PROFILES_ACTIVE=dev ${artifactId}:latest
\`\`\`

### Option 3 : Docker Compose

\`\`\`yaml
version: '3.8'
services:
  ${artifactId}:
    build: .
    ports:
      - "8081:8081"
    environment:
      - SPRING_PROFILES_ACTIVE=dev
    healthcheck:
      test: ["CMD", "wget", "--spider", "http://localhost:8081/actuator/health"]
      interval: 30s
      timeout: 10s
      retries: 3
\`\`\`

## Deploiement Kubernetes

\`\`\`yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${artifactId}
spec:
  replicas: 2
  selector:
    matchLabels:
      app: ${artifactId}
  template:
    metadata:
      labels:
        app: ${artifactId}
    spec:
      containers:
        - name: ${artifactId}
          image: registry.bank.ma/${artifactId}:latest
          ports:
            - containerPort: 8081
          env:
            - name: SPRING_PROFILES_ACTIVE
              value: "prod"
          readinessProbe:
            httpGet:
              path: /actuator/health
              port: 8081
            initialDelaySeconds: 30
          livenessProbe:
            httpGet:
              path: /actuator/health
              port: 8081
            initialDelaySeconds: 60
          resources:
            requests:
              memory: "256Mi"
              cpu: "250m"
            limits:
              memory: "512Mi"
              cpu: "500m"
---
apiVersion: v1
kind: Service
metadata:
  name: ${artifactId}
spec:
  selector:
    app: ${artifactId}
  ports:
    - port: 8081
      targetPort: 8081
  type: ClusterIP
\`\`\`

## Variables d'environnement

| Variable | Description | Obligatoire |
|----------|-------------|-------------|
| SPRING_PROFILES_ACTIVE | Profil Spring (dev/staging/prod) | Oui |
| *_URL | URL de chaque Adapter WAR | Oui |

## Monitoring

- Actuator Health : \`/actuator/health\`
- Metrics : \`/actuator/metrics\`
- Circuit Breakers : \`/actuator/circuitbreakers\`
`;
  await fs.writeFile(path.join(dir, "DEPLOYMENT.md"), content);
}

async function generateBianArchitecture(dir: string, artifactId: string, serviceDomain: string, domainId: string): Promise<void> {
  const content = `# Architecture Technique — ${artifactId}

## Vue d'ensemble

\`\`\`
┌─────────────────────────────────────────────────────────────────┐
│                        API Gateway                               │
└─────────────────────┬───────────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────────┐
│              ${artifactId}                                       │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Controller BIAN                                          │   │
│  │  /api/v1/${domainId}/{cr-ref-id}/{action}/{operation}     │   │
│  └──────────────────────────┬───────────────────────────────┘   │
│                             │                                    │
│  ┌──────────────────────────▼───────────────────────────────┐   │
│  │  Service Layer                                            │   │
│  │  @CircuitBreaker @Retry @Bulkhead                         │   │
│  └──────────────────────────┬───────────────────────────────┘   │
│                             │                                    │
│  ┌──────────────────────────▼───────────────────────────────┐   │
│  │  REST Adapter (Unifie)                                    │   │
│  │  RestTemplate + URL mapping                               │   │
│  └──────────────────────────┬───────────────────────────────┘   │
└─────────────────────────────┼───────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────┐
│              WebSphere Application Server                         │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐       │
│  │ Adapter WAR 1 │  │ Adapter WAR 2 │  │ Adapter WAR N │       │
│  └───────┬───────┘  └───────┬───────┘  └───────┬───────┘       │
│          │                   │                   │               │
│  ┌───────▼───────────────────▼───────────────────▼───────┐      │
│  │              EJB Layer (Legacy)                         │      │
│  └────────────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────┘
\`\`\`

## Composants

| Composant | Responsabilite |
|-----------|---------------|
| Controller | Expose les endpoints BIAN, validation des requetes |
| Service | Logique metier, patterns de resilience |
| RestAdapter | Communication HTTP avec les Adapters WAR |
| DTOs | Modeles de donnees (prefixes par adapter) |
| ACL Mapper | Transformation entre modeles BIAN et adapter |

## Patterns de resilience

| Pattern | Configuration | Objectif |
|---------|--------------|----------|
| Circuit Breaker | 50% failure rate, 10 calls window | Proteger contre les pannes cascadees |
| Retry | 3 tentatives, backoff exponentiel | Gerer les erreurs transitoires |
| Bulkhead | 25 appels concurrents max | Isoler les ressources |

## Securite

- HTTPS obligatoire en production
- Authentification via API Gateway (JWT/OAuth2)
- Pas de credentials stockes dans le code
`;
  await fs.writeFile(path.join(dir, "ARCHITECTURE.md"), content);
}

// ─── Utility Functions ────────────────────────────────────────────────────────

function toPascalCase(str: string): string {
  return str
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\s+/g, "");
}

function toCamelCase(str: string): string {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase()
    .replace(/--+/g, "-");
}

function getSpringHttpAnnotation(method: string): string {
  switch (method) {
    case "GET": return "@GetMapping";
    case "PUT": return "@PutMapping";
    case "DELETE": return "@DeleteMapping";
    case "PATCH": return "@PatchMapping";
    default: return "@PostMapping";
  }
}

function mapJavaType(type: string): string {
  const typeMap: Record<string, string> = {
    string: "String",
    String: "String",
    int: "Integer",
    Integer: "Integer",
    long: "Long",
    Long: "Long",
    double: "Double",
    Double: "Double",
    boolean: "Boolean",
    Boolean: "Boolean",
    float: "Float",
    Float: "Float",
    date: "String",
    Date: "String",
  };
  return typeMap[type] || "String";
}

async function countFiles(dir: string): Promise<number> {
  let count = 0;
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile()) count++;
      else if (entry.isDirectory()) count += await countFiles(path.join(dir, entry.name));
    }
  } catch { /* ignore */ }
  return count;
}

/**
 * Package a directory as ZIP.
 */
export async function packageBianAsZip(sourceDir: string, outputZipPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(outputZipPath);
    const archive = new ZipArchive({ zlib: { level: 9 } });

    output.on("close", () => resolve(outputZipPath));
    archive.on("error", (err: Error) => reject(err));

    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}
