/**
 * GraphModel — Modèle de données du graphe de dépendances.
 * Types de nœuds : ClassNode, ServiceNode, ExternalNode
 * Types d'arêtes : CALLS, DEPENDS_ON, JNDI_LOOKUP, TRANSACTION_WITH,
 *                  EMITS_EVENT, SOAP_CALLS, DB_ACCESS, SHARES_DTO
 * Format de stockage : JSON Graph Format (JGF)
 * Compatible : Cytoscape.js, Gephi, yEd, GraphML export
 *
 * @author Compleo
 */

// ─── Edge Types & Weights ───────────────────────────────────────────────────

export type EdgeType =
  | "CALLS"
  | "DEPENDS_ON"
  | "JNDI_LOOKUP"
  | "TRANSACTION_WITH"
  | "EMITS_EVENT"
  | "SOAP_CALLS"
  | "DB_ACCESS"
  | "SHARES_DTO";

export const EDGE_WEIGHTS: Record<EdgeType, number> = {
  CALLS: 3,
  DEPENDS_ON: 2,
  JNDI_LOOKUP: 1,
  TRANSACTION_WITH: 2,
  EMITS_EVENT: 1,
  SOAP_CALLS: 1,
  DB_ACCESS: 2,
  SHARES_DTO: 2,
};

// ─── Node Types ─────────────────────────────────────────────────────────────

export type NodeType = "CLASS" | "SERVICE" | "EXTERNAL";

export type TechnologyType =
  | "EJB_3X"
  | "EJB_2X"
  | "SERVLET"
  | "JSP"
  | "STRUTS"
  | "SOAP"
  | "JMS"
  | "BATCH_JSR352"
  | "JDBC"
  | "JPA"
  | "UNKNOWN";

export interface ClassNode {
  id: string;
  type: "CLASS";
  className: string;
  packageName: string;
  role: string;
  domain: string;
  linesOfCode: number;
  complexity: number;
  technologyType: TechnologyType;
  sourceFile: string;
}

export interface ServiceNode {
  id: string;
  type: "SERVICE";
  serviceName: string;
  domain: string;
  methods: string[];
  dependencies: string[];
}

export interface ExternalNode {
  id: string;
  type: "EXTERNAL";
  systemName: string;
  externalType: "DATABASE" | "QUEUE" | "WEBSERVICE" | "FILE_SYSTEM" | "CACHE";
  protocol: string;
}

export type GraphNode = ClassNode | ServiceNode | ExternalNode;

// ─── Edge ───────────────────────────────────────────────────────────────────

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: EdgeType;
  weight: number;
  label?: string;
  metadata?: Record<string, string>;
}

// ─── Node Metrics ───────────────────────────────────────────────────────────

export interface NodeMetrics {
  nodeId: string;
  inDegree: number;
  outDegree: number;
  betweenness: number;
  cohesion: number;
}

// ─── Graph Metrics ──────────────────────────────────────────────────────────

export interface GraphMetrics {
  totalNodes: number;
  totalEdges: number;
  avgDegree: number;
  maxDegree: number;
  connectedComponents: number;
  cyclicDependencies: string[][];
}

// ─── Dependency Graph ───────────────────────────────────────────────────────

export interface DependencyGraph {
  projectName: string;
  createdAt: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  nodeMetrics: NodeMetrics[];
  graphMetrics: GraphMetrics;
}

// ─── JSON Graph Format (JGF) ────────────────────────────────────────────────

export interface JGFGraph {
  graph: {
    id: string;
    type: "directed";
    label: string;
    metadata: {
      projectName: string;
      createdAt: string;
      totalNodes: number;
      totalEdges: number;
    };
    nodes: Record<
      string,
      {
        label: string;
        metadata: Record<string, unknown>;
      }
    >;
    edges: Array<{
      source: string;
      target: string;
      relation: string;
      metadata: {
        weight: number;
        label?: string;
      };
    }>;
  };
}

// ─── Cytoscape.js Format ────────────────────────────────────────────────────

export interface CytoscapeElement {
  data: Record<string, unknown>;
  group: "nodes" | "edges";
  classes?: string;
}

export interface CytoscapeGraph {
  elements: CytoscapeElement[];
}

// ─── GraphML Format ─────────────────────────────────────────────────────────

export interface GraphMLExport {
  xml: string;
  nodeCount: number;
  edgeCount: number;
}

// ─── Domain Map (output of DomainClusterer) ─────────────────────────────────

export interface DomainCluster {
  domainId: string;
  classes: string[];
  cohesion: number;
  couplage: number;
  warnings: string[];
}

export type DomainMap = DomainCluster[];

// ─── Legacy Architecture (output of ArchitectureDiscovery) ──────────────────

export interface FunctionalModule {
  name: string;
  domain: string;
  classes: string[];
  entryPoints: string[];
  externalDeps: string[];
}

export interface LegacyArchitecture {
  entryPoints: string[];
  exitPoints: string[];
  criticalPaths: string[][];
  functionalModules: FunctionalModule[];
  externalIntegrations: string[];
}

// ─── Microservice Proposal (output of MicroserviceExtractor) ────────────────

export interface ExposedAPI {
  method: string;
  url: string;
  description: string;
}

export interface ConsumedService {
  service: string;
  reason: string;
  className: string;
}

export interface MicroserviceProposal {
  name: string;
  domain: string;
  classes: string[];
  exposedAPIs: ExposedAPI[];
  consumedServices: ConsumedService[];
  dataStore: string;
  events: {
    produces: string[];
    consumes: string[];
  };
}

// ─── Utility functions ──────────────────────────────────────────────────────

export function getEdgeWeight(type: EdgeType): number {
  return EDGE_WEIGHTS[type];
}

export function createNodeId(className: string, packageName: string): string {
  return `${packageName}.${className}`;
}

export function createEdgeId(source: string, target: string, type: EdgeType): string {
  return `${source}--${type}-->${target}`;
}
