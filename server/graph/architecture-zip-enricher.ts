/**
 * Architecture ZIP Enricher — Ajoute les livrables architecture au ZIP de sortie.
 * Génère les fichiers d'architecture dans le dossier architecture/ du ZIP :
 *   01_SYNTHESE_EXECUTIF.md
 *   02_ARCHITECTURE_LEGACY.svg
 *   03_ARCHITECTURE_CIBLE.svg
 *   04_DEPENDENCY_GRAPH.graphml
 *   05_MICROSERVICES_MAP.json
 *   06_MIGRATION_ROADMAP.md
 *   microservices/<service-name>/README.md
 *   microservices/<service-name>/Dockerfile
 *   microservices/<service-name>/k8s/deployment.yaml
 *
 * @author Hamza NORDINE
 */

import { GraphBuilder } from "./GraphBuilder";
import { DomainClusterer } from "./DomainClusterer";
import { ArchitectureDiscovery } from "./ArchitectureDiscovery";
import { MicroserviceExtractor } from "./MicroserviceExtractor";
import { VisualizationEngine } from "../visualization/VisualizationEngine";
import type { ProjectIR } from "../java-parser";
import type { ExtractionResult, MicroserviceCandidate } from "./MicroserviceExtractor";
import type { ArchitectureReport } from "./ArchitectureDiscovery";
import type { DependencyGraph, DomainMap } from "./model/GraphModel";

export interface ArchitectureZipFile {
  path: string;
  content: string;
}

export interface ArchitectureEnrichmentResult {
  files: ArchitectureZipFile[];
  microserviceCount: number;
  domainCount: number;
  criticalFlowCount: number;
}

/**
 * Enrichit un ZIP de sortie avec les livrables d'architecture.
 * Exécute le pipeline complet : GraphBuilder → DomainClusterer → ArchitectureDiscovery → MicroserviceExtractor → VisualizationEngine.
 */
export function enrichZipWithArchitecture(ir: ProjectIR): ArchitectureEnrichmentResult {
  const files: ArchitectureZipFile[] = [];

  try {
    // Pipeline complet
    const graphBuilder = new GraphBuilder();
    const graph = graphBuilder.buildFromIR(ir);

    const clusterer = new DomainClusterer();
    const domainMap = clusterer.cluster(graph);

    const discovery = new ArchitectureDiscovery();
    const archReport = discovery.discover(graph, domainMap);

    const extractor = new MicroserviceExtractor();
    const extraction = extractor.extract(graph, domainMap, archReport);

    const vizEngine = new VisualizationEngine();
    const visualizations = vizEngine.generateAll(graph, extraction, archReport);

    // 01 — Synthèse exécutif
    files.push({
      path: "architecture/01_SYNTHESE_EXECUTIF.md",
      content: generateExecutiveSummary(ir, graph, domainMap, archReport, extraction),
    });

    // 02 — Architecture Legacy SVG
    const legacySvg = visualizations.find((v) => v.filename === "dependency-graph.svg");
    if (legacySvg) {
      files.push({ path: "architecture/02_ARCHITECTURE_LEGACY.svg", content: legacySvg.content });
    }

    // 03 — Architecture Cible SVG
    const cibleSvg = visualizations.find((v) => v.filename === "microservices-map.svg");
    if (cibleSvg) {
      files.push({ path: "architecture/03_ARCHITECTURE_CIBLE.svg", content: cibleSvg.content });
    }

    // 04 — Dependency Graph GraphML
    const graphml = visualizations.find((v) => v.filename === "architecture.graphml");
    if (graphml) {
      files.push({ path: "architecture/04_DEPENDENCY_GRAPH.graphml", content: graphml.content });
    }

    // 05 — Microservices Map JSON
    const cytoscapeJson = visualizations.find((v) => v.filename === "cytoscape-graph.json");
    if (cytoscapeJson) {
      files.push({ path: "architecture/05_MICROSERVICES_MAP.json", content: cytoscapeJson.content });
    }

    // 06 — Migration Roadmap
    files.push({
      path: "architecture/06_MIGRATION_ROADMAP.md",
      content: generateMigrationRoadmap(extraction, archReport),
    });

    // Architecture Overview SVG
    const overviewSvg = visualizations.find((v) => v.filename === "architecture-overview.svg");
    if (overviewSvg) {
      files.push({ path: "architecture/07_ARCHITECTURE_OVERVIEW.svg", content: overviewSvg.content });
    }

    // D2 diagram
    const d2 = visualizations.find((v) => v.filename === "architecture.d2");
    if (d2) {
      files.push({ path: "architecture/08_ARCHITECTURE.d2", content: d2.content });
    }

    // Microservice directories
    for (const ms of extraction.microservices) {
      const basePath = `architecture/microservices/${ms.springBootConfig.artifactId}`;

      files.push({
        path: `${basePath}/README.md`,
        content: generateMicroserviceReadme(ms, extraction),
      });

      files.push({
        path: `${basePath}/Dockerfile`,
        content: generateMicroserviceDockerfile(ms),
      });

      files.push({
        path: `${basePath}/k8s/deployment.yaml`,
        content: generateK8sDeployment(ms),
      });

      files.push({
        path: `${basePath}/k8s/service.yaml`,
        content: generateK8sService(ms),
      });
    }

    return {
      files,
      microserviceCount: extraction.microservices.length,
      domainCount: domainMap.length,
      criticalFlowCount: archReport.criticalFlows.length,
    };
  } catch (error: any) {
    console.warn("[ArchitectureZipEnricher] Pipeline failed, returning partial results:", error.message);
    // Return whatever we have so far
    return {
      files,
      microserviceCount: 0,
      domainCount: 0,
      criticalFlowCount: 0,
    };
  }
}

