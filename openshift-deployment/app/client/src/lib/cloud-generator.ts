/**
 * Java Legacy Modernizer Platform — Générateur Cloud-Native.
 * Génère les artefacts d'infrastructure pour le déploiement cloud :
 * - Dockerfile multi-stage optimisé
 * - Kubernetes manifests (Deployment, Service, ConfigMap, HPA)
 * - Helm Chart complet
 * - API Gateway configuration (Spring Cloud Gateway)
 * - OAuth2/Security configuration
 * - Observability (Prometheus, Grafana, ELK)
 * - Docker Compose pour le développement local
 *
 * @author Compleo
 * @version 2.0.0
 */

import type { MicroserviceProposal, MicroserviceExtractionResult } from "./microservice-extractor";

// ============================================================
// Types
// ============================================================

export interface CloudFile {
  fileName: string;
  path: string;
  content: string;
  type: "docker" | "kubernetes" | "helm" | "gateway" | "security" | "observability" | "compose" | "ci";
  description: string;
}

export interface CloudGenerationResult {
  files: CloudFile[];
  summary: CloudSummary;
}

export interface CloudSummary {
  totalFiles: number;
  dockerfiles: number;
  kubernetesManifests: number;
  helmCharts: number;
  securityConfigs: number;
  observabilityConfigs: number;
}

// ============================================================
// Main Generation Function
// ============================================================

export function generateCloudNativeInfra(
  extraction: MicroserviceExtractionResult,
  namespace: string = "bank-modernized"
): CloudGenerationResult {
  const files: CloudFile[] = [];

  // 1. Dockerfile per microservice
  for (const ms of extraction.proposals) {
    files.push(generateDockerfile(ms));
    files.push(generateDockerignore(ms));
  }

  // 2. Kubernetes manifests per microservice
  for (const ms of extraction.proposals) {
    files.push(...generateK8sManifests(ms, namespace));
  }

  // 3. Helm Chart
  files.push(...generateHelmChart(extraction.proposals, namespace));

  // 4. API Gateway
  files.push(generateApiGateway(extraction.proposals, namespace));
  files.push(generateApiGatewayK8s(namespace));

  // 5. OAuth2 Security
  files.push(generateSecurityConfig(extraction.proposals));

  // 6. Observability
  files.push(...generateObservability(extraction.proposals, namespace));

  // 7. Docker Compose for local dev
  files.push(generateDockerCompose(extraction.proposals));

  // 8. CI/CD Pipeline
  files.push(generateGitHubActions(extraction.proposals));

  const summary: CloudSummary = {
    totalFiles: files.length,
    dockerfiles: files.filter(f => f.type === "docker").length,
    kubernetesManifests: files.filter(f => f.type === "kubernetes").length,
    helmCharts: files.filter(f => f.type === "helm").length,
    securityConfigs: files.filter(f => f.type === "security").length,
    observabilityConfigs: files.filter(f => f.type === "observability").length,
  };

  return { files, summary };
}

// ============================================================
// Dockerfile
// ============================================================

function generateDockerfile(ms: MicroserviceProposal): CloudFile {
  const svcName = kebabCase(ms.name);

  let content = `# =============================================================\n`;
  content += `# Dockerfile - ${ms.name}\n`;
  content += `# Multi-stage build optimise pour Spring Boot 3\n`;
  content += `# @author Compleo\n`;
  content += `# =============================================================\n\n`;
  content += `# Stage 1: Build\n`;
  content += `FROM eclipse-temurin:21-jdk-alpine AS builder\n`;
  content += `WORKDIR /app\n\n`;
  content += `# Cache Maven dependencies\n`;
  content += `COPY pom.xml .\n`;
  content += `RUN --mount=type=cache,target=/root/.m2 \\\n`;
  content += `    mvn dependency:go-offline -B\n\n`;
  content += `# Copy source and build\n`;
  content += `COPY src ./src\n`;
  content += `RUN --mount=type=cache,target=/root/.m2 \\\n`;
  content += `    mvn package -DskipTests -B\n\n`;
  content += `# Extract layered JAR\n`;
  content += `RUN java -Djarmode=layertools -jar target/*.jar extract --destination /extracted\n\n`;
  content += `# Stage 2: Runtime\n`;
  content += `FROM eclipse-temurin:21-jre-alpine\n`;
  content += `WORKDIR /app\n\n`;
  content += `# Security: non-root user\n`;
  content += `RUN addgroup -S spring && adduser -S spring -G spring\n`;
  content += `USER spring:spring\n\n`;
  content += `# Copy layered JAR\n`;
  content += `COPY --from=builder /extracted/dependencies/ ./\n`;
  content += `COPY --from=builder /extracted/spring-boot-loader/ ./\n`;
  content += `COPY --from=builder /extracted/snapshot-dependencies/ ./\n`;
  content += `COPY --from=builder /extracted/application/ ./\n\n`;
  content += `# Health check\n`;
  content += `HEALTHCHECK --interval=30s --timeout=3s --retries=3 \\\n`;
  content += `    CMD wget -qO- http://localhost:8080/actuator/health || exit 1\n\n`;
  content += `# JVM tuning for containers\n`;
  content += `ENV JAVA_OPTS="-XX:+UseContainerSupport -XX:MaxRAMPercentage=75.0 -XX:+UseG1GC"\n\n`;
  content += `EXPOSE 8080\n`;
  content += `ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS org.springframework.boot.loader.launch.JarLauncher"]\n`;

  return {
    fileName: "Dockerfile",
    path: `${svcName}/Dockerfile`,
    content,
    type: "docker",
    description: `Dockerfile multi-stage pour ${ms.name}`,
  };
}

