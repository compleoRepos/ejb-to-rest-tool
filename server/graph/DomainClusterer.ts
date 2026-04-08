/**
 * DomainClusterer — Clustering enrichi des domaines métier.
 * Algorithme en 3 passes :
 *   PASSE 1 — Seed par vocabulaire (DomainInferrer existant)
 *   PASSE 2 — Propagation par le graphe (voisins directs)
 *   PASSE 3 — Validation cohésion/couplage
 *
 * @author Hamza NORDINE
 */

import type {
  DependencyGraph,
  ClassNode,
  GraphEdge,
  DomainCluster,
  DomainMap,
} from "./model/GraphModel";
import { DomainInferrer, type ClassDomainContext } from "../intelligence/semantic/DomainInferrer";

// ─── DomainClusterer ────────────────────────────────────────────────────────

export class DomainClusterer {
  private domainInferrer = new DomainInferrer();
  private maxIterations = 10;
  private propagationThreshold = 0.6;
  private cohesionWarningThreshold = 0.4;
  private couplageWarningThreshold = 0.6;

  /**
   * Exécute le clustering en 3 passes sur le graphe de dépendances.
   */
  cluster(graph: DependencyGraph): DomainMap {
    // Extraire les nœuds CLASS uniquement
    const classNodes = graph.nodes.filter((n) => n.type === "CLASS") as ClassNode[];
    if (classNodes.length === 0) return [];

    // Map nodeId → domain (mutable)
    const domainAssignment = new Map<string, string>();

    // ── PASSE 1 — Seed par vocabulaire ──────────────────────────────────
    for (const node of classNodes) {
      domainAssignment.set(node.id, node.domain || "UNKNOWN");
    }

    // ── PASSE 2 — Propagation par le graphe ─────────────────────────────
    const adjacency = this.buildAdjacency(graph);
    let changed = true;
    let iteration = 0;

    while (changed && iteration < this.maxIterations) {
      changed = false;
      iteration++;

      for (const node of classNodes) {
        if (domainAssignment.get(node.id) !== "UNKNOWN") continue;

        // Regarder les voisins directs (CALLS + DEPENDS_ON)
        const neighbors = adjacency.get(node.id) || [];
        const neighborDomains: string[] = [];

        for (const neighborId of neighbors) {
          const nd = domainAssignment.get(neighborId);
          if (nd && nd !== "UNKNOWN") {
            neighborDomains.push(nd);
          }
        }

        if (neighborDomains.length === 0) continue;

        // Compter les domaines
        const domainCounts = new Map<string, number>();
        for (const d of neighborDomains) {
          domainCounts.set(d, (domainCounts.get(d) || 0) + 1);
        }

        // Si > 60% des voisins ont le même domaine → adopter
        const totalNeighbors = neighborDomains.length;
        for (const [domain, count] of domainCounts) {
          if (count / totalNeighbors >= this.propagationThreshold) {
            domainAssignment.set(node.id, domain);
            changed = true;
            break;
          }
        }
      }
    }

    // ── PASSE 3 — Validation cohésion/couplage ─────────────────────────
    // Grouper les classes par domaine
    const domainGroups = new Map<string, string[]>();
    for (const [nodeId, domain] of domainAssignment) {
      if (!domainGroups.has(domain)) {
        domainGroups.set(domain, []);
      }
      domainGroups.get(domain)!.push(nodeId);
    }

    // Calculer cohésion et couplage pour chaque domaine
    const result: DomainMap = [];

    for (const [domainId, classes] of domainGroups) {
      if (domainId === "UNKNOWN" && classes.length === 0) continue;

      const classSet = new Set(classes);
      let intraEdges = 0;
      let interEdges = 0;
      let totalEdges = 0;

      for (const edge of graph.edges) {
        const sourceInDomain = classSet.has(edge.source);
        const targetInDomain = classSet.has(edge.target);

        if (sourceInDomain || targetInDomain) {
          totalEdges++;
          if (sourceInDomain && targetInDomain) {
            intraEdges++;
          } else {
            interEdges++;
          }
        }
      }

      const cohesion = totalEdges > 0 ? intraEdges / totalEdges : 0;
      const couplage = totalEdges > 0 ? interEdges / totalEdges : 0;

      const warnings: string[] = [];
      if (cohesion < this.cohesionWarningThreshold && classes.length > 1) {
        warnings.push(
          `Domaine "${domainId}" : cohésion faible (${(cohesion * 100).toFixed(1)}% < ${this.cohesionWarningThreshold * 100}%) — domaine potentiellement mal délimité`
        );
      }
      if (couplage > this.couplageWarningThreshold && classes.length > 1) {
        warnings.push(
          `Domaine "${domainId}" : couplage fort (${(couplage * 100).toFixed(1)}% > ${this.couplageWarningThreshold * 100}%) — domaine trop couplé aux autres`
        );
      }

      result.push({
        domainId,
        classes,
        cohesion: Math.round(cohesion * 1000) / 1000,
        couplage: Math.round(couplage * 1000) / 1000,
        warnings,
      });
    }

    // Trier par nombre de classes décroissant
    result.sort((a, b) => b.classes.length - a.classes.length);

    return result;
  }

  /**
   * Construit la liste d'adjacence (non-dirigée) pour les arêtes CALLS et DEPENDS_ON.
   */
  private buildAdjacency(graph: DependencyGraph): Map<string, string[]> {
    const adj = new Map<string, string[]>();
    for (const node of graph.nodes) {
      adj.set(node.id, []);
    }
    for (const edge of graph.edges) {
      if (edge.type === "CALLS" || edge.type === "DEPENDS_ON" || edge.type === "SHARES_DTO") {
        adj.get(edge.source)?.push(edge.target);
        adj.get(edge.target)?.push(edge.source);
      }
    }
    return adj;
  }
}
