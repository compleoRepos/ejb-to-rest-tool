/**
 * ArchitectureDiscovery — Découverte automatique de l'architecture.
 * Détecte entry/exit points, flux critiques, modules fonctionnels.
 *
 * @author Hamza NORDINE
 */

import type {
  DependencyGraph,
  ClassNode,
  ExternalNode,
  GraphEdge,
  DomainMap,
  DomainCluster,
} from "./model/GraphModel";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface EntryPoint {
  nodeId: string;
  className: string;
  type: "SERVLET" | "REST" | "SOAP" | "JMS" | "BATCH" | "TIMER" | "EJB_REMOTE";
  protocol: string;
  description: string;
}

export interface ExitPoint {
  nodeId: string;
  className: string;
  type: "DATABASE" | "QUEUE" | "WEBSERVICE" | "FILE" | "SMTP" | "EXTERNAL_SYSTEM";
  target: string;
  protocol: string;
}

export interface CriticalFlow {
  id: string;
  name: string;
  path: string[];
  entryPoint: EntryPoint;
  exitPoints: ExitPoint[];
  depth: number;
  transactional: boolean;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  riskFactors: string[];
}

export interface FunctionalModule {
  id: string;
  name: string;
  description: string;
  domains: string[];
  classes: string[];
  entryPoints: EntryPoint[];
  exitPoints: ExitPoint[];
  internalEdges: number;
  externalEdges: number;
  cohesion: number;
  coupling: number;
}

export interface ArchitectureReport {
  projectName: string;
  entryPoints: EntryPoint[];
  exitPoints: ExitPoint[];
  criticalFlows: CriticalFlow[];
  functionalModules: FunctionalModule[];
  summary: {
    totalEntryPoints: number;
    totalExitPoints: number;
    totalCriticalFlows: number;
    totalModules: number;
    highRiskFlows: number;
    avgModuleCohesion: number;
    avgModuleCoupling: number;
  };
}

// ─── ArchitectureDiscovery ──────────────────────────────────────────────────

export class ArchitectureDiscovery {
  /**
   * Analyse complète de l'architecture à partir du graphe et du clustering.
   */
  discover(graph: DependencyGraph, domainMap: DomainMap): ArchitectureReport {
    const entryPoints = this.findEntryPoints(graph);
    const exitPoints = this.findExitPoints(graph);
    const criticalFlows = this.traceCriticalFlows(graph, entryPoints, exitPoints);
    const functionalModules = this.buildFunctionalModules(graph, domainMap, entryPoints, exitPoints);

    const highRiskFlows = criticalFlows.filter((f) => f.riskLevel === "HIGH" || f.riskLevel === "CRITICAL").length;
    const avgCohesion =
      functionalModules.length > 0
        ? functionalModules.reduce((s, m) => s + m.cohesion, 0) / functionalModules.length
        : 0;
    const avgCoupling =
      functionalModules.length > 0
        ? functionalModules.reduce((s, m) => s + m.coupling, 0) / functionalModules.length
        : 0;

    return {
      projectName: graph.projectName,
      entryPoints,
      exitPoints,
      criticalFlows,
      functionalModules,
      summary: {
        totalEntryPoints: entryPoints.length,
        totalExitPoints: exitPoints.length,
        totalCriticalFlows: criticalFlows.length,
        totalModules: functionalModules.length,
        highRiskFlows,
        avgModuleCohesion: Math.round(avgCohesion * 1000) / 1000,
        avgModuleCoupling: Math.round(avgCoupling * 1000) / 1000,
      },
    };
  }

  // ─── Entry Points Detection ─────────────────────────────────────────────