// ─── Document Generators ────────────────────────────────────────────────────

function generateExecutiveSummary(
  ir: ProjectIR,
  graph: DependencyGraph,
  domainMap: DomainMap,
  archReport: ArchitectureReport,
  extraction: ExtractionResult
): string {
  const lines: string[] = [];

  lines.push(`# Synthèse Exécutive — Architecture Discovery`);
  lines.push(``);
  lines.push(`**Projet :** ${extraction.projectName}`);
  lines.push(`**Date :** ${new Date().toISOString().split("T")[0]}`);
  lines.push(`**Outil :** Compleo v5.0 — Architecture Discovery Platform`);
  lines.push(``);
  lines.push(`---`);
  lines.push(``);
  lines.push(`## 1. Périmètre analysé`);
  lines.push(``);
  lines.push(`| Métrique | Valeur |`);
  lines.push(`|----------|--------|`);
  lines.push(`| Classes Java analysées | ${ir.useCases.length} |`);
  lines.push(`| Nœuds dans le graphe | ${graph.graphMetrics.totalNodes} |`);
  lines.push(`| Arêtes (dépendances) | ${graph.graphMetrics.totalEdges} |`);
  lines.push(`| Composants connexes | ${graph.graphMetrics.connectedComponents} |`);
  lines.push(`| Degré moyen | ${graph.graphMetrics.avgDegree.toFixed(2)} |`);
  lines.push(``);
  lines.push(`## 2. Domaines métier identifiés`);
  lines.push(``);
  lines.push(`| Domaine | Classes | Cohésion | Couplage |`);
  lines.push(`|---------|---------|----------|----------|`);
  for (const d of domainMap) {
    lines.push(`| ${d.domainId.replace(/_/g, " ")} | ${d.classes.length} | ${(d.cohesion * 100).toFixed(0)}% | ${(d.couplage * 100).toFixed(0)}% |`);
  }
  lines.push(``);
  lines.push(`## 3. Architecture découverte`);
  lines.push(``);
  lines.push(`| Métrique | Valeur |`);
  lines.push(`|----------|--------|`);
  lines.push(`| Points d'entrée | ${archReport.entryPoints.length} |`);
  lines.push(`| Points de sortie | ${archReport.exitPoints.length} |`);
  lines.push(`| Flux critiques | ${archReport.criticalFlows.length} |`);
  lines.push(`| Flux à haut risque | ${archReport.summary.highRiskFlows} |`);
  lines.push(`| Modules fonctionnels | ${archReport.functionalModules.length} |`);
  lines.push(``);
  lines.push(`## 4. Microservices proposés`);
  lines.push(``);
  lines.push(`| Microservice | Bounded Context | Classes | Endpoints | Cohésion | Couplage |`);
  lines.push(`|-------------|-----------------|---------|-----------|----------|----------|`);
  for (const ms of extraction.microservices) {
    lines.push(`| ${ms.name} | ${ms.boundedContext.replace(/_/g, " ")} | ${ms.metrics.classCount} | ${ms.endpoints.length} | ${(ms.metrics.cohesion * 100).toFixed(0)}% | ${(ms.metrics.coupling * 100).toFixed(0)}% |`);
  }
  lines.push(``);
  lines.push(`### Shared Library`);
  lines.push(`- **${extraction.sharedLibrary.name}** : ${extraction.sharedLibrary.classes.length} classes communes`);
  lines.push(``);
  lines.push(`### API Gateway`);
  lines.push(`- ${extraction.apiGateway.routes.length} routes configurées`);
  lines.push(``);
  lines.push(`## 5. Recommandations`);
  lines.push(``);
  if (archReport.summary.highRiskFlows > 0) {
    lines.push(`- **Priorité haute :** ${archReport.summary.highRiskFlows} flux à haut risque nécessitent une attention particulière lors de la migration.`);
  }
  if (extraction.warnings && extraction.warnings.length > 0) {
    lines.push(`- **Avertissements :** ${extraction.warnings.length} point(s) d'attention identifié(s) :`);
    for (const w of extraction.warnings) {
      lines.push(`  - ${w}`);
    }
  }
  lines.push(`- Commencer la migration par les microservices à forte cohésion et faible couplage.`);
  lines.push(`- Utiliser le pattern Strangler Fig pour une migration progressive.`);
  lines.push(`- Mettre en place un API Gateway dès la première phase.`);
  lines.push(``);

  return lines.join("\n");
}

