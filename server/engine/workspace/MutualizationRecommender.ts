/**
 * MutualizationRecommender — Proposes service mutualizations across workspace projects.
 *
 * Consumes:
 * - RedundancyReport (from RedundancyDetector)
 * - ResolutionResult (from CrossModuleResolver)
 * - ProjectIR data from each workspace project
 *
 * Produces:
 * - Ranked list of mutualization recommendations
 * - Impact assessment for each recommendation
 * - Suggested target microservice architecture
 *
 * Does NOT modify any existing module — read-only analysis.
 *
 * @author Hamza NORDINE
 */

import type { RedundancyMatch, RedundancyReport } from "./RedundancyDetector";
import type { ResolvedLink, UnresolvedLink } from "../CrossModuleResolver";
import type { ProjectIR } from "../../java-parser";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface MutualizationRecommendation {
  /** Unique ID */
  id: string;
  /** Priority: CRITICAL, HIGH, MEDIUM, LOW */
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  /** Type of recommendation */
  type: "MERGE_SERVICES" | "EXTRACT_SHARED_LIB" | "CREATE_API_GATEWAY" | "CONSOLIDATE_ENTITIES" | "UNIFY_DTOS";
  /** Human-readable title */
  title: string;
  /** Detailed description */
  description: string;
  /** Projects affected */
  affectedProjects: Array<{
    sessionId: string;
    projectName: string;
    affectedClasses: string[];
  }>;
  /** Estimated effort reduction (percentage) */
  effortReductionPercent: number;
  /** Estimated lines of code saved */
  estimatedLinesSaved: number;
  /** Risk level of applying this recommendation */
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  /** Concrete action items */
  actionItems: string[];
  /** Supporting evidence (redundancy matches + cross-module links) */
  evidence: {
    redundancyMatches: string[];  // IDs of RedundancyMatch
    crossModuleLinks: string[];   // JNDI paths
  };
}

export interface MutualizationReport {
  /** Timestamp of analysis */
  timestamp: string;
  /** Total projects in workspace */
  totalProjects: number;
  /** Summary metrics */
  summary: {
    totalRecommendations: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    totalEstimatedLinesSaved: number;
    averageEffortReduction: number;
  };
  /** Ordered list of recommendations (highest priority first) */
  recommendations: MutualizationRecommendation[];
  /** Cross-project dependency graph summary */
  dependencyGraph: {
    totalInterconnections: number;
    resolvedLinks: number;
    unresolvedLinks: number;
    stronglyCoupledPairs: Array<{
      projectA: string;
      projectB: string;
      linkCount: number;
    }>;
  };
}

interface ProjectEntry {
  sessionId: string;
  projectName: string;
  ir: ProjectIR;
}

// ─── MutualizationRecommender ──────────────────────────────────────────────

export class MutualizationRecommender {

