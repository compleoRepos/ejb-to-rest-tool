/**
 * BIAN Wrapper Generator v2
 * Generates production-ready Spring Boot projects that wrap Adapter REST endpoints
 * following BIAN (Banking Industry Architecture Network) standards.
 *
 * Key design decisions:
 * - DTOs namespaced per adapter to avoid collisions
 * - Keycloak OAuth2 Resource Server security (disabled in dev profile)
 * - Per-adapter Resilience4j instances (CircuitBreaker, Retry, Bulkhead, TimeLimiter, RateLimiter)
 * - RestTemplate.exchange() for proper PUT/DELETE response handling
 * - Interface-based RestAdapter (SOLID-D) with MockAdapter for testing
 * - GlobalExceptionHandler (@ControllerAdvice)
 * - CORS configuration via WebMvcConfigurer
 * - ACL Mapper with actual field mapping methods
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
  dtoPrefix: string;
  javaMethodName: string;
  actionTerm: string;
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

export function inferBianDomain(adapterName: string): { domain: string; domainId: string } {
  const lower = adapterName.toLowerCase();
  for (const rule of BIAN_DOMAIN_RULES) {
    if (rule.keywords.some((kw) => lower.includes(kw))) {
      return { domain: rule.domain, domainId: rule.domainId };
    }
  }
  return { domain: "Customer Management", domainId: "customer-management" };
}

// ─── BIAN Action Term Mapping ─────────────────────────────────────────────────

export function inferBianActionTerm(operation: string, method: string): string {
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
    const adapterPrefix = getAdapterPrefix(ep.adapterName);
    const operationPascal = toPascalCase(ep.operation);
    let baseDtoPrefix = adapterPrefix + operationPascal;
    const key = baseDtoPrefix.toLowerCase();
    const count = seen.get(key) || 0;
    seen.set(key, count + 1);
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

function getAdapterPrefix(adapterName: string): string {
  const parts = adapterName.split("-").filter((p) => p !== "bmcedirect" && p !== "bmce" && p.length > 2);
  if (parts.length === 0) return toPascalCase(adapterName.split("-")[0]);
  return toPascalCase(parts.slice(0, 2).join("-"));
}

// ─── Main Generation Function ─────────────────────────────────────────────────

export async function generateBianWrappers(options: BianGenerationOptions): Promise<BianGenerationResult> {
  const { projects, outputDir, groupId, basePackage } = options;
  const errors: string[] = [];
  const wrappers: BianWrapperInfo[] = [];

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

  for (const [domainId, group] of Array.from(domainGroups.entries())) {
    try {
      const wrapperDir = path.join(outputDir, `${domainId}-wrapper`);
      await fs.mkdir(wrapperDir, { recursive: true });

      const artifactId = `${domainId}-wrapper`;
      const pkg = `${basePackage}.${domainId.replace(/-/g, "")}`;
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

  return { success: errors.length === 0, wrappers, errors };
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

  const dirs = [
    `src/main/java/${pkgPath}/controller`,
    `src/main/java/${pkgPath}/service`,
    `src/main/java/${pkgPath}/adapter`,
    `src/main/java/${pkgPath}/dto/request`,
    `src/main/java/${pkgPath}/dto/response`,
    `src/main/java/${pkgPath}/mapper`,
    `src/main/java/${pkgPath}/config`,
    `src/main/java/${pkgPath}/exception`,
    `src/main/resources`,
    `src/test/java/${pkgPath}`,
    `docs`,
  ];

  for (const dir of dirs) {
    await fs.mkdir(path.join(outputDir, dir), { recursive: true });
  }

  // Core files
  await generatePom(outputDir, groupId, artifactId, basePackage);
  await generateApplication(outputDir, pkgPath, basePackage, artifactId);
  await generateApplicationYml(outputDir, artifactId, domainId, rawEndpoints, basePackage);
  await generateApplicationDevYml(outputDir);
  await generateApplicationProdYml(outputDir);

  // Config
  await generateResilienceConfig(outputDir, pkgPath, basePackage);
  await generateSecurityConfig(outputDir, pkgPath, basePackage);
  await generateCorsConfig(outputDir, pkgPath, basePackage);
  await generateGlobalExceptionHandler(outputDir, pkgPath, basePackage);

  // Business layers
  await generateController(outputDir, pkgPath, basePackage, serviceDomain, domainId, endpoints);
  await generateService(outputDir, pkgPath, basePackage, serviceDomain, domainId, endpoints);
  await generateRestAdapterInterface(outputDir, pkgPath, basePackage, domainId, endpoints);
  await generateRestAdapter(outputDir, pkgPath, basePackage, domainId, endpoints, rawEndpoints);
  await generateMockAdapter(outputDir, pkgPath, basePackage, domainId, endpoints);
  await generateDtos(outputDir, pkgPath, basePackage, endpoints);
  await generateMapper(outputDir, pkgPath, basePackage, endpoints);

  // Infrastructure
  await generateDockerfile(outputDir, artifactId);
  await generateOpenApiSpec(outputDir, serviceDomain, domainId, basePackage, endpoints);
  await generateTests(outputDir, pkgPath, basePackage, serviceDomain, domainId, endpoints);

  // Documentation
  await generateBianReadme(outputDir, artifactId, serviceDomain, domainId, rawEndpoints);
  await generateBianDeveloperGuide(outputDir, artifactId, serviceDomain, basePackage, endpoints, rawEndpoints);
  await generateBianDeploymentGuide(outputDir, artifactId, serviceDomain);
  await generateBianArchitecture(outputDir, artifactId, serviceDomain, domainId);
  await generatePostmanCollection(outputDir, artifactId, serviceDomain, domainId, endpoints, rawEndpoints);
  await generateMermaidDiagrams(outputDir, artifactId, serviceDomain, endpoints, rawEndpoints);
}

// ─── POM ─────────────────────────────────────────────────────────────────────

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

        <!-- Security: OAuth2 Resource Server (Keycloak) -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-security</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-oauth2-resource-server</artifactId>
        </dependency>

        <!-- Resilience4j (all modules) -->
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
        <dependency>
            <groupId>io.github.resilience4j</groupId>
            <artifactId>resilience4j-timelimiter</artifactId>
            <version>\${resilience4j.version}</version>
        </dependency>
        <dependency>
            <groupId>io.github.resilience4j</groupId>
            <artifactId>resilience4j-ratelimiter</artifactId>
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
        <dependency>
            <groupId>org.springframework.security</groupId>
            <artifactId>spring-security-test</artifactId>
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

// ─── Application Main Class ──────────────────────────────────────────────────

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

// ─── application.yml (main) ──────────────────────────────────────────────────

async function generateApplicationYml(dir: string, artifactId: string, domainId: string, endpoints: Array<AdapterEndpoint & { adapterName: string }>, basePackage: string): Promise<void> {
  const adapters = Array.from(new Set(endpoints.map((e) => e.adapterName)));
  const adapterUrls = adapters.map((a) => `    ${a}: \${${a.toUpperCase().replace(/-/g, "_")}_URL:http://localhost:8080/${a}/api}`).join("\n");

  // Per-adapter Resilience4j instances
  const cbInstances = adapters.map((a) => `      ${a}:
        registerHealthIndicator: true
        slidingWindowSize: 10
        minimumNumberOfCalls: 5
        permittedNumberOfCallsInHalfOpenState: 3
        automaticTransitionFromOpenToHalfOpenEnabled: true
        waitDurationInOpenState: 30s
        failureRateThreshold: 50
        eventConsumerBufferSize: 10`).join("\n");

  const retryInstances = adapters.map((a) => `      ${a}:
        maxAttempts: 3
        waitDuration: 1s
        enableExponentialBackoff: true
        exponentialBackoffMultiplier: 2
        retryExceptions:
          - org.springframework.web.client.ResourceAccessException
          - java.net.ConnectException`).join("\n");

  const bulkheadInstances = adapters.map((a) => `      ${a}:
        maxConcurrentCalls: 25
        maxWaitDuration: 500ms`).join("\n");

  const timeLimiterInstances = adapters.map((a) => `      ${a}:
        timeoutDuration: 5s
        cancelRunningFuture: true`).join("\n");

  const rateLimiterInstances = adapters.map((a) => `      ${a}:
        limitForPeriod: 100
        limitRefreshPeriod: 1s
        timeoutDuration: 0s`).join("\n");

  const content = `server:
  port: \${SERVER_PORT:8081}

spring:
  application:
    name: ${artifactId}
  profiles:
    active: \${SPRING_PROFILES_ACTIVE:dev}

# Adapter REST endpoints
adapter:
  urls:
${adapterUrls}

# Resilience4j Configuration (per-adapter instances)
resilience4j:
  circuitbreaker:
    instances:
${cbInstances}
  retry:
    instances:
${retryInstances}
  bulkhead:
    instances:
${bulkheadInstances}
  timelimiter:
    instances:
${timeLimiterInstances}
  ratelimiter:
    instances:
${rateLimiterInstances}

# Actuator
management:
  endpoints:
    web:
      exposure:
        include: health,info,metrics,circuitbreakers,ratelimiters
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

# Logging
logging:
  level:
    root: INFO
    ${basePackage}: DEBUG
    io.github.resilience4j: INFO
`;
  await fs.writeFile(path.join(dir, "src/main/resources/application.yml"), content);
}

// ─── application-dev.yml (no auth, debug logging) ────────────────────────────

async function generateApplicationDevYml(dir: string): Promise<void> {
  const content = `# Dev profile: no authentication, verbose logging
spring:
  security:
    enabled: false

# Disable OAuth2 in dev
app:
  security:
    enabled: false

logging:
  level:
    root: DEBUG
    org.springframework.security: DEBUG
`;
  await fs.writeFile(path.join(dir, "src/main/resources/application-dev.yml"), content);
}

// ─── application-prod.yml (Keycloak enabled) ─────────────────────────────────

async function generateApplicationProdYml(dir: string): Promise<void> {
  const content = `# Production profile: Keycloak OAuth2 Resource Server
spring:
  security:
    oauth2:
      resourceserver:
        jwt:
          issuer-uri: \${KEYCLOAK_ISSUER_URI:http://localhost:8180/realms/bank}
          jwk-set-uri: \${KEYCLOAK_JWK_SET_URI:http://localhost:8180/realms/bank/protocol/openid-connect/certs}

app:
  security:
    enabled: true
  cors:
    allowed-origins: \${CORS_ALLOWED_ORIGINS:http://localhost:3000}

logging:
  level:
    root: WARN
    org.springframework.security: INFO
`;
  await fs.writeFile(path.join(dir, "src/main/resources/application-prod.yml"), content);
}

// ─── ResilienceConfig (RestTemplate with timeouts) ───────────────────────────

async function generateResilienceConfig(dir: string, pkgPath: string, basePackage: string): Promise<void> {
  const content = `package ${basePackage}.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestTemplate;

/**
 * Configuration for RestTemplate with connection and read timeouts.
 */
