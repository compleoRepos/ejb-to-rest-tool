/**
 * MicroserviceExtractor — Extraction de microservices depuis le graphe.
 * Partitionnement basé sur les domaines, fusion si couplage > 0.7,
 * découpe si > 15 classes, nommage automatique.
 *
 * @author Hamza NORDINE
 */

import type {
  DependencyGraph,
  ClassNode,
  ExternalNode,
  DomainMap,
  DomainCluster,
} from "./model/GraphModel";
import type { ArchitectureReport, FunctionalModule, EntryPoint, ExitPoint } from "./ArchitectureDiscovery";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MicroserviceCandidate {
  id: string;
  name: string;
  description: string;
  boundedContext: string;
  classes: string[];
  classDetails: Array<{
    nodeId: string;
    className: string;
    role: string;
    domain: string;
  }>;
  endpoints: MicroserviceEndpoint[];
  dependencies: MicroserviceDependency[];
  databases: string[];
  queues: string[];
  metrics: {
    classCount: number;
    cohesion: number;
    coupling: number;
    complexity: number;
    linesOfCode: number;
  };
  springBootConfig: {
    artifactId: string;
    port: number;
    profiles: string[];
    dependencies: string[];
  };
}

export interface MicroserviceEndpoint {
  method: string;
  path: string;
  description: string;
  sourceClass: string;
  protocol: "REST" | "GRPC" | "EVENT" | "SOAP";
}

export interface MicroserviceDependency {
  targetServiceId: string;
  targetServiceName: string;
  type: "SYNC" | "ASYNC" | "DB_SHARED";
  protocol: string;
  description: string;
}

export interface ExtractionResult {
  projectName: string;
  microservices: MicroserviceCandidate[];
  sharedLibrary: {
    name: string;
    classes: string[];
    description: string;
  };
  apiGateway: {
    routes: Array<{
      path: string;
      targetService: string;
      method: string;
    }>;
  };
  summary: {
    totalMicroservices: number;
    totalClasses: number;
    totalEndpoints: number;
    totalDependencies: number;
    avgCohesion: number;
    avgCoupling: number;
    sharedClassCount: number;
  };
  warnings: string[];
}

// ─── Configuration ──────────────────────────────────────────────────────────

const MAX_CLASSES_PER_SERVICE = 15;
const MIN_CLASSES_PER_SERVICE = 2;
const FUSION_COUPLING_THRESHOLD = 0.7;
const BASE_PORT = 8081;

// ─── MicroserviceExtractor ──────────────────────────────────────────────────

export class MicroserviceExtractor {
  /**
   * Extrait les microservices candidats depuis le graphe, le clustering et le rapport d'architecture.
   */
  extract(
    graph: DependencyGraph,
    domainMap: DomainMap,
    archReport: ArchitectureReport
  ): ExtractionResult {
    const warnings: string[] = [];

    // ── Step 1: Partitionnement initial basé sur les domaines ────────────
    let candidates = this.initialPartition(graph, domainMap, archReport);

    // ── Step 2: Fusion si couplage > 0.7 ────────────────────────────────
    candidates = this.fusionPass(candidates, graph, warnings);

    // ── Step 3: Découpe si > 15 classes ─────────────────────────────────
    candidates = this.splitPass(candidates, graph, warnings);

    // ── Step 4: Extraire la shared library ──────────────────────────────
    const sharedLibrary = this.extractSharedLibrary(candidates, graph);

    // ── Step 5: Nommage et configuration Spring Boot ────────────────────
    candidates = this.assignNamesAndConfig(candidates);

    // ── Step 6: Générer les endpoints ───────────────────────────────────
    candidates = this.generateEndpoints(candidates, archReport);

    // ── Step 7: Calculer les dépendances inter-services ─────────────────
    candidates = this.computeDependencies(candidates, graph);

    // ── Step 8: Générer l'API Gateway ───────────────────────────────────
    const apiGateway = this.generateApiGateway(candidates);

    // ── Summary ─────────────────────────────────────────────────────────
    const totalEndpoints = candidates.reduce((s, c) => s + c.endpoints.length, 0);
    const totalDeps = candidates.reduce((s, c) => s + c.dependencies.length, 0);
    const avgCohesion =
      candidates.length > 0
        ? candidates.reduce((s, c) => s + c.metrics.cohesion, 0) / candidates.length
        : 0;
    const avgCoupling =
      candidates.length > 0
        ? candidates.reduce((s, c) => s + c.metrics.coupling, 0) / candidates.length
        : 0;

    return {
      projectName: graph.projectName,
      microservices: candidates,
      sharedLibrary,
      apiGateway,
      summary: {
        totalMicroservices: candidates.length,
        totalClasses: candidates.reduce((s, c) => s + c.classes.length, 0),
        totalEndpoints,
        totalDependencies: totalDeps,
        avgCohesion: Math.round(avgCohesion * 1000) / 1000,
        avgCoupling: Math.round(avgCoupling * 1000) / 1000,
        sharedClassCount: sharedLibrary.classes.length,
      },
      warnings,
    };
  }