  private findEntryPoints(graph: DependencyGraph): EntryPoint[] {
    const entryPoints: EntryPoint[] = [];
    const classNodes = graph.nodes.filter((n) => n.type === "CLASS") as ClassNode[];

    for (const node of classNodes) {
      // Nœuds sans arêtes entrantes (ou peu) = entry points potentiels
      const inEdges = graph.edges.filter((e) => e.target === node.id && e.type !== "SHARES_DTO");
      const className = node.className;
      const role = node.role;
      const tech = node.technologyType;

      // Servlet / REST endpoint
      if (tech === "SERVLET" || className.includes("Servlet") || className.includes("Controller")) {
        entryPoints.push({
          nodeId: node.id,
          className,
          type: "SERVLET",
          protocol: "HTTP",
          description: `Servlet/Controller HTTP — ${className}`,
        });
        continue;
      }

      // SOAP WebService
      if (tech === "SOAP" || className.includes("WebService") || className.includes("Endpoint")) {
        entryPoints.push({
          nodeId: node.id,
          className,
          type: "SOAP",
          protocol: "SOAP/HTTP",
          description: `Service SOAP — ${className}`,
        });
        continue;
      }

      // JMS MessageDriven
      if (tech === "JMS" || className.includes("MessageDriven") || className.includes("MDB")) {
        entryPoints.push({
          nodeId: node.id,
          className,
          type: "JMS",
          protocol: "JMS",
          description: `Message-Driven Bean — ${className}`,
        });
        continue;
      }

      // Batch / JSR-352
      if (tech === "BATCH_JSR352" || className.includes("Batch") || className.includes("Job") || className.includes("Tasklet")) {
        entryPoints.push({
          nodeId: node.id,
          className,
          type: "BATCH",
          protocol: "JSR-352",
          description: `Job Batch — ${className}`,
        });
        continue;
      }

      // EJB Remote (entry point if no incoming CALLS)
      if ((tech === "EJB_3X" || tech === "EJB_2X") && inEdges.length === 0 && role !== "VALUE_OBJECT" && role !== "ENUM_TYPE" && role !== "EXCEPTION_TYPE") {
        entryPoints.push({
          nodeId: node.id,
          className,
          type: "EJB_REMOTE",
          protocol: "RMI/IIOP",
          description: `EJB Remote — ${className}`,
        });
      }
    }

    return entryPoints;
  }

  // ─── Exit Points Detection ──────────────────────────────────────────────

  private findExitPoints(graph: DependencyGraph): ExitPoint[] {
    const exitPoints: ExitPoint[] = [];
    const externalNodes = graph.nodes.filter((n) => n.type === "EXTERNAL") as ExternalNode[];

    for (const ext of externalNodes) {
      // Trouver les classes qui pointent vers ce nœud externe
      const incomingEdges = graph.edges.filter((e) => e.target === ext.id);

      for (const edge of incomingEdges) {
        const sourceNode = graph.nodes.find((n) => n.id === edge.source);
        if (!sourceNode || sourceNode.type !== "CLASS") continue;

        const className = (sourceNode as ClassNode).className;

        let type: ExitPoint["type"];
        switch (ext.externalType) {
          case "DATABASE":
            type = "DATABASE";
            break;
          case "QUEUE":
            type = "QUEUE";
            break;
          case "WEBSERVICE":
            type = "WEBSERVICE";
            break;
          default:
            type = "EXTERNAL_SYSTEM";
        }

        exitPoints.push({
          nodeId: sourceNode.id,
          className,
          type,
          target: ext.systemName,
          protocol: ext.protocol || "UNKNOWN",
        });
      }
    }

    return exitPoints;
  }

  // ─── Critical Flows Tracing ─────────────────────────────────────────────

  private traceCriticalFlows(
    graph: DependencyGraph,
    entryPoints: EntryPoint[],
    exitPoints: ExitPoint[]
  ): CriticalFlow[] {
    const flows: CriticalFlow[] = [];
    const adjacency = new Map<string, string[]>();

    for (const node of graph.nodes) adjacency.set(node.id, []);
    for (const edge of graph.edges) {
      if (edge.type === "DEPENDS_ON" || edge.type === "CALLS" || edge.type === "JNDI_LOOKUP") {
        adjacency.get(edge.source)?.push(edge.target);
      }
    }

    // Tracer un flux depuis chaque entry point via DFS
    for (const entry of entryPoints) {
      const visited = new Set<string>();
      const path: string[] = [];
      const flowExitPoints: ExitPoint[] = [];
      let maxDepth = 0;
      let isTransactional = false;

      const dfs = (nodeId: string, depth: number) => {
        if (visited.has(nodeId) || depth > 20) return;
        visited.add(nodeId);
        path.push(nodeId);
        maxDepth = Math.max(maxDepth, depth);

        // Vérifier si ce nœud est transactionnel
        const node = graph.nodes.find((n) => n.id === nodeId);
        if (node && node.type === "CLASS") {
          const cn = node as ClassNode;
          if (cn.role === "ORCHESTRATOR" || cn.role === "DOMAIN_SERVICE") {
            isTransactional = true;
          }
        }

        // Vérifier si ce nœud est un exit point
        const exitHere = exitPoints.filter((ep) => ep.nodeId === nodeId);
        flowExitPoints.push(...exitHere);

        // Continuer le DFS
        for (const neighbor of adjacency.get(nodeId) || []) {
          dfs(neighbor, depth + 1);
        }
      };

      dfs(entry.nodeId, 0);

      if (path.length < 2) continue;

      // Évaluer le risque
      const riskFactors: string[] = [];
      if (maxDepth > 5) riskFactors.push(`Profondeur élevée (${maxDepth} niveaux)`);
      if (flowExitPoints.some((ep) => ep.type === "DATABASE"))
        riskFactors.push("Accès base de données");
      if (flowExitPoints.some((ep) => ep.type === "QUEUE"))
        riskFactors.push("Communication asynchrone JMS");
      if (flowExitPoints.some((ep) => ep.type === "WEBSERVICE"))
        riskFactors.push("Appel service externe");
      if (path.length > 10) riskFactors.push(`Chaîne longue (${path.length} classes)`);
      if (!isTransactional && flowExitPoints.some((ep) => ep.type === "DATABASE"))
        riskFactors.push("Accès DB sans transaction explicite");

      let riskLevel: CriticalFlow["riskLevel"] = "LOW";
      if (riskFactors.length >= 4) riskLevel = "CRITICAL";
      else if (riskFactors.length >= 3) riskLevel = "HIGH";
      else if (riskFactors.length >= 2) riskLevel = "MEDIUM";

      flows.push({
        id: `flow-${entry.className}`,
        name: `Flux ${entry.type} — ${entry.className}`,
        path,
        entryPoint: entry,
        exitPoints: flowExitPoints,
        depth: maxDepth,
        transactional: isTransactional,
        riskLevel,
        riskFactors,
      });
    }

    // Trier par risque décroissant
    const riskOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    flows.sort((a, b) => riskOrder[a.riskLevel] - riskOrder[b.riskLevel]);

    return flows;
  }