@Configuration
public class ResilienceConfig {

    @Value("\${adapter.timeout.connect:5000}")
    private int connectTimeout;

    @Value("\${adapter.timeout.read:10000}")
    private int readTimeout;

    @Bean
    public RestTemplate restTemplate() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(connectTimeout);
        factory.setReadTimeout(readTimeout);
        return new RestTemplate(factory);
    }
}
`;
  await fs.writeFile(path.join(dir, `src/main/java/${pkgPath}/config/ResilienceConfig.java`), content);
}

// ─── SecurityConfig (Keycloak OAuth2 / dev = permitAll) ──────────────────────

async function generateSecurityConfig(dir: string, pkgPath: string, basePackage: string): Promise<void> {
  const content = `package ${basePackage}.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;

/**
 * Security configuration with Keycloak OAuth2 Resource Server.
 * - In dev profile (app.security.enabled=false): all endpoints are open.
 * - In prod/staging (app.security.enabled=true): JWT validation via Keycloak.
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Value("\${app.security.enabled:false}")
    private boolean securityEnabled;

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
            .csrf(csrf -> csrf.disable())
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS));

        if (securityEnabled) {
            http
                .authorizeHttpRequests(auth -> auth
                    .requestMatchers("/actuator/**", "/swagger-ui/**", "/v3/api-docs/**").permitAll()
                    .anyRequest().authenticated()
                )
                .oauth2ResourceServer(oauth2 -> oauth2.jwt(jwt -> {}));
        } else {
            // Dev mode: all endpoints open
            http.authorizeHttpRequests(auth -> auth.anyRequest().permitAll());
        }

        return http.build();
    }
}
`;
  await fs.writeFile(path.join(dir, `src/main/java/${pkgPath}/config/SecurityConfig.java`), content);
}

// ─── CORS Configuration ──────────────────────────────────────────────────────

async function generateCorsConfig(dir: string, pkgPath: string, basePackage: string): Promise<void> {
  const content = `package ${basePackage}.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * CORS configuration — allows cross-origin requests from configured origins.
 */