  // ─── Step 1: Initial Partition ──────────────────────────────────────────

  private initialPartition(
    graph: DependencyGraph,
    domainMap: DomainMap,
    archReport: ArchitectureReport
  ): MicroserviceCandidate[] {
    const candidates: MicroserviceCandidate[] = [];

    for (const cluster of domainMap) {
      if (cluster.classes.length === 0) continue;

      const classDetails = cluster.classes.map((nodeId) => {
        const node = graph.nodes.find((n) => n.id === nodeId);
        if (node && node.type === "CLASS") {
          const cn = node as ClassNode;
          return { nodeId, className: cn.className, role: cn.role, domain: cn.domain };
        }
        return { nodeId, className: nodeId, role: "UNKNOWN", domain: cluster.domainId };
      });

      // Compute metrics
      const classSet = new Set(cluster.classes);
      let internalEdges = 0;
      let externalEdges = 0;
      let totalLOC = 0;
      let totalComplexity = 0;

      for (const edge of graph.edges) {
        const srcIn = classSet.has(edge.source);
        const tgtIn = classSet.has(edge.target);
        if (srcIn && tgtIn) internalEdges++;
        else if (srcIn || tgtIn) externalEdges++;
      }

      for (const nodeId of cluster.classes) {
        const node = graph.nodes.find((n) => n.id === nodeId);
        if (node && node.type === "CLASS") {
          totalLOC += (node as ClassNode).linesOfCode;
          totalComplexity += (node as ClassNode).complexity;
        }
      }

      const totalEdges = internalEdges + externalEdges;
      const cohesion = totalEdges > 0 ? internalEdges / totalEdges : 0;
      const coupling = totalEdges > 0 ? externalEdges / totalEdges : 0;

      // Databases and queues
      const databases: string[] = [];
      const queues: string[] = [];
      for (const edge of graph.edges) {
        if (!classSet.has(edge.source)) continue;
        const target = graph.nodes.find((n) => n.id === edge.target);
        if (target && target.type === "EXTERNAL") {
          const ext = target as ExternalNode;
          if (ext.externalType === "DATABASE") databases.push(ext.systemName);
          if (ext.externalType === "QUEUE") queues.push(ext.systemName);
        }
      }

      candidates.push({
        id: `svc-${cluster.domainId.toLowerCase().replace(/[_\s]+/g, "-")}`,
        name: "",
        description: "",
        boundedContext: cluster.domainId,
        classes: cluster.classes,
        classDetails,
        endpoints: [],
        dependencies: [],
        databases: [...new Set(databases)],
        queues: [...new Set(queues)],
        metrics: {
          classCount: cluster.classes.length,
          cohesion: Math.round(cohesion * 1000) / 1000,
          coupling: Math.round(coupling * 1000) / 1000,
          complexity: totalComplexity,
          linesOfCode: totalLOC,
        },
        springBootConfig: {
          artifactId: "",
          port: 0,
          profiles: ["dev", "prod"],
          dependencies: [],
        },
      });
    }

    return candidates;
  }

  // ─── Step 2: Fusion Pass ────────────────────────────────────────────────

  private fusionPass(
    candidates: MicroserviceCandidate[],
    graph: DependencyGraph,
    warnings: string[]
  ): MicroserviceCandidate[] {
    let merged = true;

    while (merged) {
      merged = false;

      for (let i = 0; i < candidates.length; i++) {
        for (let j = i + 1; j < candidates.length; j++) {
          const coupling = this.computeCouplingBetween(candidates[i], candidates[j], graph);

          if (coupling > FUSION_COUPLING_THRESHOLD) {
            warnings.push(
              `Fusion: "${candidates[i].boundedContext}" + "${candidates[j].boundedContext}" (couplage ${(coupling * 100).toFixed(1)}%)`
            );

            // Merge j into i
            candidates[i].classes.push(...candidates[j].classes);
            candidates[i].classDetails.push(...candidates[j].classDetails);
            candidates[i].databases.push(...candidates[j].databases);
            candidates[i].queues.push(...candidates[j].queues);
            candidates[i].boundedContext += `+${candidates[j].boundedContext}`;
            candidates[i].metrics.classCount = candidates[i].classes.length;

            candidates.splice(j, 1);
            merged = true;
            break;
          }
        }
        if (merged) break;
      }
    }

    return candidates;
  }