function generateDockerignore(ms: MicroserviceProposal): CloudFile {
  const svcName = kebabCase(ms.name);
  let content = `.git\n`;
  content += `.gitignore\n`;
  content += `target/\n`;
  content += `*.md\n`;
  content += `.idea/\n`;
  content += `*.iml\n`;
  content += `.vscode/\n`;
  content += `node_modules/\n`;
  content += `docker-compose*.yml\n`;

  return {
    fileName: ".dockerignore",
    path: `${svcName}/.dockerignore`,
    content,
    type: "docker",
    description: `.dockerignore pour ${ms.name}`,
  };
}

// ============================================================
// Kubernetes Manifests
// ============================================================

function generateK8sManifests(ms: MicroserviceProposal, namespace: string): CloudFile[] {
  const files: CloudFile[] = [];
  const svcName = kebabCase(ms.name);

  // Deployment
  let deployment = `# Kubernetes Deployment - ${ms.name}\n`;
  deployment += `# @author Compleo\n`;
  deployment += `apiVersion: apps/v1\n`;
  deployment += `kind: Deployment\n`;
  deployment += `metadata:\n`;
  deployment += `  name: ${svcName}\n`;
  deployment += `  namespace: ${namespace}\n`;
  deployment += `  labels:\n`;
  deployment += `    app: ${svcName}\n`;
  deployment += `    version: v1\n`;
  deployment += `    team: modernization\n`;
  deployment += `spec:\n`;
  deployment += `  replicas: 2\n`;
  deployment += `  selector:\n`;
  deployment += `    matchLabels:\n`;
  deployment += `      app: ${svcName}\n`;
  deployment += `  strategy:\n`;
  deployment += `    type: RollingUpdate\n`;
  deployment += `    rollingUpdate:\n`;
  deployment += `      maxSurge: 1\n`;
  deployment += `      maxUnavailable: 0\n`;
  deployment += `  template:\n`;
  deployment += `    metadata:\n`;
  deployment += `      labels:\n`;
  deployment += `        app: ${svcName}\n`;
  deployment += `        version: v1\n`;
  deployment += `      annotations:\n`;
  deployment += `        prometheus.io/scrape: "true"\n`;
  deployment += `        prometheus.io/port: "8080"\n`;
  deployment += `        prometheus.io/path: "/actuator/prometheus"\n`;
  deployment += `    spec:\n`;
  deployment += `      serviceAccountName: ${svcName}\n`;
  deployment += `      containers:\n`;
  deployment += `        - name: ${svcName}\n`;
  deployment += `          image: registry.bank.com/${namespace}/${svcName}:latest\n`;
  deployment += `          ports:\n`;
  deployment += `            - containerPort: 8080\n`;
  deployment += `              protocol: TCP\n`;
  deployment += `          env:\n`;
  deployment += `            - name: SPRING_PROFILES_ACTIVE\n`;
  deployment += `              value: "kubernetes"\n`;
  deployment += `            - name: JAVA_OPTS\n`;
  deployment += `              value: "-XX:+UseContainerSupport -XX:MaxRAMPercentage=75.0"\n`;
  deployment += `          envFrom:\n`;
  deployment += `            - configMapRef:\n`;
  deployment += `                name: ${svcName}-config\n`;
  deployment += `            - secretRef:\n`;
  deployment += `                name: ${svcName}-secrets\n`;
  deployment += `          resources:\n`;
  deployment += `            requests:\n`;
  deployment += `              cpu: "250m"\n`;
  deployment += `              memory: "512Mi"\n`;
  deployment += `            limits:\n`;
  deployment += `              cpu: "1000m"\n`;
  deployment += `              memory: "1Gi"\n`;
  deployment += `          livenessProbe:\n`;
  deployment += `            httpGet:\n`;
  deployment += `              path: /actuator/health/liveness\n`;
  deployment += `              port: 8080\n`;
  deployment += `            initialDelaySeconds: 30\n`;
  deployment += `            periodSeconds: 10\n`;
  deployment += `          readinessProbe:\n`;
  deployment += `            httpGet:\n`;
  deployment += `              path: /actuator/health/readiness\n`;
  deployment += `              port: 8080\n`;
  deployment += `            initialDelaySeconds: 15\n`;
  deployment += `            periodSeconds: 5\n`;
  deployment += `          startupProbe:\n`;
  deployment += `            httpGet:\n`;
  deployment += `              path: /actuator/health\n`;
  deployment += `              port: 8080\n`;
  deployment += `            failureThreshold: 30\n`;
  deployment += `            periodSeconds: 10\n`;

  files.push({
    fileName: `${svcName}-deployment.yaml`,
    path: `k8s/${svcName}/${svcName}-deployment.yaml`,
    content: deployment,
    type: "kubernetes",
    description: `Deployment K8s pour ${ms.name}`,
  });

  // Service
  let service = `# Kubernetes Service - ${ms.name}\n`;
  service += `# @author Compleo\n`;
  service += `apiVersion: v1\n`;
  service += `kind: Service\n`;
  service += `metadata:\n`;
  service += `  name: ${svcName}\n`;
  service += `  namespace: ${namespace}\n`;
  service += `  labels:\n`;
  service += `    app: ${svcName}\n`;
  service += `spec:\n`;
  service += `  type: ClusterIP\n`;
  service += `  ports:\n`;
  service += `    - port: 80\n`;
  service += `      targetPort: 8080\n`;
  service += `      protocol: TCP\n`;
  service += `      name: http\n`;
  service += `  selector:\n`;
  service += `    app: ${svcName}\n`;

  files.push({
    fileName: `${svcName}-service.yaml`,
    path: `k8s/${svcName}/${svcName}-service.yaml`,
    content: service,
    type: "kubernetes",
    description: `Service K8s pour ${ms.name}`,
  });

  // ConfigMap
  let configMap = `# Kubernetes ConfigMap - ${ms.name}\n`;
  configMap += `# @author Compleo\n`;
  configMap += `apiVersion: v1\n`;
  configMap += `kind: ConfigMap\n`;
  configMap += `metadata:\n`;
  configMap += `  name: ${svcName}-config\n`;
  configMap += `  namespace: ${namespace}\n`;
  configMap += `data:\n`;
  configMap += `  SPRING_PROFILES_ACTIVE: "kubernetes"\n`;
  configMap += `  SERVER_PORT: "8080"\n`;
  configMap += `  MANAGEMENT_ENDPOINTS_WEB_EXPOSURE_INCLUDE: "health,info,metrics,prometheus"\n`;

  if (ms.dataStores.length > 0) {
    configMap += `  SPRING_DATASOURCE_URL: "jdbc:postgresql://${svcName}-db:5432/${svcName.replace(/-/g, "_")}"\n`;
  }
  if (ms.technologies.includes("Spring Kafka")) {
    configMap += `  SPRING_KAFKA_BOOTSTRAP_SERVERS: "kafka:9092"\n`;
  }

  files.push({
    fileName: `${svcName}-configmap.yaml`,
    path: `k8s/${svcName}/${svcName}-configmap.yaml`,
    content: configMap,
    type: "kubernetes",
    description: `ConfigMap K8s pour ${ms.name}`,
  });

  // HPA
  let hpa = `# Kubernetes HPA - ${ms.name}\n`;
  hpa += `# @author Compleo\n`;
  hpa += `apiVersion: autoscaling/v2\n`;
  hpa += `kind: HorizontalPodAutoscaler\n`;
  hpa += `metadata:\n`;
  hpa += `  name: ${svcName}-hpa\n`;
  hpa += `  namespace: ${namespace}\n`;
  hpa += `spec:\n`;
  hpa += `  scaleTargetRef:\n`;
  hpa += `    apiVersion: apps/v1\n`;
  hpa += `    kind: Deployment\n`;
  hpa += `    name: ${svcName}\n`;
  hpa += `  minReplicas: 2\n`;
  hpa += `  maxReplicas: 10\n`;
  hpa += `  metrics:\n`;
  hpa += `    - type: Resource\n`;
  hpa += `      resource:\n`;
  hpa += `        name: cpu\n`;
  hpa += `        target:\n`;
  hpa += `          type: Utilization\n`;
  hpa += `          averageUtilization: 70\n`;
  hpa += `    - type: Resource\n`;
  hpa += `      resource:\n`;
  hpa += `        name: memory\n`;
  hpa += `        target:\n`;
  hpa += `          type: Utilization\n`;
  hpa += `          averageUtilization: 80\n`;

  files.push({
    fileName: `${svcName}-hpa.yaml`,
    path: `k8s/${svcName}/${svcName}-hpa.yaml`,
    content: hpa,
    type: "kubernetes",
    description: `HPA K8s pour ${ms.name}`,
  });

  return files;
}