@Configuration
public class CorsConfig implements WebMvcConfigurer {

    @Value("\${app.cors.allowed-origins:*}")
    private String allowedOrigins;

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOrigins(allowedOrigins.split(","))
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                .allowedHeaders("*")
                .exposedHeaders("X-Request-Id")
                .allowCredentials(true)
                .maxAge(3600);
    }
}
`;
  await fs.writeFile(path.join(dir, `src/main/java/${pkgPath}/config/CorsConfig.java`), content);
}

// ─── GlobalExceptionHandler ──────────────────────────────────────────────────

async function generateGlobalExceptionHandler(dir: string, pkgPath: string, basePackage: string): Promise<void> {
  const content = `package ${basePackage}.exception;

import ${basePackage}.dto.response.ApiResponse;
import io.github.resilience4j.circuitbreaker.CallNotPermittedException;
import io.github.resilience4j.ratelimiter.RequestNotPermitted;
import jakarta.validation.ConstraintViolationException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.client.ResourceAccessException;

import java.util.concurrent.TimeoutException;

/**
 * Global exception handler — centralizes error responses for all controllers.
 */
@RestControllerAdvice
@Slf4j
public class GlobalExceptionHandler {

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponse<Void>> handleValidation(MethodArgumentNotValidException ex) {
        String message = ex.getBindingResult().getFieldErrors().stream()
                .map(e -> e.getField() + ": " + e.getDefaultMessage())
                .reduce((a, b) -> a + "; " + b)
                .orElse("Validation failed");
        log.warn("Validation error: {}", message);
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ApiResponse.error(message, "VALIDATION_ERROR"));
    }

    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<ApiResponse<Void>> handleConstraintViolation(ConstraintViolationException ex) {
        log.warn("Constraint violation: {}", ex.getMessage());
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ApiResponse.error(ex.getMessage(), "CONSTRAINT_VIOLATION"));
    }

    @ExceptionHandler(CallNotPermittedException.class)
    public ResponseEntity<ApiResponse<Void>> handleCircuitBreakerOpen(CallNotPermittedException ex) {
        log.error("Circuit breaker OPEN: {}", ex.getMessage());
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(ApiResponse.error("Service temporarily unavailable (circuit breaker open)", "CIRCUIT_BREAKER_OPEN"));
    }

    @ExceptionHandler(RequestNotPermitted.class)
    public ResponseEntity<ApiResponse<Void>> handleRateLimited(RequestNotPermitted ex) {
        log.warn("Rate limit exceeded: {}", ex.getMessage());
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                .body(ApiResponse.error("Rate limit exceeded, please retry later", "RATE_LIMITED"));
    }

    @ExceptionHandler(TimeoutException.class)
    public ResponseEntity<ApiResponse<Void>> handleTimeout(TimeoutException ex) {
        log.error("Timeout: {}", ex.getMessage());
        return ResponseEntity.status(HttpStatus.GATEWAY_TIMEOUT)
                .body(ApiResponse.error("Adapter call timed out", "TIMEOUT"));
    }

    @ExceptionHandler(ResourceAccessException.class)
    public ResponseEntity<ApiResponse<Void>> handleAdapterUnavailable(ResourceAccessException ex) {
        log.error("Adapter unreachable: {}", ex.getMessage());
        return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                .body(ApiResponse.error("Backend adapter is unreachable", "ADAPTER_UNAVAILABLE"));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> handleGeneric(Exception ex) {
        log.error("Unexpected error: ", ex);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ApiResponse.error("An unexpected error occurred", "INTERNAL_ERROR"));
    }
}
`;
  await fs.writeFile(path.join(dir, `src/main/java/${pkgPath}/exception/GlobalExceptionHandler.java`), content);
}

// ─── Controller ──────────────────────────────────────────────────────────────

async function generateController(dir: string, pkgPath: string, basePackage: string, serviceDomain: string, domainId: string, endpoints: ResolvedEndpoint[]): Promise<void> {
  const className = toPascalCase(domainId) + "Controller";
  const serviceName = toPascalCase(domainId) + "Service";
  const serviceVar = toCamelCase(domainId) + "Service";

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
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

/**
 * BIAN Controller for Service Domain: ${serviceDomain}
 * Exposes endpoints following BIAN naming conventions.
 */
@RestController
@RequestMapping("/api/v1/${domainId}")
@RequiredArgsConstructor
@Validated
@Tag(name = "${serviceDomain}", description = "BIAN ${serviceDomain} Service Domain")
@SecurityRequirement(name = "bearerAuth")
public class ${className} {

    private final ${serviceName} ${serviceVar};
${methods}
}
`;
  await fs.writeFile(path.join(dir, `src/main/java/${pkgPath}/controller/${className}.java`), content);
}

// ─── Service Layer (per-adapter Resilience4j instances) ──────────────────────