  // ─── Functional Modules ─────────────────────────────────────────────────

  private buildFunctionalModules(
    graph: DependencyGraph,
    domainMap: DomainMap,
    entryPoints: EntryPoint[],
    exitPoints: ExitPoint[]
  ): FunctionalModule[] {
    const modules: FunctionalModule[] = [];

    for (const cluster of domainMap) {
      if (cluster.domainId === "UNKNOWN" && cluster.classes.length <= 1) continue;

      const classSet = new Set(cluster.classes);

      // Entry/exit points dans ce module
      const moduleEntries = entryPoints.filter((ep) => classSet.has(ep.nodeId));
      const moduleExits = exitPoints.filter((ep) => classSet.has(ep.nodeId));

      // Compter arêtes internes/externes
      let internalEdges = 0;
      let externalEdges = 0;
      for (const edge of graph.edges) {
        const srcIn = classSet.has(edge.source);
        const tgtIn = classSet.has(edge.target);
        if (srcIn && tgtIn) internalEdges++;
        else if (srcIn || tgtIn) externalEdges++;
      }

      const totalEdges = internalEdges + externalEdges;
      const cohesion = totalEdges > 0 ? internalEdges / totalEdges : 0;
      const coupling = totalEdges > 0 ? externalEdges / totalEdges : 0;

      // Nommer le module
      const moduleName = this.generateModuleName(cluster.domainId, cluster.classes, graph);

      modules.push({
        id: `module-${cluster.domainId.toLowerCase().replace(/\s+/g, "-")}`,
        name: moduleName,
        description: `Module fonctionnel du domaine ${cluster.domainId} — ${cluster.classes.length} classes`,
        domains: [cluster.domainId],
        classes: cluster.classes,
        entryPoints: moduleEntries,
        exitPoints: moduleExits,
        internalEdges,
        externalEdges,
        cohesion: Math.round(cohesion * 1000) / 1000,
        coupling: Math.round(coupling * 1000) / 1000,
      });
    }

    return modules;
  }

  // ─── Module Naming ──────────────────────────────────────────────────────

  private generateModuleName(domainId: string, classes: string[], graph: DependencyGraph): string {
    const domainNames: Record<string, string> = {
      ACCOUNT_MANAGEMENT: "Gestion des Comptes",
      PAYMENT_PROCESSING: "Traitement des Paiements",
      CREDIT_MANAGEMENT: "Gestion du Crédit",
      KYC_COMPLIANCE: "KYC / Conformité",
      CARD_MANAGEMENT: "Gestion Monétique",
      BATCH_PROCESSING: "Traitements Batch",
      RISK_MANAGEMENT: "Gestion des Risques",
      REPORTING: "Reporting",
      CUSTOMER_MANAGEMENT: "Gestion Clients",
      TRANSFER_MANAGEMENT: "Gestion des Virements",
      UNKNOWN: "Module Non-Classifié",
    };

    return domainNames[domainId] || `Module ${domainId}`;
  }
}