// ============================================================
// Helm Chart
// ============================================================

function generateHelmChart(proposals: MicroserviceProposal[], namespace: string): CloudFile[] {
  const files: CloudFile[] = [];

  // Chart.yaml
  let chart = `# Helm Chart - Bank Modernized Platform\n`;
  chart += `# @author Compleo\n`;
  chart += `apiVersion: v2\n`;
  chart += `name: ${namespace}\n`;
  chart += `description: Plateforme bancaire modernisee - ${proposals.length} microservices\n`;
  chart += `type: application\n`;
  chart += `version: 1.0.0\n`;
  chart += `appVersion: "1.0.0"\n`;
  chart += `keywords:\n`;
  chart += `  - banking\n`;
  chart += `  - microservices\n`;
  chart += `  - spring-boot\n`;
  chart += `maintainers:\n`;
  chart += `  - name: Compleo\n`;
  chart += `    email: contact@compleo.dev\n`;

  files.push({
    fileName: "Chart.yaml",
    path: `helm/${namespace}/Chart.yaml`,
    content: chart,
    type: "helm",
    description: "Helm Chart principal",
  });

  // values.yaml
  let values = `# Helm Values - ${namespace}\n`;
  values += `# @author Compleo\n\n`;
  values += `global:\n`;
  values += `  namespace: ${namespace}\n`;
  values += `  registry: registry.bank.com\n`;
  values += `  imageTag: latest\n`;
  values += `  imagePullPolicy: IfNotPresent\n\n`;

  for (const ms of proposals) {
    const svcName = kebabCase(ms.name);
    values += `${svcName.replace(/-/g, "")}:\n`;
    values += `  enabled: true\n`;
    values += `  replicaCount: 2\n`;
    values += `  image:\n`;
    values += `    repository: \${global.registry}/${namespace}/${svcName}\n`;
    values += `    tag: \${global.imageTag}\n`;
    values += `  resources:\n`;
    values += `    requests:\n`;
    values += `      cpu: 250m\n`;
    values += `      memory: 512Mi\n`;
    values += `    limits:\n`;
    values += `      cpu: 1000m\n`;
    values += `      memory: 1Gi\n`;
    values += `  autoscaling:\n`;
    values += `    enabled: true\n`;
    values += `    minReplicas: 2\n`;
    values += `    maxReplicas: 10\n`;
    values += `    targetCPU: 70\n\n`;
  }

  files.push({
    fileName: "values.yaml",
    path: `helm/${namespace}/values.yaml`,
    content: values,
    type: "helm",
    description: "Helm values par defaut",
  });

  return files;
}