async function generateService(dir: string, pkgPath: string, basePackage: string, serviceDomain: string, domainId: string, endpoints: ResolvedEndpoint[]): Promise<void> {
  const className = toPascalCase(domainId) + "Service";
  const adapterInterfaceName = "I" + toPascalCase(domainId) + "RestAdapter";
  const adapterVar = toCamelCase(domainId) + "RestAdapter";

  const importSet = new Set<string>();
  for (const ep of endpoints) {
    importSet.add(`import ${basePackage}.dto.request.${ep.dtoPrefix}Request;`);
    importSet.add(`import ${basePackage}.dto.response.${ep.dtoPrefix}Response;`);
  }
  const imports = Array.from(importSet).sort().join("\n");

  const methods = endpoints.map((ep) => {
    const reqDto = ep.dtoPrefix + "Request";
    const respDto = ep.dtoPrefix + "Response";
    // Use per-adapter Resilience4j instance
    const resilienceInstance = ep.adapterName;

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
    @CircuitBreaker(name = "${resilienceInstance}", fallbackMethod = "${ep.javaMethodName}Fallback")
    @Retry(name = "${resilienceInstance}")
    @Bulkhead(name = "${resilienceInstance}")
    @TimeLimiter(name = "${resilienceInstance}")
    @RateLimiter(name = "${resilienceInstance}")
    public ${respDto} ${ep.javaMethodName}(${params}) {
        log.info("Executing ${ep.operation} on adapter ${ep.adapterName} for cr-reference-id={}", crReferenceId);
        return ${adapterCall};
    }

    private ${respDto} ${ep.javaMethodName}Fallback(${params}, Throwable t) {
        log.error("Fallback triggered for ${ep.javaMethodName} (adapter: ${ep.adapterName}): {}", t.getMessage());
        throw new RuntimeException("Service temporarily unavailable for ${ep.operation}: " + t.getMessage(), t);
    }`;
  }).join("\n");

  const content = `package ${basePackage}.service;

import ${basePackage}.adapter.${adapterInterfaceName};
${imports}
import io.github.resilience4j.bulkhead.annotation.Bulkhead;
import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import io.github.resilience4j.ratelimiter.annotation.RateLimiter;
import io.github.resilience4j.retry.annotation.Retry;
import io.github.resilience4j.timelimiter.annotation.TimeLimiter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * Service layer for BIAN ${serviceDomain}.
 * Applies Resilience4j patterns per adapter:
 * Circuit Breaker, Retry, Bulkhead, TimeLimiter, RateLimiter.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ${className} {

    private final ${adapterInterfaceName} ${adapterVar};
${methods}
}
`;
  await fs.writeFile(path.join(dir, `src/main/java/${pkgPath}/service/${className}.java`), content);
}

// ─── RestAdapter Interface (SOLID-D) ─────────────────────────────────────────

async function generateRestAdapterInterface(dir: string, pkgPath: string, basePackage: string, domainId: string, endpoints: ResolvedEndpoint[]): Promise<void> {
  const interfaceName = "I" + toPascalCase(domainId) + "RestAdapter";

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

    return `    ${respDto} ${ep.javaMethodName}(${params});`;
  }).join("\n\n");

  const content = `package ${basePackage}.adapter;

${imports}

/**
 * Interface for the ${domainId} REST Adapter.
 * Implementations: ${toPascalCase(domainId)}RestAdapter (real), Mock${toPascalCase(domainId)}Adapter (mock profile).
 */
public interface ${interfaceName} {

${methods}
}
`;
  await fs.writeFile(path.join(dir, `src/main/java/${pkgPath}/adapter/${interfaceName}.java`), content);
}

// ─── RestAdapter Implementation (exchange() for PUT/DELETE) ──────────────────

async function generateRestAdapter(dir: string, pkgPath: string, basePackage: string, domainId: string, endpoints: ResolvedEndpoint[], rawEndpoints: Array<AdapterEndpoint & { adapterName: string }>): Promise<void> {
  const className = toPascalCase(domainId) + "RestAdapter";
  const interfaceName = "I" + toPascalCase(domainId) + "RestAdapter";

  const adapterNames = Array.from(new Set(rawEndpoints.map((e) => e.adapterName)));

  const importSet = new Set<string>();
  for (const ep of endpoints) {
    importSet.add(`import ${basePackage}.dto.request.${ep.dtoPrefix}Request;`);
    importSet.add(`import ${basePackage}.dto.response.${ep.dtoPrefix}Response;`);
  }
  const imports = Array.from(importSet).sort().join("\n");

  const adapterUrlFields = adapterNames.map((a) => {
    const fieldName = toCamelCase(a) + "Url";
    return `    @Value("\${adapter.urls.${a}}")\n    private String ${fieldName};`;
  }).join("\n\n");

  const initLines = adapterNames.map((a) => {
    const fieldName = toCamelCase(a) + "Url";
    return `        adapterUrls.put("${a}", ${fieldName});`;
  }).join("\n");

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
        httpCall = `HttpEntity<${reqDto}> entity = new HttpEntity<>(request);
        ResponseEntity<${respDto}> response = restTemplate.exchange(url, HttpMethod.PUT, entity, ${respDto}.class);
        return response.getBody();`;
        break;
      case "DELETE":
        httpCall = `HttpEntity<Void> entity = new HttpEntity<>(null);
        ResponseEntity<${respDto}> response = restTemplate.exchange(url, HttpMethod.DELETE, entity, ${respDto}.class);
        return response.getBody();`;
        break;
      default: // POST
        httpCall = `ResponseEntity<${respDto}> response = restTemplate.postForEntity(url, request, ${respDto}.class);
        return response.getBody();`;
        break;
    }

    return `
    @Override
    public ${respDto} ${ep.javaMethodName}(${params}) {
        String url = adapterUrls.get("${ep.adapterName}") + "${ep.path}";
        log.debug("Calling adapter: {} {} (cr-reference-id={})", "${ep.method}", url, crReferenceId);
        ${httpCall}
    }`;
  }).join("\n");

  const content = `package ${basePackage}.adapter;

${imports}
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import jakarta.annotation.PostConstruct;
import java.util.HashMap;
import java.util.Map;

/**
 * Real REST Adapter for ${domainId} — calls the legacy Adapter WAR endpoints.
 * Active in all profiles except "mock".
 */
@Component
@Profile("!mock")
@Slf4j
public class ${className} implements ${interfaceName} {

    private final RestTemplate restTemplate;
    private final Map<String, String> adapterUrls = new HashMap<>();

${adapterUrlFields}

    public ${className}(RestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    @PostConstruct
    public void init() {
${initLines}
        log.info("${className} initialized with {} adapter URLs", adapterUrls.size());
    }
${methods}
}
`;
  await fs.writeFile(path.join(dir, `src/main/java/${pkgPath}/adapter/${className}.java`), content);
}

// ─── MockAdapter (for testing without backend) ───────────────────────────────

async function generateMockAdapter(dir: string, pkgPath: string, basePackage: string, domainId: string, endpoints: ResolvedEndpoint[]): Promise<void> {
  const className = "Mock" + toPascalCase(domainId) + "Adapter";
  const interfaceName = "I" + toPascalCase(domainId) + "RestAdapter";

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

    return `
    @Override
    public ${respDto} ${ep.javaMethodName}(${params}) {
        log.info("[MOCK] ${ep.javaMethodName} called with cr-reference-id={}", crReferenceId);
        return new ${respDto}();
    }`;
  }).join("\n");

  const content = `package ${basePackage}.adapter;

${imports}
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * Mock adapter for testing without the real backend.
 * Activated with: spring.profiles.active=mock
 */
@Component
@Profile("mock")
@Slf4j
public class ${className} implements ${interfaceName} {
${methods}
}
`;
  await fs.writeFile(path.join(dir, `src/main/java/${pkgPath}/adapter/${className}.java`), content);
}

// ─── DTOs ────────────────────────────────────────────────────────────────────

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

  // Generate unique Request/Response DTOs for each endpoint
  const generated = new Set<string>();
  for (const ep of endpoints) {
    const reqClassName = ep.dtoPrefix + "Request";
    const respClassName = ep.dtoPrefix + "Response";

    if (generated.has(reqClassName)) continue;
    generated.add(reqClassName);

    const hasReqFields = ep.requestFields && ep.requestFields.length > 0;
    const hasRespFields = ep.responseFields && ep.responseFields.length > 0;

    // Request DTO with @NotNull on required fields
    const reqFields = (ep.requestFields || []).map((f) => {
      const annotation = f.required ? "    @NotNull\n" : "";
      return `${annotation}    private ${mapJavaType(f.type)} ${f.name};`;
    }).join("\n");

    const respFields = (ep.responseFields || []).map((f) => `    private ${mapJavaType(f.type)} ${f.name};`).join("\n");

    const reqAnnotations = hasReqFields
      ? `@Data\n@Builder\n@NoArgsConstructor\n@AllArgsConstructor`
      : `@Data\n@Builder\n@NoArgsConstructor`;
    const respAnnotations = hasRespFields
      ? `@Data\n@Builder\n@NoArgsConstructor\n@AllArgsConstructor`
      : `@Data\n@Builder\n@NoArgsConstructor`;

    const hasRequired = (ep.requestFields || []).some((f) => f.required);

    const reqContent = `package ${basePackage}.dto.request;

${hasRequired ? "import jakarta.validation.constraints.NotNull;\n" : ""}import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
${hasReqFields ? "import lombok.AllArgsConstructor;\n" : ""}
${reqAnnotations}
public class ${reqClassName} {
${reqFields || "    // Fields to be defined based on the adapter contract"}
}
`;

    const respContent = `package ${basePackage}.dto.response;

import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
${hasRespFields ? "import lombok.AllArgsConstructor;\n" : ""}
${respAnnotations}
public class ${respClassName} {
${respFields || "    // Fields to be defined based on the adapter contract"}
}
`;

    await fs.writeFile(path.join(dir, `src/main/java/${pkgPath}/dto/request/${reqClassName}.java`), reqContent);
    await fs.writeFile(path.join(dir, `src/main/java/${pkgPath}/dto/response/${respClassName}.java`), respContent);
  }
}

// ─── ACL Mapper (actual mapping methods) ─────────────────────────────────────

async function generateMapper(dir: string, pkgPath: string, basePackage: string, endpoints: ResolvedEndpoint[]): Promise<void> {
  const mapperMethods = endpoints.map((ep) => {
    const reqDto = ep.dtoPrefix + "Request";
    const respDto = ep.dtoPrefix + "Response";

    const reqFieldMappings = (ep.requestFields || []).map((f) =>
      `        target.set${toPascalCase(f.name)}(source.get${toPascalCase(f.name)}());`
    ).join("\n");

    const respFieldMappings = (ep.responseFields || []).map((f) =>
      `        target.set${toPascalCase(f.name)}(source.get${toPascalCase(f.name)}());`
    ).join("\n");

    return `
    /**
     * Map BIAN request to adapter format for: ${ep.operation}
     */
    public static ${reqDto} mapToAdapter${ep.dtoPrefix}(${reqDto} source) {
        ${reqDto} target = new ${reqDto}();
${reqFieldMappings || "        // Direct pass-through (same DTO structure)"}
        return target;
    }

    /**
     * Map adapter response to BIAN format for: ${ep.operation}
     */
    public static ${respDto} mapFromAdapter${ep.dtoPrefix}(${respDto} source) {
        ${respDto} target = new ${respDto}();
${respFieldMappings || "        // Direct pass-through (same DTO structure)"}
        return target;
    }`;
  }).join("\n");

  const importSet = new Set<string>();
  for (const ep of endpoints) {
    importSet.add(`import ${basePackage}.dto.request.${ep.dtoPrefix}Request;`);
    importSet.add(`import ${basePackage}.dto.response.${ep.dtoPrefix}Response;`);
  }
  const imports = Array.from(importSet).sort().join("\n");

  const content = `package ${basePackage}.mapper;

${imports}

/**
 * ACL Mapper — Anti-Corruption Layer.
 * Maps between BIAN domain DTOs and Adapter REST DTOs.
 * Extend these methods when BIAN canonical model diverges from adapter format.
 */
public class BianAclMapper {

    private BianAclMapper() {
        // Utility class — static methods only
    }
${mapperMethods}
}
`;
  await fs.writeFile(path.join(dir, `src/main/java/${pkgPath}/mapper/BianAclMapper.java`), content);
}

// ─── Dockerfile ──────────────────────────────────────────────────────────────

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

// ─── OpenAPI Spec (with security schemes) ────────────────────────────────────

async function generateOpenApiSpec(dir: string, serviceDomain: string, domainId: string, basePackage: string, endpoints: ResolvedEndpoint[]): Promise<void> {
  const paths: Record<string, any> = {};

  for (const ep of endpoints) {
    const bianPath = `/api/v1/${domainId}/{cr-reference-id}/${ep.actionTerm.toLowerCase()}/${ep.bianPathSegment}`;

    const operation: any = {
      summary: `${ep.actionTerm} ${ep.operation} (${ep.adapterName})`,
      operationId: ep.javaMethodName,
      tags: [serviceDomain],
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: "cr-reference-id", in: "path", required: true, schema: { type: "string" }, description: "Control Record Reference ID" },
      ],
      responses: {
        "200": {
          description: "Success",
          content: { "application/json": { schema: { "$ref": `#/components/schemas/ApiResponse_${ep.dtoPrefix}Response` } } },
        },
        "400": { description: "Bad Request — validation error" },
        "401": { description: "Unauthorized — missing or invalid JWT" },
        "429": { description: "Too Many Requests — rate limit exceeded" },
        "503": { description: "Service Unavailable — circuit breaker open" },
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

    paths[bianPath] = { [ep.method.toLowerCase()]: operation };
  }

  const spec = {
    openapi: "3.0.3",
    info: {
      title: `${serviceDomain} — BIAN Wrapper API`,
      version: "1.0.0",
      description: `BIAN-compliant API for ${serviceDomain} Service Domain.\n\nSecurity: OAuth2 JWT via Keycloak (disabled in dev profile).`,
    },
    servers: [
      { url: "http://localhost:8081", description: "Local development" },
      { url: "https://{environment}.bank.ma", description: "Deployed environment" },
    ],
    security: [{ bearerAuth: [] }],
    paths,
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Keycloak JWT token. In dev profile, authentication is disabled.",
        },
      },
    },
  };

  await fs.writeFile(path.join(dir, "src/main/resources/openapi.json"), JSON.stringify(spec, null, 2));
}