function generateMigrationRoadmap(extraction: ExtractionResult, archReport: ArchitectureReport): string {
  const lines: string[] = [];

  lines.push(`# Plan de Migration — Architecture Microservices`);
  lines.push(``);
  lines.push(`**Projet :** ${extraction.projectName}`);
  lines.push(`**Date :** ${new Date().toISOString().split("T")[0]}`);
  lines.push(`**Stratégie :** Strangler Fig Pattern`);
  lines.push(``);
  lines.push(`---`);
  lines.push(``);

  // Sort microservices by coupling (lowest first = easiest to extract)
  const sorted = [...extraction.microservices].sort((a, b) => a.metrics.coupling - b.metrics.coupling);

  lines.push(`## Phase 0 — Infrastructure (Semaine 1-2)`);
  lines.push(``);
  lines.push(`- [ ] Mettre en place le registre de services (Eureka/Consul)`);
  lines.push(`- [ ] Configurer l'API Gateway (Spring Cloud Gateway)`);
  lines.push(`- [ ] Déployer la shared library : **${extraction.sharedLibrary.name}**`);
  lines.push(`- [ ] Configurer le monitoring (Prometheus + Grafana)`);
  lines.push(`- [ ] Mettre en place le circuit breaker (Resilience4j)`);
  lines.push(``);

  let phase = 1;
  let weekStart = 3;

  for (const ms of sorted) {
    const weekEnd = weekStart + 1;
    const risk = ms.metrics.coupling > 0.5 ? "HAUT" : ms.metrics.coupling > 0.3 ? "MOYEN" : "BAS";

    lines.push(`## Phase ${phase} — ${ms.name} (Semaine ${weekStart}-${weekEnd})`);
    lines.push(``);
    lines.push(`| Propriété | Valeur |`);
    lines.push(`|-----------|--------|`);
    lines.push(`| Bounded Context | ${ms.boundedContext.replace(/_/g, " ")} |`);
    lines.push(`| Classes | ${ms.metrics.classCount} |`);
    lines.push(`| Endpoints | ${ms.endpoints.length} |`);
    lines.push(`| Cohésion | ${(ms.metrics.cohesion * 100).toFixed(0)}% |`);
    lines.push(`| Couplage | ${(ms.metrics.coupling * 100).toFixed(0)}% |`);
    lines.push(`| Risque | ${risk} |`);
    lines.push(``);
    lines.push(`**Tâches :**`);
    lines.push(`- [ ] Créer le projet Spring Boot : \`${ms.springBootConfig.artifactId}\``);
    lines.push(`- [ ] Migrer les ${ms.metrics.classCount} classes`);
    if (ms.endpoints.length > 0) {
      lines.push(`- [ ] Exposer les ${ms.endpoints.length} endpoints REST`);
    }
    if (ms.databases.length > 0) {
      lines.push(`- [ ] Configurer la base de données : ${ms.databases.join(", ")}`);
    }
    if (ms.dependencies.length > 0) {
      lines.push(`- [ ] Configurer les dépendances inter-services :`);
      for (const dep of ms.dependencies) {
        lines.push(`  - ${dep.targetServiceName} (${dep.type})`);
      }
    }
    lines.push(`- [ ] Tests d'intégration`);
    lines.push(`- [ ] Déploiement et bascule du trafic`);
    lines.push(``);

    phase++;
    weekStart = weekEnd + 1;
  }

  lines.push(`## Phase ${phase} — Décommissionnement du monolithe (Semaine ${weekStart}-${weekStart + 1})`);
  lines.push(``);
  lines.push(`- [ ] Vérifier que tous les microservices sont opérationnels`);
  lines.push(`- [ ] Rediriger 100% du trafic vers les microservices`);
  lines.push(`- [ ] Désactiver le monolithe`);
  lines.push(`- [ ] Archiver le code legacy`);
  lines.push(``);
  lines.push(`---`);
  lines.push(``);
  lines.push(`**Durée totale estimée :** ${weekStart + 1} semaines`);
  lines.push(`**Microservices :** ${extraction.microservices.length}`);
  lines.push(`**Flux critiques à surveiller :** ${archReport.criticalFlows.length}`);
  lines.push(``);

  return lines.join("\n");
}