// ============================================================
// API Gateway
// ============================================================

function generateApiGateway(proposals: MicroserviceProposal[], namespace: string): CloudFile {
  let content = `# API Gateway Configuration - Spring Cloud Gateway\n`;
  content += `# @author Compleo\n`;
  content += `# Remplace le routage centralise du serveur d'applications legacy\n\n`;
  content += `server:\n`;
  content += `  port: \${PORT:8080}\n\n`;
  content += `spring:\n`;
  content += `  application:\n`;
  content += `    name: api-gateway\n`;
  content += `  cloud:\n`;
  content += `    gateway:\n`;
  content += `      default-filters:\n`;
  content += `        - DedupeResponseHeader=Access-Control-Allow-Origin\n`;
  content += `        - name: Retry\n`;
  content += `          args:\n`;
  content += `            retries: 3\n`;
  content += `            statuses: BAD_GATEWAY,SERVICE_UNAVAILABLE\n`;
  content += `            methods: GET\n`;
  content += `            backoff:\n`;
  content += `              firstBackoff: 100ms\n`;
  content += `              maxBackoff: 500ms\n`;
  content += `      globalcors:\n`;
  content += `        cors-configurations:\n`;
  content += `          '[/**]':\n`;
  content += `            allowedOrigins: "*"\n`;
  content += `            allowedMethods: "*"\n`;
  content += `            allowedHeaders: "*"\n`;
  content += `      routes:\n`;

  for (const ms of proposals) {
    const svcName = kebabCase(ms.name);
    const basePath = `/api/v1/${svcName.replace(/-service$/, "")}s`;
    content += `        - id: ${svcName}\n`;
    content += `          uri: lb://${svcName}\n`;
    content += `          predicates:\n`;
    content += `            - Path=${basePath}/**\n`;
    content += `          filters:\n`;
    content += `            - StripPrefix=0\n`;
    content += `            - name: CircuitBreaker\n`;
    content += `              args:\n`;
    content += `                name: ${svcName}-cb\n`;
    content += `                fallbackUri: forward:/fallback/${svcName}\n`;
    content += `            - name: RequestRateLimiter\n`;
    content += `              args:\n`;
    content += `                redis-rate-limiter.replenishRate: 100\n`;
    content += `                redis-rate-limiter.burstCapacity: 200\n`;
  }

  content += `\n# Resilience4j Circuit Breaker\n`;
  content += `resilience4j:\n`;
  content += `  circuitbreaker:\n`;
  content += `    configs:\n`;
  content += `      default:\n`;
  content += `        slidingWindowSize: 10\n`;
  content += `        failureRateThreshold: 50\n`;
  content += `        waitDurationInOpenState: 10000\n`;
  content += `        permittedNumberOfCallsInHalfOpenState: 3\n`;
  content += `  timelimiter:\n`;
  content += `    configs:\n`;
  content += `      default:\n`;
  content += `        timeoutDuration: 5s\n`;

  return {
    fileName: "application-gateway.yml",
    path: "api-gateway/src/main/resources/application.yml",
    content,
    type: "gateway",
    description: "Configuration Spring Cloud Gateway",
  };
}