// ─── Tests (with @ActiveProfiles("dev") + endpoint test) ─────────────────────

async function generateTests(dir: string, pkgPath: string, basePackage: string, serviceDomain: string, domainId: string, endpoints: ResolvedEndpoint[]): Promise<void> {
  const controllerTest = toPascalCase(domainId) + "ControllerTest";
  const firstEp = endpoints[0];
  const bianPath = firstEp ? `/api/v1/${domainId}/test-ref/${firstEp.actionTerm.toLowerCase()}/${firstEp.bianPathSegment}` : `/api/v1/${domainId}/test-ref/retrieve/test`;

  const content = `package ${basePackage};

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;

/**
 * Integration tests for ${serviceDomain} Controller.
 * Uses "dev" profile to disable security and "mock" profile for adapter mocking.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles({"dev", "mock"})
class ${controllerTest} {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void contextLoads() {
        // Verify Spring context loads successfully with all beans
    }

    @Test
    void actuatorHealthReturnsOk() throws Exception {
        mockMvc.perform(get("/actuator/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"));
    }

    @Test
    void swaggerUiIsAccessible() throws Exception {
        mockMvc.perform(get("/swagger-ui/index.html"))
                .andExpect(status().isOk());
    }

    @Test
    void firstEndpointReturnsOk() throws Exception {
        mockMvc.perform(get("${bianPath}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));
    }
}
`;
  await fs.writeFile(path.join(dir, `src/test/java/${pkgPath}/${controllerTest}.java`), content);
}