  // ─── Step 3: Split Pass ─────────────────────────────────────────────────

  private splitPass(
    candidates: MicroserviceCandidate[],
    graph: DependencyGraph,
    warnings: string[]
  ): MicroserviceCandidate[] {
    const result: MicroserviceCandidate[] = [];

    for (const candidate of candidates) {
      if (candidate.classes.length <= MAX_CLASSES_PER_SERVICE) {
        result.push(candidate);
        continue;
      }

      warnings.push(
        `Découpe: "${candidate.boundedContext}" (${candidate.classes.length} classes > ${MAX_CLASSES_PER_SERVICE})`
      );

      // Split by sub-roles
      const roleGroups = new Map<string, string[]>();
      for (const detail of candidate.classDetails) {
        const group = detail.role;
        if (!roleGroups.has(group)) roleGroups.set(group, []);
        roleGroups.get(group)!.push(detail.nodeId);
      }

      // Create sub-services
      let partIndex = 0;
      let currentClasses: string[] = [];

      for (const [role, classes] of roleGroups) {
        if (currentClasses.length + classes.length > MAX_CLASSES_PER_SERVICE && currentClasses.length > 0) {
          result.push(this.createSubService(candidate, currentClasses, graph, partIndex));
          partIndex++;
          currentClasses = [];
        }
        currentClasses.push(...classes);
      }

      if (currentClasses.length > 0) {
        result.push(this.createSubService(candidate, currentClasses, graph, partIndex));
      }
    }

    return result;
  }

  private createSubService(
    parent: MicroserviceCandidate,
    classes: string[],
    graph: DependencyGraph,
    index: number
  ): MicroserviceCandidate {
    const classDetails = parent.classDetails.filter((d) => classes.includes(d.nodeId));
    return {
      ...parent,
      id: `${parent.id}-part${index}`,
      boundedContext: `${parent.boundedContext}-part${index}`,
      classes,
      classDetails,
      metrics: {
        ...parent.metrics,
        classCount: classes.length,
      },
    };
  }

  // ─── Step 4: Shared Library ─────────────────────────────────────────────

  private extractSharedLibrary(
    candidates: MicroserviceCandidate[],
    graph: DependencyGraph
  ): ExtractionResult["sharedLibrary"] {
    // Classes referenced by multiple services → shared library
    const classServiceCount = new Map<string, number>();

    for (const candidate of candidates) {
      for (const cls of candidate.classes) {
        classServiceCount.set(cls, (classServiceCount.get(cls) || 0) + 1);
      }
    }

    // Also include VALUE_OBJECT, ENUM_TYPE, EXCEPTION_TYPE
    const sharedClasses: string[] = [];
    for (const node of graph.nodes) {
      if (node.type !== "CLASS") continue;
      const cn = node as ClassNode;
      if (cn.role === "VALUE_OBJECT" || cn.role === "ENUM_TYPE" || cn.role === "EXCEPTION_TYPE") {
        if (!sharedClasses.includes(node.id)) {
          sharedClasses.push(node.id);
        }
      }
    }

    // Add classes used by 2+ services
    for (const [cls, count] of classServiceCount) {
      if (count > 1 && !sharedClasses.includes(cls)) {
        sharedClasses.push(cls);
      }
    }

    return {
      name: `${graph.projectName}-common`,
      classes: sharedClasses,
      description: `Bibliothèque partagée : DTOs, enums, exceptions, utilitaires communs (${sharedClasses.length} classes)`,
    };
  }

  // ─── Step 5: Naming & Config ────────────────────────────────────────────

  private assignNamesAndConfig(candidates: MicroserviceCandidate[]): MicroserviceCandidate[] {
    const domainServiceNames: Record<string, string> = {
      "account-management": "account-service",
      "payment-processing": "payment-service",
      "credit-management": "credit-service",
      "kyc-compliance": "kyc-service",
      "card-management": "card-service",
      "batch-processing": "batch-service",
      "risk-management": "risk-service",
      "reporting": "reporting-service",
      "customer-management": "customer-service",
      "transfer-management": "transfer-service",
      unknown: "legacy-service",
    };

    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      const key = c.boundedContext.toLowerCase().replace(/[_\s]+/g, "-");
      const baseName = domainServiceNames[key] || `${key}-service`;

      c.name = baseName;
      c.description = `Microservice ${baseName} — Bounded Context: ${c.boundedContext}`;
      c.springBootConfig.artifactId = baseName;
      c.springBootConfig.port = BASE_PORT + i;

      // Infer Spring Boot dependencies
      const deps = ["spring-boot-starter-web", "spring-boot-starter-actuator"];
      if (c.databases.length > 0) deps.push("spring-boot-starter-data-jpa", "mysql-connector-java");
      if (c.queues.length > 0) deps.push("spring-boot-starter-amqp");
      c.springBootConfig.dependencies = deps;
    }