function generateApiGatewayK8s(namespace: string): CloudFile {
  let content = `# Kubernetes Ingress - API Gateway\n`;
  content += `# @author Compleo\n`;
  content += `apiVersion: networking.k8s.io/v1\n`;
  content += `kind: Ingress\n`;
  content += `metadata:\n`;
  content += `  name: api-gateway-ingress\n`;
  content += `  namespace: ${namespace}\n`;
  content += `  annotations:\n`;
  content += `    nginx.ingress.kubernetes.io/ssl-redirect: "true"\n`;
  content += `    nginx.ingress.kubernetes.io/rate-limit: "100"\n`;
  content += `    nginx.ingress.kubernetes.io/rate-limit-window: "1m"\n`;
  content += `    cert-manager.io/cluster-issuer: "letsencrypt-prod"\n`;
  content += `spec:\n`;
  content += `  ingressClassName: nginx\n`;
  content += `  tls:\n`;
  content += `    - hosts:\n`;
  content += `        - api.bank.com\n`;
  content += `      secretName: api-tls-secret\n`;
  content += `  rules:\n`;
  content += `    - host: api.bank.com\n`;
  content += `      http:\n`;
  content += `        paths:\n`;
  content += `          - path: /api\n`;
  content += `            pathType: Prefix\n`;
  content += `            backend:\n`;
  content += `              service:\n`;
  content += `                name: api-gateway\n`;
  content += `                port:\n`;
  content += `                  number: 80\n`;

  return {
    fileName: "ingress.yaml",
    path: `k8s/gateway/ingress.yaml`,
    content,
    type: "kubernetes",
    description: "Ingress K8s pour l'API Gateway",
  };
}

// ============================================================
// Security (OAuth2)
// ============================================================

