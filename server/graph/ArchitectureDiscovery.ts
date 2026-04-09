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
  targetSystem: string;
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
    const exitNodeIds = new Set<string>();

    // ─── Strategy 1: EXTERNAL nodes (databases, queues, web services) ─────
    const externalNodes = graph.nodes.filter((n) => n.type === "EXTERNAL") as ExternalNode[];

    for (const ext of externalNodes) {
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

        exitNodeIds.add(sourceNode.id);
        exitPoints.push({
          nodeId: sourceNode.id,
          className,
          type,
          target: ext.systemName,
          targetSystem: this.inferTargetSystem(ext.systemName, ext.externalType, ext.protocol),
          protocol: ext.protocol || "UNKNOWN",
        });
      }
    }

    // ─── Strategy 2: Leaf CLASS nodes that are dependency targets ──────────
    // These are services injected via @EJB/@Inject that have incoming DEPENDS_ON
    // edges but no outgoing edges to other CLASS nodes. They act as gateways
    // to external systems (e.g., MagixService, adapters, connectors).
    const classNodes = graph.nodes.filter((n) => n.type === "CLASS") as ClassNode[];

    // Gateway/middleware naming patterns
    const gatewayPatterns = /(?:Service|Gateway|Adapter|Connector|Client|Proxy|Facade|Bridge|Delegate|Provider|Handler|Manager|Mediator|Wrapper|Remote|External|Integration|Middleware)/i;

    for (const node of classNodes) {
      // Skip nodes already identified as exit points
      if (exitNodeIds.has(node.id)) continue;

      // Must have incoming DEPENDS_ON or TRANSACTION_WITH edges (i.e., it's a dependency target)
      const incomingDeps = graph.edges.filter(
        (e) => e.target === node.id && (e.type === "DEPENDS_ON" || e.type === "TRANSACTION_WITH")
      );
      if (incomingDeps.length === 0) continue;

      // Must have NO outgoing edges to other CLASS nodes (leaf node)
      const outgoingToClass = graph.edges.filter(
        (e) => e.source === node.id && (
          e.type === "DEPENDS_ON" || e.type === "CALLS" ||
          e.type === "JNDI_LOOKUP" || e.type === "DB_ACCESS" ||
          e.type === "EMITS_EVENT" || e.type === "SOAP_CALLS"
        )
      );
      if (outgoingToClass.length > 0) continue;

      // Must not be a simple value type
      if (node.role === "VALUE_OBJECT" || node.role === "ENUM_TYPE" || node.role === "EXCEPTION_TYPE") continue;

      // Determine exit point type based on naming and role
      const className = node.className;
      let type: ExitPoint["type"] = "EXTERNAL_SYSTEM";
      let protocol = "EJB_INJECT";

      if (className.toLowerCase().includes("magix") || className.toLowerCase().includes("middleware")) {
        type = "WEBSERVICE";
        protocol = "MIDDLEWARE";
      } else if (className.toLowerCase().includes("adapter") || className.toLowerCase().includes("connector")) {
        type = "WEBSERVICE";
        protocol = "ADAPTER";
      } else if (className.toLowerCase().includes("gateway") || className.toLowerCase().includes("proxy")) {
        type = "WEBSERVICE";
        protocol = "GATEWAY";
      } else if (gatewayPatterns.test(className)) {
        type = "EXTERNAL_SYSTEM";
        protocol = "SERVICE";
      }

      // Create one exit point per incoming dependency (each caller has its own exit path)
      for (const edge of incomingDeps) {
        const callerNode = graph.nodes.find((n) => n.id === edge.source);
        if (!callerNode || callerNode.type !== "CLASS") continue;

        const callerClassName = (callerNode as ClassNode).className;
        const epKey = `${callerNode.id}→${node.id}`;
        if (exitNodeIds.has(epKey)) continue;
        exitNodeIds.add(epKey);

        exitPoints.push({
          nodeId: callerNode.id,
          className: callerClassName,
          type,
          target: className,
          targetSystem: this.inferTargetSystem(className, "WEBSERVICE", protocol),
          protocol,
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
      // Suivre toutes les arêtes de dépendance pour tracer les flux complets
      if (
        edge.type === "DEPENDS_ON" ||
        edge.type === "CALLS" ||
        edge.type === "JNDI_LOOKUP" ||
        edge.type === "DB_ACCESS" ||
        edge.type === "EMITS_EVENT" ||
        edge.type === "SOAP_CALLS" ||
        edge.type === "TRANSACTION_WITH"
      ) {
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

      // Évaluer le risque — facteurs structurels
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

      // CORRECTION 2: Facteurs de risque supplémentaires basés sur les technologies et patterns
      // Analyse des nœuds traversés pour détecter des patterns à risque
      for (const nodeId of path) {
        const node = graph.nodes.find((n) => n.id === nodeId);
        if (!node || node.type !== "CLASS") continue;
        const cn = node as ClassNode;
        // EJB 2.x dans le flux = risque de migration élevé
        if (cn.technologyType === "EJB_2X") {
          if (!riskFactors.includes("Technologie EJB 2.x (migration complexe)"))
            riskFactors.push("Technologie EJB 2.x (migration complexe)");
        }
        // Batch dans le flux
        if (cn.technologyType === "BATCH_JSR352") {
          if (!riskFactors.includes("Traitement batch JSR-352"))
            riskFactors.push("Traitement batch JSR-352");
        }
        // Haute complexité cyclomatique
        if (cn.complexity > 15) {
          if (!riskFactors.includes("Complexité cyclomatique élevée"))
            riskFactors.push("Complexité cyclomatique élevée");
        }
        // JNDI lookup dans le flux
        const jndiEdges = graph.edges.filter((e) => e.source === nodeId && e.type === "JNDI_LOOKUP");
        if (jndiEdges.length > 0) {
          if (!riskFactors.includes("Lookup JNDI (couplage fort)"))
            riskFactors.push("Lookup JNDI (couplage fort)");
        }
      }
      // JDBC legacy pattern detection and direct DB_ACCESS from CLASS nodes
      for (const nodeId of path) {
        const node = graph.nodes.find((n) => n.id === nodeId);
        if (!node || node.type !== "CLASS") continue;
        const cn = node as ClassNode;
        // Check if this CLASS node has direct DB_ACCESS edges (JDBC pattern)
        const dbEdges = graph.edges.filter((e) => e.source === nodeId && e.type === "DB_ACCESS");
        if (dbEdges.length > 0) {
          if (cn.technologyType === "JDBC") {
            if (!riskFactors.includes("Accès JDBC legacy (risque fuite connexion)"))
              riskFactors.push("Accès JDBC legacy (risque fuite connexion)");
          }
          // Ensure DB access is counted as a risk factor
          if (!riskFactors.includes("Accès base de données"))
            riskFactors.push("Accès base de données");
          // If no @Transactional and has DB access
          if (!isTransactional && !riskFactors.includes("Accès DB sans transaction explicite"))
            riskFactors.push("Accès DB sans transaction explicite");
          // @Resource DataSource = JDBC pattern even if tech is EJB_3X
          if (!riskFactors.includes("Accès JDBC legacy (risque fuite connexion)"))
            riskFactors.push("Accès JDBC legacy (risque fuite connexion)");
        }
      }
      // Flux multi-technologies
      const techsInPath = new Set<string>();
      for (const nodeId of path) {
        const node = graph.nodes.find((n) => n.id === nodeId);
        if (node && node.type === "CLASS") techsInPath.add((node as ClassNode).technologyType);
      }
      if (techsInPath.size > 2) {
        riskFactors.push(`Flux multi-technologies (${techsInPath.size} techs)`);
      }

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

  // ─── Target System Inference ─────────────────────────────────────────────

  private inferTargetSystem(systemName: string, externalType: string, protocol: string): string {
    const name = systemName.toUpperCase();
    // Database tables
    if (externalType === "DATABASE") {
      if (name.startsWith("T_COMPTES") || name.includes("COMPTE")) return "Core Banking System (Comptes)";
      if (name.startsWith("T_VIREMENT") || name.includes("VIREMENT")) return "Système de Virements";
      if (name.startsWith("T_CLIENT") || name.includes("CLIENT")) return "Référentiel Clients";
      if (name.startsWith("T_CREDIT") || name.includes("CREDIT") || name.includes("PRET")) return "Système de Crédit";
      if (name.startsWith("T_CARTE") || name.includes("CARTE") || name.includes("CARD")) return "Système Monétique";
      if (name.startsWith("T_INTERET") || name.includes("INTERET")) return "Système Calcul Intérêts";
      if (name.startsWith("T_RELEVE") || name.includes("RELEVE")) return "Système Relevés";
      if (name.startsWith("T_KYC") || name.includes("KYC") || name.includes("CONFORMITE")) return "Système KYC/Conformité";
      if (name.includes("AUDIT") || name.includes("LOG") || name.includes("TRACE")) return "Système d'Audit";
      if (name.includes("JDBC") || name.includes("_DS")) return `DataSource ${systemName}`;
      return `Base de données (${systemName})`;
    }
    // Queues
    if (externalType === "QUEUE") {
      if (name.includes("BATCH")) return "Système Batch";
      if (name.includes("VIREMENT") || name.includes("SWIFT")) return "Bus Virements/SWIFT";
      if (name.includes("NOTIF")) return "Système de Notifications";
      return `File JMS (${systemName})`;
    }
    // Web services
    if (externalType === "WEBSERVICE") {
      if (protocol === "JNDI") return `Service JNDI (${systemName})`;
      if (name.includes("SWIFT")) return "Réseau SWIFT";
      if (name.includes("MAGIX") || name.includes("MAJ")) return "Système Magix";
      return `Service externe (${systemName})`;
    }
    return `Système externe (${systemName})`;
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