function generateMicroserviceReadme(ms: MicroserviceCandidate, extraction: ExtractionResult): string {
  const lines: string[] = [];

  lines.push(`# ${ms.name}`);
  lines.push(``);
  lines.push(`> ${ms.description}`);
  lines.push(``);
  lines.push(`## Configuration`);
  lines.push(``);
  lines.push(`| Propriété | Valeur |`);
  lines.push(`|-----------|--------|`);
  lines.push(`| Artifact ID | ${ms.springBootConfig.artifactId} |`);
  lines.push(`| Port | ${ms.springBootConfig.port} |`);
  lines.push(`| Bounded Context | ${ms.boundedContext.replace(/_/g, " ")} |`);
  lines.push(`| Classes | ${ms.metrics.classCount} |`);
  lines.push(`| Cohésion | ${(ms.metrics.cohesion * 100).toFixed(0)}% |`);
  lines.push(`| Couplage | ${(ms.metrics.coupling * 100).toFixed(0)}% |`);
  lines.push(``);

  if (ms.endpoints.length > 0) {
    lines.push(`## Endpoints`);
    lines.push(``);
    lines.push(`| Méthode | Path | Description |`);
    lines.push(`|---------|------|-------------|`);
    for (const ep of ms.endpoints) {
      lines.push(`| ${ep.method} | ${ep.path} | ${ep.description} |`);
    }
    lines.push(``);
  }

  if (ms.dependencies.length > 0) {
    lines.push(`## Dépendances`);
    lines.push(``);
    for (const dep of ms.dependencies) {
      lines.push(`- **${dep.targetServiceName}** (${dep.type})`);
    }
    lines.push(``);
  }

  if (ms.databases.length > 0) {
    lines.push(`## Bases de données`);
    lines.push(``);
    for (const db of ms.databases) {
      lines.push(`- ${db}`);
    }
    lines.push(``);
  }

  lines.push(`## Classes`);
  lines.push(``);
  for (const cls of ms.classDetails) {
    lines.push(`- \`${cls.className}\` — ${cls.role} (${cls.domain})`);
  }
  lines.push(``);

  lines.push(`## Démarrage`);
  lines.push(``);
  lines.push("```bash");
  lines.push(`# Build`);
  lines.push(`mvn clean package -DskipTests`);
  lines.push(``);
  lines.push(`# Run`);
  lines.push(`java -jar target/${ms.springBootConfig.artifactId}-0.0.1-SNAPSHOT.jar`);
  lines.push(``);
  lines.push(`# Docker`);
  lines.push(`docker build -t ${ms.springBootConfig.artifactId} .`);
  lines.push(`docker run -p ${ms.springBootConfig.port}:${ms.springBootConfig.port} ${ms.springBootConfig.artifactId}`);
  lines.push("```");
  lines.push(``);

  return lines.join("\n");
}