function generateSecurityConfig(proposals: MicroserviceProposal[]): CloudFile {
  let content = `package com.bank.modern.config;\n\n`;
  content += `import org.springframework.context.annotation.Bean;\n`;
  content += `import org.springframework.context.annotation.Configuration;\n`;
  content += `import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;\n`;
  content += `import org.springframework.security.config.annotation.web.builders.HttpSecurity;\n`;
  content += `import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;\n`;
  content += `import org.springframework.security.config.http.SessionCreationPolicy;\n`;
  content += `import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;\n`;
  content += `import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter;\n`;
  content += `import org.springframework.security.web.SecurityFilterChain;\n`;
  content += `import org.springframework.security.web.authentication.logout.LogoutSuccessHandler;\n`;
  content += `import org.springframework.security.oauth2.client.oidc.web.logout.OidcClientInitiatedLogoutSuccessHandler;\n`;
  content += `import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;\n\n`;
  content += `/**\n`;
  content += ` * Configuration OAuth2/JWT + OpenID Connect pour la securite des microservices.\n`;
  content += ` * Remplace la securite JAAS/container-managed du serveur d'applications legacy.\n`;
  content += ` *\n`;
  content += ` * @author Compleo\n`;
  content += ` */\n`;
  content += `@Configuration\n`;
  content += `@EnableWebSecurity\n`;
  content += `@EnableMethodSecurity\n`;
  content += `public class SecurityConfig {\n\n`;
  content += `    private final ClientRegistrationRepository clientRegistrationRepository;\n\n`;
  content += `    public SecurityConfig(ClientRegistrationRepository clientRegistrationRepository) {\n`;
  content += `        this.clientRegistrationRepository = clientRegistrationRepository;\n`;
  content += `    }\n\n`;
  content += `    @Bean\n`;
  content += `    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {\n`;
  content += `        http\n`;
  content += `            .csrf(csrf -> csrf.disable())\n`;
  content += `            .sessionManagement(session ->\n`;
  content += `                session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))\n`;
  content += `            .authorizeHttpRequests(auth -> auth\n`;
  content += `                // Endpoints publics\n`;
  content += `                .requestMatchers("/actuator/**").permitAll()\n`;
  content += `                .requestMatchers("/swagger-ui/**", "/v3/api-docs/**").permitAll()\n`;
  content += `                // Tous les autres endpoints necessitent une authentification\n`;
  content += `                .anyRequest().authenticated()\n`;
  content += `            )\n`;
  content += `            .oauth2ResourceServer(oauth2 -> oauth2\n`;
  content += `                .jwt(jwt -> jwt\n`;
  content += `                    .jwtAuthenticationConverter(jwtAuthenticationConverter())\n`;
  content += `                )\n`;
  content += `            )\n`;
  content += `            // OpenID Connect logout\n`;
  content += `            .logout(logout -> logout\n`;
  content += `                .logoutSuccessHandler(oidcLogoutSuccessHandler())\n`;
  content += `            );\n`;
  content += `        return http.build();\n`;
  content += `    }\n\n`;
  content += `    /**\n`;
  content += `     * OpenID Connect RP-Initiated Logout.\n`;
  content += `     * Redirige vers le endpoint de logout du provider OIDC (Keycloak, Azure AD, etc.).\n`;
  content += `     */\n`;
  content += `    @Bean\n`;
  content += `    public LogoutSuccessHandler oidcLogoutSuccessHandler() {\n`;
  content += `        OidcClientInitiatedLogoutSuccessHandler handler =\n`;
  content += `                new OidcClientInitiatedLogoutSuccessHandler(clientRegistrationRepository);\n`;
  content += `        handler.setPostLogoutRedirectUri(\"{baseUrl}\");\n`;
  content += `        return handler;\n`;
  content += `    }\n\n`;
  content += `    @Bean\n`;
  content += `    public JwtAuthenticationConverter jwtAuthenticationConverter() {\n`;
  content += `        JwtGrantedAuthoritiesConverter grantedAuthoritiesConverter =\n`;
  content += `                new JwtGrantedAuthoritiesConverter();\n`;
  content += `        grantedAuthoritiesConverter.setAuthoritiesClaimName("roles");\n`;
  content += `        grantedAuthoritiesConverter.setAuthorityPrefix("ROLE_");\n\n`;
  content += `        JwtAuthenticationConverter jwtAuthenticationConverter =\n`;
  content += `                new JwtAuthenticationConverter();\n`;
  content += `        jwtAuthenticationConverter.setJwtGrantedAuthoritiesConverter(\n`;
  content += `                grantedAuthoritiesConverter);\n`;
  content += `        return jwtAuthenticationConverter;\n`;
  content += `    }\n`;
  content += `}\n`;

  return {
    fileName: "SecurityConfig.java",
    path: "common/src/main/java/com/bank/modern/config/SecurityConfig.java",
    content,
    type: "security",
    description: "Configuration OAuth2/JWT + OpenID Connect commune",
  };
}

// ============================================================
// Observability
// ============================================================