// ─── Documentation: README ───────────────────────────────────────────────────

async function generateBianReadme(dir: string, artifactId: string, serviceDomain: string, domainId: string, endpoints: Array<AdapterEndpoint & { adapterName: string }>): Promise<void> {
  const adapters = Array.from(new Set(endpoints.map((e) => e.adapterName)));

  const content = `# ${artifactId} — BIAN Wrapper Spring Boot

## Overview

This is a **BIAN-compliant** Spring Boot wrapper for the **${serviceDomain}** Service Domain.
It acts as a resilient pass-through that consumes legacy Adapter REST endpoints and exposes them
following BIAN naming conventions.

## Architecture

\`\`\`
Client → [SecurityFilter] → Controller → Service → [Resilience4j] → RestAdapter → Adapter WAR
\`\`\`

## Key Features

- **BIAN Compliance**: URL paths and action terms follow BIAN standards
- **Keycloak Security**: OAuth2 Resource Server with JWT (disabled in dev)
- **Resilience4j**: Per-adapter Circuit Breaker, Retry, Bulkhead, TimeLimiter, RateLimiter
- **Interface-based Adapter**: SOLID-D with MockAdapter for testing
- **ACL Mapper**: Anti-Corruption Layer for DTO transformation
- **Global Exception Handler**: Centralized error responses
- **OpenAPI/Swagger**: Full API documentation with security schemes
- **Docker-ready**: Multi-stage Dockerfile with health checks

## Profiles

| Profile | Security | Adapter | Use Case |
|---------|----------|---------|----------|
| dev | Disabled | Real | Local development |
| mock | Disabled | Mock | Unit/integration testing |
| staging | Keycloak | Real | Pre-production |
| prod | Keycloak | Real | Production |

## Quick Start

\`\`\`bash
# Dev mode (no auth)
mvn spring-boot:run -Dspring-boot.run.profiles=dev

# With mock adapter
mvn spring-boot:run -Dspring-boot.run.profiles=dev,mock

# Production (requires Keycloak)
KEYCLOAK_ISSUER_URI=https://keycloak.bank.ma/realms/bank \\
mvn spring-boot:run -Dspring-boot.run.profiles=prod
\`\`\`

## Adapters Consumed

${adapters.map((a) => `- \`${a}\` — ${endpoints.filter((e) => e.adapterName === a).length} endpoint(s)`).join("\n")}

## Endpoints

| Method | BIAN Path | Operation | Adapter |
|--------|-----------|-----------|---------|
${endpoints.map((e) => `| ${e.method} | /api/v1/${domainId}/{cr-reference-id}/... | ${e.operation} | ${e.adapterName} |`).join("\n")}

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| SERVER_PORT | 8081 | Server port |
| SPRING_PROFILES_ACTIVE | dev | Active profile |
| KEYCLOAK_ISSUER_URI | http://localhost:8180/realms/bank | Keycloak issuer |
| KEYCLOAK_JWK_SET_URI | (derived from issuer) | JWK Set URI |
| CORS_ALLOWED_ORIGINS | * | Allowed CORS origins |
${adapters.map((a) => `| ${a.toUpperCase().replace(/-/g, "_")}_URL | http://localhost:8080/${a}/api | ${a} adapter URL |`).join("\n")}
`;
  await fs.writeFile(path.join(dir, "README.md"), content);
}

// ─── Documentation: Developer Guide ─────────────────────────────────────────

async function generateBianDeveloperGuide(dir: string, artifactId: string, serviceDomain: string, basePackage: string, endpoints: ResolvedEndpoint[], rawEndpoints: Array<AdapterEndpoint & { adapterName: string }>): Promise<void> {
  const adapters = Array.from(new Set(rawEndpoints.map((e) => e.adapterName)));
  const pkgPath = basePackage.replace(/\./g, "/");

  const content = `# Developer Guide — ${artifactId}

## Project Structure