function generateMicroserviceDockerfile(ms: MicroserviceCandidate): string {
  return `# ${ms.name} — Dockerfile
FROM eclipse-temurin:17-jre-alpine AS runtime

WORKDIR /app

COPY target/${ms.springBootConfig.artifactId}-0.0.1-SNAPSHOT.jar app.jar

EXPOSE ${ms.springBootConfig.port}

ENV JAVA_OPTS="-Xms256m -Xmx512m"

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \\
  CMD wget --quiet --tries=1 --spider http://localhost:${ms.springBootConfig.port}/actuator/health || exit 1

ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
`;
}

function generateK8sDeployment(ms: MicroserviceCandidate): string {
  return `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${ms.springBootConfig.artifactId}
  labels:
    app: ${ms.springBootConfig.artifactId}
    bounded-context: ${ms.boundedContext.toLowerCase().replace(/_/g, "-")}
spec:
  replicas: 2
  selector:
    matchLabels:
      app: ${ms.springBootConfig.artifactId}
  template:
    metadata:
      labels:
        app: ${ms.springBootConfig.artifactId}
        bounded-context: ${ms.boundedContext.toLowerCase().replace(/_/g, "-")}
    spec:
      containers:
        - name: ${ms.springBootConfig.artifactId}
          image: registry.compleo.io/${ms.springBootConfig.artifactId}:latest
          ports:
            - containerPort: ${ms.springBootConfig.port}
          env:
            - name: SPRING_PROFILES_ACTIVE
              value: "kubernetes"
            - name: SERVER_PORT
              value: "${ms.springBootConfig.port}"
          resources:
            requests:
              memory: "256Mi"
              cpu: "250m"
            limits:
              memory: "512Mi"
              cpu: "500m"
          livenessProbe:
            httpGet:
              path: /actuator/health/liveness
              port: ${ms.springBootConfig.port}
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /actuator/health/readiness
              port: ${ms.springBootConfig.port}
            initialDelaySeconds: 15
            periodSeconds: 5
`;
}

function generateK8sService(ms: MicroserviceCandidate): string {
  return `apiVersion: v1
kind: Service
metadata:
  name: ${ms.springBootConfig.artifactId}
  labels:
    app: ${ms.springBootConfig.artifactId}
spec:
  type: ClusterIP
  selector:
    app: ${ms.springBootConfig.artifactId}
  ports:
    - port: ${ms.springBootConfig.port}
      targetPort: ${ms.springBootConfig.port}
      protocol: TCP
      name: http
`;
}