function generateObservability(proposals: MicroserviceProposal[], namespace: string): CloudFile[] {
  const files: CloudFile[] = [];

  // Prometheus config
  let promConfig = `# Prometheus Configuration\n`;
  promConfig += `# @author Compleo\n`;
  promConfig += `global:\n`;
  promConfig += `  scrape_interval: 15s\n`;
  promConfig += `  evaluation_interval: 15s\n\n`;
  promConfig += `scrape_configs:\n`;

  for (const ms of proposals) {
    const svcName = kebabCase(ms.name);
    promConfig += `  - job_name: '${svcName}'\n`;
    promConfig += `    metrics_path: '/actuator/prometheus'\n`;
    promConfig += `    kubernetes_sd_configs:\n`;
    promConfig += `      - role: pod\n`;
    promConfig += `        namespaces:\n`;
    promConfig += `          names: ['${namespace}']\n`;
    promConfig += `    relabel_configs:\n`;
    promConfig += `      - source_labels: [__meta_kubernetes_pod_label_app]\n`;
    promConfig += `        regex: ${svcName}\n`;
    promConfig += `        action: keep\n\n`;
  }

  files.push({
    fileName: "prometheus.yml",
    path: "observability/prometheus/prometheus.yml",
    content: promConfig,
    type: "observability",
    description: "Configuration Prometheus",
  });

  // Grafana dashboard
  let grafana = `{\n`;
  grafana += `  "dashboard": {\n`;
  grafana += `    "title": "${namespace} - Monitoring Dashboard",\n`;
  grafana += `    "description": "Dashboard de monitoring genere par Java Legacy Modernizer - Compleo",\n`;
  grafana += `    "panels": [\n`;

  let panelId = 1;
  for (const ms of proposals) {
    const svcName = kebabCase(ms.name);
    if (panelId > 1) grafana += `,\n`;
    grafana += `      {\n`;
    grafana += `        "id": ${panelId++},\n`;
    grafana += `        "title": "${ms.name} - Requests/sec",\n`;
    grafana += `        "type": "graph",\n`;
    grafana += `        "targets": [{"expr": "rate(http_server_requests_seconds_count{app=\\"${svcName}\\"}[5m])"}]\n`;
    grafana += `      },\n`;
    grafana += `      {\n`;
    grafana += `        "id": ${panelId++},\n`;
    grafana += `        "title": "${ms.name} - Response Time (p95)",\n`;
    grafana += `        "type": "graph",\n`;
    grafana += `        "targets": [{"expr": "histogram_quantile(0.95, rate(http_server_requests_seconds_bucket{app=\\"${svcName}\\"}[5m]))"}]\n`;
    grafana += `      }`;
  }

  grafana += `\n    ]\n`;
  grafana += `  }\n`;
  grafana += `}\n`;

  files.push({
    fileName: "dashboard.json",
    path: "observability/grafana/dashboard.json",
    content: grafana,
    type: "observability",
    description: "Dashboard Grafana",
  });

  // ELK - Logstash config
  let logstash = `# Logstash Configuration\n`;
  logstash += `# @author Compleo\n`;
  logstash += `input {\n`;
  logstash += `  beats {\n`;
  logstash += `    port => 5044\n`;
  logstash += `  }\n`;
  logstash += `}\n\n`;
  logstash += `filter {\n`;
  logstash += `  json {\n`;
  logstash += `    source => "message"\n`;
  logstash += `  }\n`;
  logstash += `  mutate {\n`;
  logstash += `    add_field => { "environment" => "%{[kubernetes][namespace]}" }\n`;
  logstash += `  }\n`;
  logstash += `}\n\n`;
  logstash += `output {\n`;
  logstash += `  elasticsearch {\n`;
  logstash += `    hosts => ["http://elasticsearch:9200"]\n`;
  logstash += `    index => "${namespace}-logs-%{+YYYY.MM.dd}"\n`;
  logstash += `  }\n`;
  logstash += `}\n`;

  files.push({
    fileName: "logstash.conf",
    path: "observability/logstash/logstash.conf",
    content: logstash,
    type: "observability",
    description: "Configuration Logstash (ELK)",
  });

  return files;
}

// ============================================================
// Docker Compose
// ============================================================

function generateDockerCompose(proposals: MicroserviceProposal[]): CloudFile {
  let content = `# Docker Compose - Environnement de developpement local\n`;
  content += `# @author Compleo\n`;
  content += `version: '3.9'\n\n`;
  content += `services:\n`;

  for (const ms of proposals) {
    const svcName = kebabCase(ms.name);
    const port = 8080 + proposals.indexOf(ms);
    content += `  ${svcName}:\n`;
    content += `    build:\n`;
    content += `      context: ./${svcName}\n`;
    content += `      dockerfile: Dockerfile\n`;
    content += `    ports:\n`;
    content += `      - "${port}:8080"\n`;
    content += `    environment:\n`;
    content += `      - SPRING_PROFILES_ACTIVE=docker\n`;

    if (ms.dataStores.length > 0) {
      content += `      - SPRING_DATASOURCE_URL=jdbc:postgresql://postgres:5432/${svcName.replace(/-/g, "_")}\n`;
      content += `      - SPRING_DATASOURCE_USERNAME=postgres\n`;
      content += `      - SPRING_DATASOURCE_PASSWORD=postgres\n`;
      content += `    depends_on:\n`;
      content += `      - postgres\n`;
    }
    if (ms.technologies.includes("Spring Kafka")) {
      content += `      - SPRING_KAFKA_BOOTSTRAP_SERVERS=kafka:9092\n`;
      content += `    depends_on:\n`;
      content += `      - kafka\n`;
    }
    content += `    networks:\n`;
    content += `      - bank-network\n\n`;
  }

  // Infrastructure services
  const hasDb = proposals.some(p => p.dataStores.length > 0);
  const hasKafka = proposals.some(p => p.technologies.includes("Spring Kafka"));

  if (hasDb) {
    content += `  postgres:\n`;
    content += `    image: postgres:16-alpine\n`;
    content += `    environment:\n`;
    content += `      POSTGRES_USER: postgres\n`;
    content += `      POSTGRES_PASSWORD: postgres\n`;
    content += `    ports:\n`;
    content += `      - "5432:5432"\n`;
    content += `    volumes:\n`;
    content += `      - postgres-data:/var/lib/postgresql/data\n`;
    content += `    networks:\n`;
    content += `      - bank-network\n\n`;
  }

  if (hasKafka) {
    content += `  zookeeper:\n`;
    content += `    image: confluentinc/cp-zookeeper:7.6.0\n`;
    content += `    environment:\n`;
    content += `      ZOOKEEPER_CLIENT_PORT: 2181\n`;
    content += `    networks:\n`;
    content += `      - bank-network\n\n`;
    content += `  kafka:\n`;
    content += `    image: confluentinc/cp-kafka:7.6.0\n`;
    content += `    depends_on:\n`;
    content += `      - zookeeper\n`;
    content += `    ports:\n`;
    content += `      - "9092:9092"\n`;
    content += `    environment:\n`;
    content += `      KAFKA_BROKER_ID: 1\n`;
    content += `      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181\n`;
    content += `      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:9092\n`;
    content += `      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1\n`;
    content += `    networks:\n`;
    content += `      - bank-network\n\n`;
  }

  content += `networks:\n`;
  content += `  bank-network:\n`;
  content += `    driver: bridge\n\n`;
  content += `volumes:\n`;
  if (hasDb) content += `  postgres-data:\n`;

  return {
    fileName: "docker-compose.yml",
    path: "docker-compose.yml",
    content,
    type: "compose",
    description: "Docker Compose pour le developpement local",
  };
}