    return candidates;
  }

  // ─── Step 6: Endpoints ──────────────────────────────────────────────────

  private generateEndpoints(
    candidates: MicroserviceCandidate[],
    archReport: ArchitectureReport
  ): MicroserviceCandidate[] {
    for (const c of candidates) {
      const classSet = new Set(c.classes);

      // Generate REST endpoints from entry points
      for (const entry of archReport.entryPoints) {
        if (!classSet.has(entry.nodeId)) continue;

        const basePath = `/api/${c.name.replace("-service", "")}`;

        c.endpoints.push({
          method: "POST",
          path: `${basePath}/${entry.className.replace(/Bean|Service|EJB/gi, "").toLowerCase()}`,
          description: entry.description,
          sourceClass: entry.className,
          protocol: entry.type === "SOAP" ? "SOAP" : "REST",
        });
      }

      // If no entry points found, generate default CRUD endpoints
      if (c.endpoints.length === 0) {
        const basePath = `/api/${c.name.replace("-service", "")}`;
        c.endpoints.push({
          method: "GET",
          path: basePath,
          description: `Liste des ressources ${c.boundedContext}`,
          sourceClass: c.classDetails[0]?.className || "Unknown",
          protocol: "REST",
        });
      }
    }

    return candidates;
  }

  // ─── Step 7: Dependencies ───────────────────────────────────────────────

  private computeDependencies(
    candidates: MicroserviceCandidate[],
    graph: DependencyGraph
  ): MicroserviceCandidate[] {
    for (const source of candidates) {
      const sourceClassSet = new Set(source.classes);

      for (const target of candidates) {
        if (source.id === target.id) continue;
        const targetClassSet = new Set(target.classes);

        // Count edges from source to target
        let syncEdges = 0;
        let asyncEdges = 0;

        for (const edge of graph.edges) {
          if (!sourceClassSet.has(edge.source)) continue;
          if (!targetClassSet.has(edge.target)) continue;

          if (edge.type === "EMITS_EVENT") asyncEdges++;
          else syncEdges++;
        }

        if (syncEdges > 0) {
          source.dependencies.push({
            targetServiceId: target.id,
            targetServiceName: target.name,
            type: "SYNC",
            protocol: "REST/HTTP",
            description: `${syncEdges} appel(s) synchrone(s) vers ${target.name}`,
          });
        }

        if (asyncEdges > 0) {
          source.dependencies.push({
            targetServiceId: target.id,
            targetServiceName: target.name,
            type: "ASYNC",
            protocol: "AMQP/JMS",
            description: `${asyncEdges} message(s) asynchrone(s) vers ${target.name}`,
          });
        }
      }
    }

    return candidates;
  }

  // ─── Step 8: API Gateway ────────────────────────────────────────────────

  private generateApiGateway(candidates: MicroserviceCandidate[]): ExtractionResult["apiGateway"] {
    const routes: ExtractionResult["apiGateway"]["routes"] = [];

    for (const c of candidates) {
      for (const ep of c.endpoints) {
        routes.push({
          path: ep.path,
          targetService: `${c.name}:${c.springBootConfig.port}`,
          method: ep.method,
        });
      }
    }

    return { routes };
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  private computeCouplingBetween(
    a: MicroserviceCandidate,
    b: MicroserviceCandidate,
    graph: DependencyGraph
  ): number {
    const aSet = new Set(a.classes);
    const bSet = new Set(b.classes);
    let crossEdges = 0;
    let totalEdges = 0;

    for (const edge of graph.edges) {
      const srcA = aSet.has(edge.source);
      const srcB = bSet.has(edge.source);
      const tgtA = aSet.has(edge.target);
      const tgtB = bSet.has(edge.target);

      if (srcA || srcB || tgtA || tgtB) {
        totalEdges++;
        if ((srcA && tgtB) || (srcB && tgtA)) {
          crossEdges++;
        }
      }
    }

    return totalEdges > 0 ? crossEdges / totalEdges : 0;
  }
}
