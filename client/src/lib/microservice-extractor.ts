/**
 * Java Legacy Modernizer Platform — Moteur d'extraction de microservices.
 * Analyse les dépendances entre classes/services pour proposer un découpage
 * en microservices basé sur les bounded contexts détectés.
 *
 * Fonctionnalités :
 * - Graphe de dépendances entre services
 * - Détection de bounded contexts (clustering)
 * - Cartographie des communications inter-services
 * - Proposition de décomposition en microservices
 * - Estimation de complexité par microservice
 *
 * @author Hamza NORDINE
 * @version 2.0.0
 */

import type { ExtendedAnalysisReport, TechnologyDetection, LegacyTechnology } from "./legacy-analyzer";

// ============================================================
// Types
// ============================================================

export interface ServiceNode {
  id: string;
  className: string;
  technologies: LegacyTechnology[];
  methods: string[];
  dependencies: string[];
  incomingDeps: string[];
  complexity: number; // 0-100
  linesOfCode: number;
  domain: string;
}

export interface DependencyEdge {
  source: string;
  target: string;
  type: "injection" | "jndi" | "rmi" | "http" | "message" | "data";
  weight: number;
  label: string;
}

export interface BoundedContext {
  id: string;
  name: string;
  services: string[];
  technologies: LegacyTechnology[];
  primaryDomain: string;
  complexity: number;
  estimatedTeamSize: number;
  communicationPatterns: CommunicationPattern[];
}

export interface CommunicationPattern {
  from: string;
  to: string;
  type: "sync-rest" | "async-kafka" | "event-driven" | "shared-db" | "saga";
  description: string;
}

export interface MicroserviceProposal {
  id: string;
  name: string;
  description: string;
  boundedContext: string;
  services: string[];
  apis: ApiEndpoint[];
  events: EventDefinition[];
  dataStores: DataStore[];
  dependencies: string[];
  estimatedEffortDays: number;
  priority: "high" | "medium" | "low";
  technologies: string[];
}

export interface ApiEndpoint {
  method: string;
  path: string;
  description: string;
  sourceMethod: string;
}

export interface EventDefinition {
  name: string;
  type: "published" | "consumed";
  topic: string;
  payload: string;
}

export interface DataStore {
  name: string;
  type: "postgresql" | "mongodb" | "redis" | "elasticsearch";
  entities: string[];
  reason: string;
}

export interface MicroserviceExtractionResult {
  nodes: ServiceNode[];
  edges: DependencyEdge[];
  boundedContexts: BoundedContext[];
  proposals: MicroserviceProposal[];
  dependencyMatrix: string[][];
  summary: ExtractionSummary;
}

export interface ExtractionSummary {
  totalServices: number;
  totalDependencies: number;
  boundedContextsCount: number;
  proposedMicroservices: number;
  totalEstimatedEffort: number;
  couplingScore: number; // 0-100 (lower is better)
  cohesionScore: number; // 0-100 (higher is better)
  recommendations: string[];
}

// ============================================================
// Main Extraction Function
// ============================================================

export function extractMicroservices(
  reports: ExtendedAnalysisReport[]
): MicroserviceExtractionResult {
  // Step 1: Build service nodes
  const nodes = buildServiceNodes(reports);

  // Step 2: Build dependency edges
  const edges = buildDependencyEdges(reports, nodes);

  // Step 3: Detect bounded contexts via clustering
  const boundedContexts = detectBoundedContexts(nodes, edges);

  // Step 4: Generate microservice proposals
  const proposals = generateProposals(boundedContexts, nodes, edges);

  // Step 5: Build dependency matrix
  const dependencyMatrix = buildDependencyMatrix(nodes, edges);

  // Step 6: Calculate summary
  const summary = calculateSummary(nodes, edges, boundedContexts, proposals);

  return {
    nodes,
    edges,
    boundedContexts,
    proposals,
    dependencyMatrix,
    summary,
  };
}

// ============================================================
// Step 1: Build Service Nodes
// ============================================================