// ============================================================
// CI/CD Pipeline
// ============================================================

function generateGitHubActions(proposals: MicroserviceProposal[]): CloudFile {
  let content = `# GitHub Actions CI/CD Pipeline\n`;
  content += `# @author Compleo\n`;
  content += `name: Build & Deploy Microservices\n\n`;
  content += `on:\n`;
  content += `  push:\n`;
  content += `    branches: [main, develop]\n`;
  content += `  pull_request:\n`;
  content += `    branches: [main]\n\n`;
  content += `env:\n`;
  content += `  REGISTRY: registry.bank.com\n`;
  content += `  NAMESPACE: bank-modernized\n\n`;
  content += `jobs:\n`;

  for (const ms of proposals) {
    const svcName = kebabCase(ms.name);
    const jobName = svcName.replace(/-/g, "_");
    content += `  build_${jobName}:\n`;
    content += `    name: Build ${ms.name}\n`;
    content += `    runs-on: ubuntu-latest\n`;
    content += `    steps:\n`;
    content += `      - uses: actions/checkout@v4\n`;
    content += `      - name: Set up JDK 21\n`;
    content += `        uses: actions/setup-java@v4\n`;
    content += `        with:\n`;
    content += `          java-version: '21'\n`;
    content += `          distribution: 'temurin'\n`;
    content += `      - name: Build with Maven\n`;
    content += `        run: cd ${svcName} && mvn clean package -DskipTests\n`;
    content += `      - name: Run Tests\n`;
    content += `        run: cd ${svcName} && mvn test\n`;
    content += `      - name: Build Docker Image\n`;
    content += `        run: docker build -t \${{ env.REGISTRY }}/\${{ env.NAMESPACE }}/${svcName}:\${{ github.sha }} ./${svcName}\n`;
    content += `      - name: Push Docker Image\n`;
    content += `        if: github.ref == 'refs/heads/main'\n`;
    content += `        run: docker push \${{ env.REGISTRY }}/\${{ env.NAMESPACE }}/${svcName}:\${{ github.sha }}\n\n`;
  }

  content += `  deploy:\n`;
  content += `    name: Deploy to Kubernetes\n`;
  content += `    needs: [${proposals.map(ms => `build_${kebabCase(ms.name).replace(/-/g, "_")}`).join(", ")}]\n`;
  content += `    if: github.ref == 'refs/heads/main'\n`;
  content += `    runs-on: ubuntu-latest\n`;
  content += `    steps:\n`;
  content += `      - uses: actions/checkout@v4\n`;
  content += `      - name: Deploy with Helm\n`;
  content += `        run: |\n`;
  content += `          helm upgrade --install \${{ env.NAMESPACE }} ./helm/\${{ env.NAMESPACE }} \\\n`;
  content += `            --namespace \${{ env.NAMESPACE }} \\\n`;
  content += `            --set global.imageTag=\${{ github.sha }}\n`;

  return {
    fileName: "ci-cd.yml",
    path: ".github/workflows/ci-cd.yml",
    content,
    type: "ci",
    description: "Pipeline CI/CD GitHub Actions",
  };
}

// ============================================================
// Utility
// ============================================================

function kebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/\s+/g, "-")
    .toLowerCase();
}