\`\`\`
src/main/java/${pkgPath}/
├── config/
│   ├── ResilienceConfig.java      # RestTemplate with timeouts
│   ├── SecurityConfig.java        # Keycloak OAuth2 / dev permitAll
│   └── CorsConfig.java            # CORS configuration
├── controller/
│   └── ${toPascalCase(domainId(artifactId))}Controller.java
├── service/
│   └── ${toPascalCase(domainId(artifactId))}Service.java       # Resilience4j annotations
├── adapter/
│   ├── I${toPascalCase(domainId(artifactId))}RestAdapter.java  # Interface (SOLID-D)
│   ├── ${toPascalCase(domainId(artifactId))}RestAdapter.java   # Real implementation
│   └── Mock${toPascalCase(domainId(artifactId))}Adapter.java   # Mock (@Profile("mock"))
├── dto/
│   ├── request/                   # Request DTOs with @NotNull validation
│   └── response/                  # Response DTOs + ApiResponse<T>
├── mapper/
│   └── BianAclMapper.java         # ACL field mapping
└── exception/
    └── GlobalExceptionHandler.java # @ControllerAdvice
\`\`\`

## Adding a New Endpoint

1. Add the endpoint definition to the adapter configuration
2. Create Request/Response DTOs in \`dto/\`
3. Add method to \`I${toPascalCase(domainId(artifactId))}RestAdapter\` interface
4. Implement in \`${toPascalCase(domainId(artifactId))}RestAdapter\` (real) and \`Mock${toPascalCase(domainId(artifactId))}Adapter\` (mock)
5. Add service method with Resilience4j annotations
6. Add controller endpoint with BIAN path

## Security Configuration

The security is controlled by the \`app.security.enabled\` property:

- **false** (default in dev): All endpoints are open, no JWT validation
- **true** (prod/staging): Keycloak JWT validation required

To test with security locally:
\`\`\`bash
# Start Keycloak
docker run -p 8180:8080 -e KEYCLOAK_ADMIN=admin -e KEYCLOAK_ADMIN_PASSWORD=admin quay.io/keycloak/keycloak:23.0.0 start-dev

# Run with prod profile
mvn spring-boot:run -Dspring-boot.run.profiles=prod
\`\`\`

## Resilience4j Configuration

Each adapter has its own Resilience4j instance with:
- **Circuit Breaker**: Opens after 50% failure rate (window of 10 calls)
- **Retry**: 3 attempts with exponential backoff (1s, 2s, 4s)
- **Bulkhead**: Max 25 concurrent calls
- **TimeLimiter**: 5s timeout per call
- **RateLimiter**: 100 calls/second

Monitor via Actuator: \`GET /actuator/circuitbreakers\`

## Testing

\`\`\`bash
# Run all tests (uses dev + mock profiles)
mvn test

# Run with coverage
mvn test jacoco:report
\`\`\`
`;
  await fs.writeFile(path.join(dir, "docs/DEVELOPER_GUIDE.md"), content);
}

// Helper to extract domainId from artifactId
function domainId(artifactId: string): string {
  return artifactId.replace("-wrapper", "");
}

// ─── Documentation: Deployment Guide ─────────────────────────────────────────

async function generateBianDeploymentGuide(dir: string, artifactId: string, serviceDomain: string): Promise<void> {
  const content = `# Deployment Guide — ${artifactId}

## Prerequisites

- Java 17+
- Maven 3.9+
- Docker (for containerized deployment)
- Keycloak instance (for prod/staging)

## Build

\`\`\`bash
mvn clean package -DskipTests
\`\`\`

## Docker Build & Run

\`\`\`bash
docker build -t ${artifactId}:latest .

docker run -d \\
  --name ${artifactId} \\
  -p 8081:8081 \\
  -e SPRING_PROFILES_ACTIVE=prod \\
  -e KEYCLOAK_ISSUER_URI=https://keycloak.bank.ma/realms/bank \\
  -e CORS_ALLOWED_ORIGINS=https://portal.bank.ma \\
  ${artifactId}:latest
\`\`\`

## Kubernetes Deployment

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
        - name: KEYCLOAK_ISSUER_URI
          valueFrom:
            configMapKeyRef:
              name: ${artifactId}-config
              key: keycloak-issuer-uri
        livenessProbe:
          httpGet:
            path: /actuator/health/liveness
            port: 8081
          initialDelaySeconds: 30
        readinessProbe:
          httpGet:
            path: /actuator/health/readiness
            port: 8081
          initialDelaySeconds: 10
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
\`\`\`

## Health Checks

- Liveness: \`GET /actuator/health/liveness\`
- Readiness: \`GET /actuator/health/readiness\`
- Full health: \`GET /actuator/health\`
- Metrics: \`GET /actuator/metrics\`
- Circuit Breakers: \`GET /actuator/circuitbreakers\`
- Rate Limiters: \`GET /actuator/ratelimiters\`

## Monitoring

Expose Actuator metrics to Prometheus:
\`\`\`yaml
management:
  endpoints:
    web:
      exposure:
        include: health,info,metrics,prometheus
\`\`\`
`;
  await fs.writeFile(path.join(dir, "docs/DEPLOYMENT_GUIDE.md"), content);
}

// ─── Documentation: Architecture ─────────────────────────────────────────────

async function generateBianArchitecture(dir: string, artifactId: string, serviceDomain: string, domainId: string): Promise<void> {
  const content = `# Architecture — ${artifactId}

## Overview

This wrapper implements the **Facade** pattern over legacy Adapter WAR endpoints,
exposing them as a BIAN-compliant REST API with enterprise-grade resilience and security.

## Layers

\`\`\`
┌─────────────────────────────────────────────────────────────┐
│                    API Consumer (Client)                      │
└─────────────────────┬───────────────────────────────────────┘
                      │ HTTPS + JWT (Keycloak)
┌─────────────────────▼───────────────────────────────────────┐
│              SecurityFilterChain (OAuth2 RS)                  │
│              CorsConfig (WebMvcConfigurer)                    │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│              Controller (@Validated, BIAN paths)              │
│              GlobalExceptionHandler (@ControllerAdvice)       │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│              Service Layer                                    │
│              @CircuitBreaker @Retry @Bulkhead                 │
│              @TimeLimiter @RateLimiter                        │
│              (per-adapter instances)                          │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│              IRestAdapter (Interface)                         │
│              ├── RestAdapter (@Profile("!mock"))              │
│              │   └── RestTemplate.exchange()                  │
│              └── MockAdapter (@Profile("mock"))               │
└─────────────────────┬───────────────────────────────────────┘
                      │ HTTP (RestTemplate)
┌─────────────────────▼───────────────────────────────────────┐
│              Legacy Adapter WAR (WebSphere/WildFly)           │
│              JAX-RS endpoints → EJB layer                     │
└─────────────────────────────────────────────────────────────┘
\`\`\`

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| Per-adapter Resilience4j | One failing adapter doesn't cascade to others |
| Interface-based adapter | Testability (MockAdapter) + SOLID-D |
| Keycloak by profile | Dev is free, prod is secured — no code change |
| RestTemplate.exchange() | Proper response body for PUT/DELETE |
| GlobalExceptionHandler | Consistent error format across all endpoints |
| ACL Mapper | Decouples BIAN model from adapter model |

## BIAN Compliance

- URL pattern: \`/api/v1/{domain-id}/{cr-reference-id}/{action-term}/{operation}\`
- Action terms: Retrieve, Initiate, Update, Control, Evaluate, Execute
- Response envelope: \`ApiResponse<T>\` with success/error/data/errorCode
`;
  await fs.writeFile(path.join(dir, "docs/ARCHITECTURE.md"), content);
}

// ─── Postman Collection (with auth + tests) ──────────────────────────────────

