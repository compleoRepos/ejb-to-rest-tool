/**
 * DomainClusterer — Clustering enrichi des domaines métier.
 * Algorithme en 3 passes :
 *   PASSE 1 — Seed par vocabulaire (DomainInferrer existant)
 *   PASSE 2 — Propagation par le graphe (voisins directs)
 *   PASSE 3 — Validation cohésion/couplage
 *
 * @author Compleo
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

       // ── PASSE 1 — Seed par vocabulaire ──────────────────────────────
    for (const node of classNodes) {
      domainAssignment.set(node.id, node.domain || "UNKNOWN");
    }

    // ── PASSE 1bis — Réduction UNKNOWN par heuristiques (nom de classe, package, rôle) ───
    for (const node of classNodes) {
      if (domainAssignment.get(node.id) !== "UNKNOWN") continue;

      // Heuristique 1: Nom de classe contient un mot-clé métier
      const inferred = this.inferDomainFromClassName(node.className, node.packageName);
      if (inferred !== "UNKNOWN") {
        domainAssignment.set(node.id, inferred);
        continue;
      }

      // Heuristique 2: Package contient un mot-clé métier
      const pkgInferred = this.inferDomainFromPackage(node.packageName);
      if (pkgInferred !== "UNKNOWN") {
        domainAssignment.set(node.id, pkgInferred);
        continue;
      }
    }

    // ── PASSE 2 — Propagation par le graphe ──────────────────────────────
    const adjacency = this.buildAdjacency(graph);
    let changed = true;
    let iteration = 0;

    while (changed && iteration < this.maxIterations) {
      changed = false;
      iteration++;

      for (const node of classNodes) {
        if (domainAssignment.get(node.id) !== "UNKNOWN") continue;

        // Regarder les voisins directs (CALLS + DEPENDS_ON + SHARES_DTO + DB_ACCESS + JNDI_LOOKUP + EMITS_EVENT)
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

        // Seuil adaptatif: si peu de voisins, accepter la majorité simple
        const totalNeighbors = neighborDomains.length;
        const threshold = totalNeighbors <= 2 ? 0.5 : this.propagationThreshold;
        for (const [domain, count] of domainCounts) {
          if (count / totalNeighbors >= threshold) {
            domainAssignment.set(node.id, domain);
            changed = true;
            break;
          }
        }
      }
    }

    // ── PASSE 2bis — Dernière chance: propager par package commun ────────────
    for (const node of classNodes) {
      if (domainAssignment.get(node.id) !== "UNKNOWN") continue;
      // Trouver un frère de package qui a un domaine connu
      const siblings = classNodes.filter(
        (n) => n.id !== node.id && n.packageName === node.packageName && domainAssignment.get(n.id) !== "UNKNOWN"
      );
      if (siblings.length > 0) {
        // Prendre le domaine le plus fréquent parmi les frères
        const sibDomains = siblings.map((s) => domainAssignment.get(s.id)!).filter(Boolean);
        const sibCounts = new Map<string, number>();
        for (const d of sibDomains) sibCounts.set(d, (sibCounts.get(d) || 0) + 1);
        let bestDomain = "UNKNOWN";
        let bestCount = 0;
        for (const [d, c] of sibCounts) {
          if (c > bestCount) { bestDomain = d; bestCount = c; }
        }
        if (bestDomain !== "UNKNOWN") {
          domainAssignment.set(node.id, bestDomain);
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
   * Construit la liste d'adjacence (non-dirigée) pour les arêtes de couplage.
   */
  private buildAdjacency(graph: DependencyGraph): Map<string, string[]> {
    const adj = new Map<string, string[]>();
    for (const node of graph.nodes) {
      adj.set(node.id, []);
    }
    for (const edge of graph.edges) {
      // Include all coupling edge types for better propagation
      if (
        edge.type === "CALLS" ||
        edge.type === "DEPENDS_ON" ||
        edge.type === "SHARES_DTO" ||
        edge.type === "JNDI_LOOKUP" ||
        edge.type === "DB_ACCESS" ||
        edge.type === "EMITS_EVENT" ||
        edge.type === "TRANSACTION_WITH"
      ) {
        adj.get(edge.source)?.push(edge.target);
        adj.get(edge.target)?.push(edge.source);
      }
    }
    return adj;
  }

  /**
   * Infère le domaine depuis le nom de classe et le package.
   */
  private inferDomainFromClassName(className: string, packageName: string): string {
    const name = className.toLowerCase();
    const pkg = packageName.toLowerCase();
    const combined = `${pkg}.${name}`;

    // Compte / Account
    if (/compte|account|solde|balance|epargne|courant/.test(combined)) return "COMPTE";
    // Virement / Transfer
    if (/virement|transfer|swift|benefici/.test(combined)) return "VIREMENT";
    // Crédit / Loan
    if (/credit|pret|loan|amortis|echeance|garantie/.test(combined)) return "CREDIT";
    // KYC / Compliance
    if (/kyc|conformit|compliance|sanction|pep|risque|scoring/.test(combined)) return "KYC";
    // Monétique / Card
    if (/carte|card|pin|monetique|paiement|cb|opposition|activation/.test(combined)) return "MONETIQUE";
    // Batch
    if (/batch|job|reader|writer|processor|releve|interet/.test(combined)) return "BATCH";
    // Client
    if (/client|customer|personne|contact/.test(combined)) return "CLIENT";

    return "UNKNOWN";
  }

  /**
   * Infère le domaine depuis le package seul.
   */
  private inferDomainFromPackage(packageName: string): string {
    const pkg = packageName.toLowerCase();
    if (/\.compte|\.account/.test(pkg)) return "COMPTE";
    if (/\.virement|\.transfer|\.swift/.test(pkg)) return "VIREMENT";
    if (/\.credit|\.pret|\.loan/.test(pkg)) return "CREDIT";
    if (/\.kyc|\.conformit|\.compliance/.test(pkg)) return "KYC";
    if (/\.monetique|\.carte|\.card/.test(pkg)) return "MONETIQUE";
    if (/\.batch|\.job/.test(pkg)) return "BATCH";
    if (/\.client|\.customer/.test(pkg)) return "CLIENT";
    return "UNKNOWN";
  }
}