  /**
   * Generate mutualization recommendations from redundancy and interconnection data.
   */
  recommend(
    projects: ProjectEntry[],
    redundancyReport: RedundancyReport,
    resolvedLinks: ResolvedLink[],
    unresolvedLinks: UnresolvedLink[]
  ): MutualizationReport {
    const recommendations: MutualizationRecommendation[] = [];
    let recId = 0;

    // ── Strategy 1: Merge redundant services ────────────────────────────
    const highConfMatches = redundancyReport.matches.filter(
      m => m.confidence === "HIGH" || m.confidence === "MEDIUM"
    );

    // Group matches by normalized class name to find multi-project duplicates
    const mergeGroups = this.groupMatchesForMerge(highConfMatches);

    for (const group of mergeGroups) {
      recId++;
      const affected = group.projects.map(p => ({
        sessionId: p.sessionId,
        projectName: p.projectName,
        affectedClasses: p.classes,
      }));

      const linesSaved = group.estimatedDuplicateLines;
      const effortReduction = Math.min(
        Math.round((group.avgSimilarity / 100) * 60),
        80
      );

      recommendations.push({
        id: `MR-${recId}`,
        priority: group.avgSimilarity >= 80 ? "CRITICAL" : "HIGH",
        type: "MERGE_SERVICES",
        title: `Fusionner les services "${group.normalizedName}" de ${group.projects.length} projets`,
        description: `Les projets ${group.projects.map(p => p.projectName).join(", ")} contiennent des services fonctionnellement identiques (similarité ${group.avgSimilarity}%). Un microservice unique peut remplacer ces ${group.projects.length} implémentations.`,
        affectedProjects: affected,
        effortReductionPercent: effortReduction,
        estimatedLinesSaved: linesSaved,
        riskLevel: group.avgSimilarity >= 80 ? "LOW" : "MEDIUM",
        actionItems: [
          `Créer un microservice partagé "${group.suggestedServiceName}"`,
          `Migrer les méthodes communes: ${group.sharedMethods.join(", ")}`,
          `Configurer les appels REST inter-services pour remplacer les appels EJB`,
          `Supprimer les implémentations dupliquées dans chaque projet`,
          `Ajouter des tests d'intégration inter-services`,
        ],
        evidence: {
          redundancyMatches: group.matchIds,
          crossModuleLinks: [],
        },
      });
    }

    // ── Strategy 2: Extract shared libraries from functional overlaps ───
    const lowConfMatches = redundancyReport.matches.filter(
      m => m.confidence === "LOW" && m.sharedMethods.length >= 2
    );

    if (lowConfMatches.length >= 2) {
      recId++;
      const affectedProjects = new Map<string, { sessionId: string; projectName: string; classes: Set<string> }>();

      for (const match of lowConfMatches) {
        for (const proj of [match.projectA, match.projectB]) {
          if (!affectedProjects.has(proj.sessionId)) {
            affectedProjects.set(proj.sessionId, {
              sessionId: proj.sessionId,
              projectName: proj.projectName,
              classes: new Set(),
            });
          }
          affectedProjects.get(proj.sessionId)!.classes.add(proj.className);
        }
      }

      const allSharedMethods = [...new Set(lowConfMatches.flatMap(m => m.sharedMethods))];

      recommendations.push({
        id: `MR-${recId}`,
        priority: "MEDIUM",
        type: "EXTRACT_SHARED_LIB",
        title: `Extraire une bibliothèque partagée pour ${allSharedMethods.length} méthodes communes`,
        description: `${affectedProjects.size} projets partagent des méthodes utilitaires similaires. Extraire ces méthodes dans une bibliothèque partagée (shared-lib) réduira la duplication et centralisera la maintenance.`,
        affectedProjects: [...affectedProjects.values()].map(p => ({
          sessionId: p.sessionId,
          projectName: p.projectName,
          affectedClasses: [...p.classes],
        })),
        effortReductionPercent: 15,
        estimatedLinesSaved: allSharedMethods.length * 30,
        riskLevel: "LOW",
        actionItems: [
          `Créer un module Maven/Gradle "shared-utils" ou "common-lib"`,
          `Extraire les méthodes partagées: ${allSharedMethods.slice(0, 5).join(", ")}${allSharedMethods.length > 5 ? "..." : ""}`,
          `Ajouter la dépendance shared-lib dans chaque microservice`,
          `Remplacer les implémentations locales par des appels à la lib`,
        ],
        evidence: {
          redundancyMatches: lowConfMatches.map(m => m.id),
          crossModuleLinks: [],
        },
      });
    }

    // ── Strategy 3: API Gateway for strongly coupled projects ───────────
    const coupledPairs = this.findStronglyCoupledPairs(resolvedLinks, projects);

    for (const pair of coupledPairs) {
      if (pair.linkCount >= 3) {
        recId++;
        recommendations.push({
          id: `MR-${recId}`,
          priority: pair.linkCount >= 5 ? "HIGH" : "MEDIUM",
          type: "CREATE_API_GATEWAY",
          title: `API Gateway entre "${pair.projectA}" et "${pair.projectB}" (${pair.linkCount} interconnexions)`,
          description: `${pair.linkCount} appels EJB croisés détectés entre ces deux projets. Un API Gateway ou un service de médiation centralisera ces appels et découplera les microservices résultants.`,
          affectedProjects: [
            { sessionId: pair.sessionA, projectName: pair.projectA, affectedClasses: pair.classesA },
            { sessionId: pair.sessionB, projectName: pair.projectB, affectedClasses: pair.classesB },
          ],
          effortReductionPercent: 20,
          estimatedLinesSaved: pair.linkCount * 50,
          riskLevel: "MEDIUM",
          actionItems: [
            `Définir les contrats REST entre les deux microservices`,
            `Remplacer les ${pair.linkCount} lookups JNDI par des appels REST`,
            `Implémenter un circuit breaker (Resilience4j) pour la résilience`,
            `Documenter les SLAs inter-services`,
          ],
          evidence: {
            redundancyMatches: [],
            crossModuleLinks: pair.jndiPaths,
          },
        });
      }
    }

    // ── Strategy 4: Consolidate entities with same name across projects ──
    const entityGroups = this.findDuplicateEntities(projects);

    for (const group of entityGroups) {
      if (group.projects.length >= 2) {
        recId++;
        recommendations.push({
          id: `MR-${recId}`,
          priority: "MEDIUM",
          type: "CONSOLIDATE_ENTITIES",
          title: `Consolider l'entité "${group.entityName}" présente dans ${group.projects.length} projets`,
          description: `L'entité "${group.entityName}" existe dans ${group.projects.map(p => p.projectName).join(", ")}. Consolider en une seule définition dans un module partagé évitera les incohérences de schéma.`,
          affectedProjects: group.projects.map(p => ({
            sessionId: p.sessionId,
            projectName: p.projectName,
            affectedClasses: [group.entityName],
          })),
          effortReductionPercent: 10,
          estimatedLinesSaved: (group.projects.length - 1) * 80,
          riskLevel: "LOW",
          actionItems: [
            `Créer un module "shared-entities" avec l'entité canonique`,
            `Vérifier la compatibilité des champs entre les versions`,
            `Migrer les références dans chaque microservice`,
          ],
          evidence: {
            redundancyMatches: [],
            crossModuleLinks: [],
          },
        });
      }
    }

    // ── Strategy 5: Unify DTOs with same structure ──────────────────────
    const dtoGroups = this.findDuplicateDtos(projects);

    for (const group of dtoGroups) {
      if (group.projects.length >= 2) {
        recId++;
        recommendations.push({
          id: `MR-${recId}`,
          priority: "LOW",
          type: "UNIFY_DTOS",
          title: `Unifier le DTO "${group.dtoName}" utilisé dans ${group.projects.length} projets`,
          description: `Le DTO "${group.dtoName}" est défini dans ${group.projects.map(p => p.projectName).join(", ")}. Unifier dans un contrat partagé (shared-contracts) pour garantir la cohérence des APIs.`,
          affectedProjects: group.projects.map(p => ({
            sessionId: p.sessionId,
            projectName: p.projectName,
            affectedClasses: [group.dtoName],
          })),
          effortReductionPercent: 5,
          estimatedLinesSaved: (group.projects.length - 1) * 40,
          riskLevel: "LOW",
          actionItems: [
            `Créer un module "shared-contracts" avec les DTOs communs`,
            `Vérifier la compatibilité des champs`,
            `Mettre à jour les imports dans chaque microservice`,
          ],
          evidence: {
            redundancyMatches: [],
            crossModuleLinks: [],
          },
        });
      }
    }

    // Sort recommendations by priority
    const priorityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    // Build dependency graph summary
    const allCoupledPairs = this.findStronglyCoupledPairs(resolvedLinks, projects);

    return {
      timestamp: new Date().toISOString(),
      totalProjects: projects.length,
      summary: {
        totalRecommendations: recommendations.length,
        criticalCount: recommendations.filter(r => r.priority === "CRITICAL").length,
        highCount: recommendations.filter(r => r.priority === "HIGH").length,
        mediumCount: recommendations.filter(r => r.priority === "MEDIUM").length,
        lowCount: recommendations.filter(r => r.priority === "LOW").length,
        totalEstimatedLinesSaved: recommendations.reduce((sum, r) => sum + r.estimatedLinesSaved, 0),
        averageEffortReduction: recommendations.length > 0
          ? Math.round(recommendations.reduce((sum, r) => sum + r.effortReductionPercent, 0) / recommendations.length)
          : 0,
      },
      recommendations,
      dependencyGraph: {
        totalInterconnections: resolvedLinks.length + unresolvedLinks.length,
        resolvedLinks: resolvedLinks.length,
        unresolvedLinks: unresolvedLinks.length,
        stronglyCoupledPairs: allCoupledPairs.map(p => ({
          projectA: p.projectA,
          projectB: p.projectB,
          linkCount: p.linkCount,
        })),
      },
    };
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  /**
   * Group redundancy matches by normalized class name for merge recommendations.
   */
  private groupMatchesForMerge(matches: RedundancyMatch[]): Array<{
    normalizedName: string;
    suggestedServiceName: string;
    projects: Array<{ sessionId: string; projectName: string; classes: string[] }>;
    avgSimilarity: number;
    estimatedDuplicateLines: number;
    sharedMethods: string[];
    matchIds: string[];
  }> {
    const groups = new Map<string, {
      projects: Map<string, { sessionId: string; projectName: string; classes: Set<string> }>;
      scores: number[];
      sharedMethods: Set<string>;
      matchIds: string[];
    }>();

    for (const match of matches) {
      // Use the normalized name of projectA as the group key
      const normA = this.normalizeForGrouping(match.projectA.className);
      const normB = this.normalizeForGrouping(match.projectB.className);
      const key = normA <= normB ? normA : normB; // Deterministic key

      if (!groups.has(key)) {
        groups.set(key, {
          projects: new Map(),
          scores: [],
          sharedMethods: new Set(),
          matchIds: [],
        });
      }

      const group = groups.get(key)!;
      group.scores.push(match.similarityScore);
      group.matchIds.push(match.id);
      match.sharedMethods.forEach(m => group.sharedMethods.add(m));

      for (const proj of [match.projectA, match.projectB]) {
        if (!group.projects.has(proj.sessionId)) {
          group.projects.set(proj.sessionId, {
            sessionId: proj.sessionId,
            projectName: proj.projectName,
            classes: new Set(),
          });
        }
        group.projects.get(proj.sessionId)!.classes.add(proj.className);
      }
    }

    return [...groups.entries()]
      .filter(([, g]) => g.projects.size >= 2)
      .map(([key, g]) => ({
        normalizedName: key,
        suggestedServiceName: this.toPascalCase(key) + "Service",
        projects: [...g.projects.values()].map(p => ({
          ...p,
          classes: [...p.classes],
        })),
        avgSimilarity: Math.round(g.scores.reduce((a, b) => a + b, 0) / g.scores.length),
        estimatedDuplicateLines: (g.projects.size - 1) * 150,
        sharedMethods: [...g.sharedMethods],
        matchIds: g.matchIds,
      }));
  }

  /**
   * Find strongly coupled project pairs from resolved cross-module links.
   */
  private findStronglyCoupledPairs(
    resolvedLinks: ResolvedLink[],
    projects: ProjectEntry[]
  ): Array<{
    sessionA: string;
    projectA: string;
    sessionB: string;
    projectB: string;
    linkCount: number;
    classesA: string[];
    classesB: string[];
    jndiPaths: string[];
  }> {
    const pairMap = new Map<string, {
      sessionA: string; projectA: string;
      sessionB: string; projectB: string;
      classesA: Set<string>; classesB: Set<string>;
      jndiPaths: Set<string>;
      count: number;
    }>();

    const projectMap = new Map(projects.map(p => [p.sessionId, p.projectName]));

    for (const link of resolvedLinks) {
      const key = [link.sourceSessionId, link.targetSessionId].sort().join(":");
      if (!pairMap.has(key)) {
        const [a, b] = key.split(":");
        pairMap.set(key, {
          sessionA: a, projectA: projectMap.get(a) || a,
          sessionB: b, projectB: projectMap.get(b) || b,
          classesA: new Set(), classesB: new Set(),
          jndiPaths: new Set(),
          count: 0,
        });
      }
      const pair = pairMap.get(key)!;
      pair.count++;
      pair.classesA.add(link.sourceClass);
      pair.classesB.add(link.targetClass);
      pair.jndiPaths.add(link.jndiPath);
    }

    return [...pairMap.values()]
      .map(p => ({
        sessionA: p.sessionA,
        projectA: p.projectA,
        sessionB: p.sessionB,
        projectB: p.projectB,
        linkCount: p.count,
        classesA: [...p.classesA],
        classesB: [...p.classesB],
        jndiPaths: [...p.jndiPaths],
      }))
      .sort((a, b) => b.linkCount - a.linkCount);
  }

  /**
   * Find entities with the same name across different projects.
   */
  private findDuplicateEntities(projects: ProjectEntry[]): Array<{
    entityName: string;
    projects: Array<{ sessionId: string; projectName: string }>;
  }> {
    const entityMap = new Map<string, Array<{ sessionId: string; projectName: string }>>();

    for (const proj of projects) {
      // Entities come from DTOs that map to DB tables (heuristic: names ending with Entity or matching VO patterns)
      for (const dto of proj.ir.dtos) {
        const normName = dto.className.replace(/(VO|Dto|DTO|Entity)$/i, "").toLowerCase();
        if (!entityMap.has(normName)) entityMap.set(normName, []);
        entityMap.get(normName)!.push({
          sessionId: proj.sessionId,
          projectName: proj.projectName,
        });
      }
    }

    return [...entityMap.entries()]
      .filter(([, projs]) => {
        // Only keep entities present in more than one project
        const uniqueProjects = new Set(projs.map(p => p.sessionId));
        return uniqueProjects.size >= 2;
      })
      .map(([name, projs]) => ({
        entityName: this.toPascalCase(name),
        projects: projs.filter((p, i, arr) =>
          arr.findIndex(x => x.sessionId === p.sessionId) === i
        ),
      }));
  }

  /**
   * Find DTOs with the same name across different projects.
   */
  private findDuplicateDtos(projects: ProjectEntry[]): Array<{
    dtoName: string;
    projects: Array<{ sessionId: string; projectName: string }>;
  }> {
    const dtoMap = new Map<string, Array<{ sessionId: string; projectName: string }>>();

    for (const proj of projects) {
      for (const dto of proj.ir.dtos) {
        const normName = dto.className.toLowerCase();
        if (!dtoMap.has(normName)) dtoMap.set(normName, []);
        dtoMap.get(normName)!.push({
          sessionId: proj.sessionId,
          projectName: proj.projectName,
        });
      }
    }

    return [...dtoMap.entries()]
      .filter(([, projs]) => {
        const uniqueProjects = new Set(projs.map(p => p.sessionId));
        return uniqueProjects.size >= 2;
      })
      .map(([name, projs]) => ({
        dtoName: name,
        projects: projs.filter((p, i, arr) =>
          arr.findIndex(x => x.sessionId === p.sessionId) === i
        ),
      }));
  }

  private normalizeForGrouping(name: string): string {
    return name
      .replace(/^(Abstract|Base|Default|Impl|Legacy)/, "")
      .replace(/(UC|UseCase|Handler|Bean|EJB|Facade|Service|Impl|Remote|Local|Home)$/i, "")
      .toLowerCase()
      .trim();
  }

  private toPascalCase(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}