async function generatePostmanCollection(
  dir: string,
  artifactId: string,
  serviceDomain: string,
  domainId: string,
  endpoints: ResolvedEndpoint[],
  rawEndpoints: Array<AdapterEndpoint & { adapterName: string }>
): Promise<void> {
  const baseUrl = `{{base_url}}`;
  const items = endpoints.map((ep) => {
    const httpMethod = ep.method.toUpperCase();
    const bianPath = `/api/v1/${domainId}/{{cr_reference_id}}/${ep.actionTerm.toLowerCase()}/${ep.bianPathSegment}`;

    const requestBody: any = {};
    if (httpMethod === "POST" || httpMethod === "PUT") {
      const bodyFields: Record<string, string> = {};
      for (const f of ep.requestFields) {
        bodyFields[f.name] = `{{${f.name}}}`;
      }
      requestBody.mode = "raw";
      requestBody.raw = JSON.stringify(bodyFields, null, 2);
      requestBody.options = { raw: { language: "json" } };
    }

    // Postman test script
    const testScript = `pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});
pm.test("Response has success=true", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.success).to.eql(true);
});
pm.test("Response time < 5000ms", function () {
    pm.expect(pm.response.responseTime).to.be.below(5000);
});`;

    return {
      name: `${ep.actionTerm} ${ep.operation} (${ep.adapterName})`,
      request: {
        method: httpMethod,
        header: [
          { key: "Content-Type", value: "application/json" },
          { key: "Accept", value: "application/json" },
          { key: "Authorization", value: "Bearer {{access_token}}" },
        ],
        url: {
          raw: `${baseUrl}${bianPath}`,
          host: [baseUrl],
          path: bianPath.split("/").filter(Boolean),
        },
        ...(httpMethod === "POST" || httpMethod === "PUT" ? { body: requestBody } : {}),
      },
      event: [
        {
          listen: "test",
          script: { type: "text/javascript", exec: testScript.split("\n") },
        },
      ],
      response: [],
    };
  });

  const collection = {
    info: {
      name: `${serviceDomain} — ${artifactId}`,
      description: `Collection Postman pour le wrapper BIAN ${serviceDomain}.\n\nSecurity: Bearer JWT (Keycloak). En dev, l'authentification est désactivée.`,
      schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    variable: [
      { key: "base_url", value: "http://localhost:8081" },
      { key: "cr_reference_id", value: "REF-001" },
      { key: "access_token", value: "" },
      { key: "keycloak_url", value: "http://localhost:8180" },
      { key: "realm", value: "bank" },
      { key: "client_id", value: artifactId },
    ],
    auth: {
      type: "bearer",
      bearer: [{ key: "token", value: "{{access_token}}" }],
    },
    event: [
      {
        listen: "prerequest",
        script: {
          type: "text/javascript",
          exec: [
            "// Auto-fetch Keycloak token if empty",
            "if (!pm.variables.get('access_token')) {",
            "    console.log('No token set. In dev mode, auth is disabled.');",
            "}",
          ],
        },
      },
    ],
    item: items,
  };

  await fs.writeFile(
    path.join(dir, "docs", `${artifactId}-postman-collection.json`),
    JSON.stringify(collection, null, 2)
  );
}

// ─── Mermaid Sequence Diagrams ───────────────────────────────────────────────

async function generateMermaidDiagrams(
  dir: string,
  artifactId: string,
  serviceDomain: string,
  endpoints: ResolvedEndpoint[],
  rawEndpoints: Array<AdapterEndpoint & { adapterName: string }>
): Promise<void> {
  const docsDir = path.join(dir, "docs");
  const domId = domainId(artifactId);

  // Generate one diagram per endpoint
  for (const ep of endpoints) {
    const bianPath = `/api/v1/${domId}/{cr-reference-id}/${ep.actionTerm.toLowerCase()}/${ep.bianPathSegment}`;
    const httpMethod = ep.method.toUpperCase();

    const diagram = `sequenceDiagram
    participant Client
    participant Security as SecurityFilter
    participant Controller as ${toPascalCase(domId)}Controller
    participant Service as ${toPascalCase(domId)}Service
    participant Resilience as Resilience4j
    participant Adapter as ${toPascalCase(domId)}RestAdapter
    participant Backend as Adapter ${ep.adapterName}

    Client->>+Security: ${httpMethod} ${bianPath}
    Note over Security: JWT validation (prod)<br/>or permitAll (dev)
    Security->>+Controller: Authenticated request
    Controller->>Controller: @Valid request body
    Controller->>+Service: ${ep.javaMethodName}(crReferenceId, request)
    Service->>+Resilience: Apply patterns
    Note over Resilience: CircuitBreaker(${ep.adapterName})<br/>Retry(3x, exp backoff)<br/>Bulkhead(25 concurrent)<br/>TimeLimiter(5s)<br/>RateLimiter(100/s)
    Resilience->>+Adapter: ${ep.javaMethodName}(crReferenceId, request)
    Adapter->>+Backend: ${httpMethod} ${ep.path}
    Backend-->>-Adapter: Response JSON
    Adapter-->>-Resilience: ${ep.dtoPrefix}Response
    Resilience-->>-Service: Response
    Service-->>-Controller: ${ep.dtoPrefix}Response
    Controller-->>-Client: HTTP ${httpMethod === "POST" ? "201" : "200"} ApiResponse<T>
`;

    const fileName = `sequence-${ep.adapterName}-${ep.javaMethodName}.mmd`;
    await fs.writeFile(path.join(docsDir, fileName), diagram);
  }

  // Generate overview diagram
  const adapterNames = Array.from(new Set(endpoints.map((e) => e.adapterName)));
  const overviewDiagram = `sequenceDiagram
    participant Client as API Consumer
    participant Security as Keycloak JWT
    participant Gateway as ${toPascalCase(domId)} Wrapper
    ${adapterNames.map((a) => `participant ${toPascalCase(a)} as Adapter ${a}`).join("\n    ")}

    Note over Client,${toPascalCase(adapterNames[adapterNames.length - 1]) || "Gateway"}: ${serviceDomain} — Vue d'ensemble

    ${endpoints.slice(0, 8).map((ep) => `Client->>Security: ${ep.method.toUpperCase()} /api/v1/${domId}/{cr-ref-id}/${ep.actionTerm.toLowerCase()}/${ep.bianPathSegment}
    Security->>Gateway: Validated JWT
    Gateway->>${toPascalCase(ep.adapterName)}: ${ep.method.toUpperCase()} ${ep.path}`).join("\n    ")}
`;

  await fs.writeFile(path.join(docsDir, `overview-${artifactId}.mmd`), overviewDiagram);
}

// ─── Utility Functions ────────────────────────────────────────────────────────

export function toPascalCase(str: string): string {
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