function extractMethodNames(report: ExtendedAnalysisReport): string[] {
  const methods: string[] = [];
  const seen = new Set<string>();
  for (const det of report.ejbDetections) {
    const match = det.rawCode.match(/(public|protected)\s+\w+\s+(\w+)\s*\(/);
    if (match && !seen.has(match[2])) { seen.add(match[2]); methods.push(match[2]); }
  }
  for (const s of report.soapDetections) {
    if (s.operationName && !seen.has(s.operationName)) { seen.add(s.operationName); methods.push(s.operationName); }
  }
  if (methods.length === 0) {
    methods.push("execute");
  }
  return methods;
}

function buildServiceNodes(reports: ExtendedAnalysisReport[]): ServiceNode[] {
  const nodes: ServiceNode[] = [];
  const seen = new Set<string>();

  for (const report of reports) {
    if (seen.has(report.className)) continue;
    seen.add(report.className);

    const allDetections = [
      ...report.ejbDetections,
      ...report.servletDetections.map(s => ({
        technology: "servlet" as LegacyTechnology,
        pattern: "Servlet",
        description: s.className,
        lineNumber: s.lineNumber,
        rawCode: "",
        severity: "info" as const,
        modernTarget: "Spring REST",
      })),
      ...report.soapDetections.map(s => ({
        technology: "soap" as LegacyTechnology,
        pattern: "SOAP",
        description: s.operationName || s.serviceName || "",
        lineNumber: s.lineNumber,
        rawCode: "",
        severity: "info" as const,
        modernTarget: "REST API",
      })),
    ];

    const techs = Array.from(new Set(
      allDetections.map(d => d.technology)
    ));

    const methods = extractMethodNames(report);
    const deps = extractDependencies(report);
    const domain = inferDomain(report.className, methods);
    const complexity = calculateNodeComplexity(report);

    nodes.push({
      id: report.className,
      className: report.className,
      technologies: techs,
      methods,
      dependencies: deps,
      incomingDeps: [],
      complexity,
      linesOfCode: estimateLines(report),
      domain,
    });
  }

  // Fill incoming dependencies
  for (const node of nodes) {
    for (const dep of node.dependencies) {
      const target = nodes.find(n => n.id === dep);
      if (target && !target.incomingDeps.includes(node.id)) {
        target.incomingDeps.push(node.id);
      }
    }
  }

  return nodes;
}

function extractDependencies(report: ExtendedAnalysisReport): string[] {
  const deps: string[] = [];
  const seen = new Set<string>();

  for (const det of report.ejbDetections) {
    // Extract class names from @EJB injections
    const classMatch = det.rawCode.match(/(\w+Service\w*|\w+Bean\w*|\w+DAO\w*|\w+Repository\w*)/g);
    if (classMatch) {
      for (const cls of classMatch) {
        if (cls !== report.className && !seen.has(cls)) {
          seen.add(cls);
          deps.push(cls);
        }
      }
    }

    // Extract from JNDI lookups
    const jndiMatch = det.rawCode.match(/lookup\s*\(\s*["'].*?\/(\w+)["']\s*\)/);
    if (jndiMatch && !seen.has(jndiMatch[1])) {
      seen.add(jndiMatch[1]);
      deps.push(jndiMatch[1]);
    }
  }

  return deps;
}

function inferDomain(className: string, methods: string[]): string {
  const lower = className.toLowerCase();
  const allText = (lower + " " + methods.join(" ")).toLowerCase();

  const domains: [string, string[]][] = [
    ["Account", ["account", "balance", "deposit", "withdraw", "ledger"]],
    ["Payment", ["payment", "pay", "transfer", "transaction", "wire"]],
    ["Customer", ["customer", "client", "user", "profile", "kyc"]],
    ["Loan", ["loan", "credit", "mortgage", "interest", "amortization"]],
    ["Card", ["card", "visa", "mastercard", "debit", "credit"]],
    ["Notification", ["notification", "alert", "email", "sms", "push"]],
    ["Audit", ["audit", "log", "trace", "compliance", "report"]],
    ["Security", ["security", "auth", "login", "token", "permission"]],
    ["Order", ["order", "basket", "cart", "checkout", "invoice"]],
    ["Inventory", ["inventory", "stock", "warehouse", "product"]],
  ];

  for (const [domain, keywords] of domains) {
    if (keywords.some(k => allText.includes(k))) return domain;
  }

  return "Core";
}

function calculateNodeComplexity(report: ExtendedAnalysisReport): number {
  let score = 0;
  const techCount = report.summary.technologiesDetected.length;
  score += Math.min(techCount * 15, 45);
  score += Math.min(report.summary.totalDetections * 3, 30);
  if (report.summary.technologiesDetected.includes("jms")) score += 10;
  if (report.summary.technologiesDetected.includes("batch")) score += 10;
  if (report.summary.technologiesDetected.includes("soap")) score += 5;
  return Math.min(score, 100);
}

function estimateLines(report: ExtendedAnalysisReport): number {
  return 100 + report.summary.totalDetections * 20;
}

// ============================================================
// Step 2: Build Dependency Edges
// ============================================================

function buildDependencyEdges(
  reports: ExtendedAnalysisReport[],
  nodes: ServiceNode[]
): DependencyEdge[] {
  const edges: DependencyEdge[] = [];
  const edgeSet = new Set<string>();

  for (const node of nodes) {
    for (const dep of node.dependencies) {
      const key = `${node.id}->${dep}`;
      if (edgeSet.has(key)) continue;
      edgeSet.add(key);

      const report = reports.find(r => r.className === node.id);
      const type = inferEdgeType(report, dep);

      edges.push({
        source: node.id,
        target: dep,
        type,
        weight: type === "injection" ? 3 : type === "message" ? 1 : 2,
        label: `${node.id} → ${dep}`,
      });
    }
  }

  return edges;
}

function inferEdgeType(
  report: ExtendedAnalysisReport | undefined,
  dep: string
): DependencyEdge["type"] {
  if (!report) return "injection";

  for (const det of report.ejbDetections) {
    if (det.rawCode.includes(dep)) {
      if (det.pattern.includes("JNDI")) return "jndi";
      if (det.pattern.includes("EJB")) return "injection";
    }
  }

  if (report.jmsDetections.length > 0) return "message";
  return "injection";
}

// ============================================================
// Step 3: Detect Bounded Contexts
// ============================================================

function detectBoundedContexts(
  nodes: ServiceNode[],
  edges: DependencyEdge[]
): BoundedContext[] {
  // Group by domain
  const domainGroups = new Map<string, ServiceNode[]>();
  for (const node of nodes) {
    const existing = domainGroups.get(node.domain) || [];
    existing.push(node);
    domainGroups.set(node.domain, existing);
  }

  const contexts: BoundedContext[] = [];
  let ctxId = 1;

  for (const [domain, domainNodes] of Array.from(domainGroups.entries())) {
    // Check if domain should be split further (high internal coupling check)
    const serviceIds = domainNodes.map(n => n.id);
    const internalEdges = edges.filter(
      e => serviceIds.includes(e.source) && serviceIds.includes(e.target)
    );
    const externalEdges = edges.filter(
      e => (serviceIds.includes(e.source) && !serviceIds.includes(e.target)) ||
           (!serviceIds.includes(e.source) && serviceIds.includes(e.target))
    );

    const allTechs = Array.from(new Set(
      domainNodes.flatMap(n => n.technologies)
    ));

    const complexity = Math.round(
      domainNodes.reduce((sum, n) => sum + n.complexity, 0) / domainNodes.length
    );

    // Determine communication patterns
    const commPatterns: CommunicationPattern[] = [];
    for (const edge of externalEdges) {
      const isSource = serviceIds.includes(edge.source);
      commPatterns.push({
        from: isSource ? domain : inferDomainFromId(edge.source, nodes),
        to: isSource ? inferDomainFromId(edge.target, nodes) : domain,
        type: edge.type === "message" ? "async-kafka" : "sync-rest",
        description: `${edge.source} → ${edge.target}`,
      });
    }

    contexts.push({
      id: `bc-${ctxId++}`,
      name: `${domain} Context`,
      services: serviceIds,
      technologies: allTechs,
      primaryDomain: domain,
      complexity,
      estimatedTeamSize: Math.max(1, Math.ceil(domainNodes.length / 3)),
      communicationPatterns: commPatterns,
    });
  }

  return contexts;
}

function inferDomainFromId(id: string, nodes: ServiceNode[]): string {
  const node = nodes.find(n => n.id === id);
  return node?.domain || "Unknown";
}

// ============================================================
// Step 4: Generate Microservice Proposals
// ============================================================

function generateProposals(
  contexts: BoundedContext[],
  nodes: ServiceNode[],
  edges: DependencyEdge[]
): MicroserviceProposal[] {
  const proposals: MicroserviceProposal[] = [];
  let msId = 1;

  for (const ctx of contexts) {
    const ctxNodes = nodes.filter(n => ctx.services.includes(n.id));
    const ctxEdges = edges.filter(
      e => ctx.services.includes(e.source) || ctx.services.includes(e.target)
    );

    // Generate APIs from methods
    const apis: ApiEndpoint[] = [];
    for (const node of ctxNodes) {
      for (const method of node.methods) {
        const httpMethod = inferHttpMethod(method);
        const path = `/api/v1/${camelToKebab(ctx.primaryDomain.toLowerCase())}s/${camelToKebab(method)}`;
        apis.push({
          method: httpMethod,
          path,
          description: `Migre depuis ${node.className}.${method}()`,
          sourceMethod: `${node.className}.${method}`,
        });
      }
    }

    // Generate events from async dependencies
    const events: EventDefinition[] = [];
    const asyncEdges = ctxEdges.filter(e => e.type === "message");
    for (const edge of asyncEdges) {
      if (ctx.services.includes(edge.source)) {
        events.push({
          name: `${ctx.primaryDomain}Updated`,
          type: "published",
          topic: `${camelToKebab(ctx.primaryDomain)}-events`,
          payload: `${ctx.primaryDomain}Event`,
        });
      }
      if (ctx.services.includes(edge.target)) {
        events.push({
          name: `${ctx.primaryDomain}EventReceived`,
          type: "consumed",
          topic: `${camelToKebab(ctx.primaryDomain)}-events`,
          payload: `${ctx.primaryDomain}Event`,
        });
      }
    }

    // Determine data stores
    const dataStores: DataStore[] = [];
    const hasPersistence = ctxNodes.some(n =>
      n.technologies.includes("jdbc") || n.technologies.includes("hibernate")
    );
    if (hasPersistence) {
      dataStores.push({
        name: `${ctx.primaryDomain.toLowerCase()}_db`,
        type: "postgresql",
        entities: ctxNodes.map(n => n.className),
        reason: "Base de donnees relationnelle pour les entites du domaine",
      });
    }

    // External dependencies
    const externalDeps = ctxEdges
      .filter(e => ctx.services.includes(e.source) && !ctx.services.includes(e.target))
      .map(e => e.target);

    // Estimate effort
    const effort = ctxNodes.reduce((sum, n) => sum + n.complexity * 0.5, 0) + apis.length * 0.5;

    // Priority based on complexity and dependencies
    const priority: "high" | "medium" | "low" =
      ctx.complexity > 60 || ctxNodes.length > 5 ? "high" :
      ctx.complexity > 30 || ctxNodes.length > 2 ? "medium" : "low";

    const techSet = new Set<string>();
    techSet.add("Spring Boot 3");
    techSet.add("Spring Web");
    if (hasPersistence) { techSet.add("Spring Data JPA"); techSet.add("PostgreSQL"); }
    if (asyncEdges.length > 0) techSet.add("Spring Kafka");
    if (ctxNodes.some(n => n.technologies.includes("batch"))) techSet.add("Spring Batch");

    proposals.push({
      id: `ms-${msId++}`,
      name: `${ctx.primaryDomain} Service`,
      description: `Microservice gerant le domaine ${ctx.primaryDomain}. Regroupe ${ctxNodes.length} service(s) legacy.`,
      boundedContext: ctx.id,
      services: ctx.services,
      apis,
      events,
      dataStores,
      dependencies: Array.from(new Set(externalDeps)),
      estimatedEffortDays: Math.round(effort),
      priority,
      technologies: Array.from(techSet),
    });
  }

  return proposals;
}

function inferHttpMethod(methodName: string): string {
  const lower = methodName.toLowerCase();
  if (lower.startsWith("get") || lower.startsWith("find") || lower.startsWith("list") || lower.startsWith("search")) return "GET";
  if (lower.startsWith("create") || lower.startsWith("add") || lower.startsWith("insert")) return "POST";
  if (lower.startsWith("update") || lower.startsWith("modify") || lower.startsWith("set")) return "PUT";
  if (lower.startsWith("delete") || lower.startsWith("remove")) return "DELETE";
  return "POST";
}

// ============================================================
// Step 5: Dependency Matrix
// ============================================================

function buildDependencyMatrix(
  nodes: ServiceNode[],
  edges: DependencyEdge[]
): string[][] {
  const ids = nodes.map(n => n.id);
  const matrix: string[][] = [];

  // Header row
  matrix.push(["", ...ids]);

  for (const sourceId of ids) {
    const row = [sourceId];
    for (const targetId of ids) {
      if (sourceId === targetId) {
        row.push("-");
      } else {
        const edge = edges.find(e => e.source === sourceId && e.target === targetId);
        row.push(edge ? edge.type.charAt(0).toUpperCase() : "");
      }
    }
    matrix.push(row);
  }

  return matrix;
}

// ============================================================
// Step 6: Summary
// ============================================================

function calculateSummary(
  nodes: ServiceNode[],
  edges: DependencyEdge[],
  contexts: BoundedContext[],
  proposals: MicroserviceProposal[]
): ExtractionSummary {
  const totalServices = nodes.length;
  const totalDeps = edges.length;

  // Coupling: ratio of external edges to total possible edges
  const maxEdges = totalServices * (totalServices - 1);
  const couplingScore = maxEdges > 0 ? Math.round((totalDeps / maxEdges) * 100) : 0;

  // Cohesion: ratio of internal edges within contexts to total edges
  let internalEdges = 0;
  for (const ctx of contexts) {
    internalEdges += edges.filter(
      e => ctx.services.includes(e.source) && ctx.services.includes(e.target)
    ).length;
  }
  const cohesionScore = totalDeps > 0 ? Math.round((internalEdges / totalDeps) * 100) : 100;

  const totalEffort = proposals.reduce((sum, p) => sum + p.estimatedEffortDays, 0);

  const recommendations: string[] = [];

  if (couplingScore > 50) {
    recommendations.push("Couplage eleve detecte. Envisager l'utilisation de patterns asynchrones (events, CQRS) pour reduire les dependances directes.");
  }
  if (cohesionScore < 40) {
    recommendations.push("Cohesion faible. Revoir le decoupage des bounded contexts pour regrouper les services fortement lies.");
  }
  if (proposals.length > 10) {
    recommendations.push("Nombre eleve de microservices proposes. Envisager de fusionner les services a faible complexite pour reduire la charge operationnelle.");
  }
  if (proposals.some(p => p.events.length > 0)) {
    recommendations.push("Communication asynchrone detectee. Implementer un Event Store pour la tracabilite et le replay des evenements.");
  }
  if (totalEffort > 100) {
    recommendations.push("Effort total significatif. Prioriser la migration par vagues en commencant par les services a haute priorite.");
  }
  if (nodes.some(n => n.technologies.includes("batch"))) {
    recommendations.push("Traitements batch detectes. Deployer les jobs Spring Batch dans des pods Kubernetes dedies avec auto-scaling.");
  }

  if (recommendations.length === 0) {
    recommendations.push("Architecture bien structuree. Le decoupage en microservices est coherent avec les domaines metier detectes.");
  }

  return {
    totalServices,
    totalDependencies: totalDeps,
    boundedContextsCount: contexts.length,
    proposedMicroservices: proposals.length,
    totalEstimatedEffort: totalEffort,
    couplingScore,
    cohesionScore,
    recommendations,
  };
}

// ============================================================
// Utility
// ============================================================

function camelToKebab(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}
