/**
 * WorkspaceIntelligenceEngine — Orchestrates workspace-level intelligence.
 *
 * Combines:
 * - CrossModuleResolver (existing) — JNDI dependency resolution
 * - RedundancyDetector (new) — Service redundancy detection
 * - MutualizationRecommender (new) — Mutualization proposals
 *
 * Produces a unified WorkspaceInsight report that updates automatically
 * when a project is added or removed from the workspace.
 *
 * Does NOT modify any existing module — purely additive.
 *
 * @author Compleo
 */

import { CrossModuleResolver } from "../CrossModuleResolver";
import type { ResolvedLink, UnresolvedLink, ResolutionResult, WorkspaceProject } from "../CrossModuleResolver";
import { RedundancyDetector } from "./RedundancyDetector";
import type { RedundancyReport, WorkspaceProjectEntry } from "./RedundancyDetector";
import { MutualizationRecommender } from "./MutualizationRecommender";
import type { MutualizationReport } from "./MutualizationRecommender";
import type { ProjectIR } from "../../java-parser";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface WorkspaceInsight {
  /** Workspace metadata */
  workspaceId: string;
  /** Timestamp of last analysis */
  lastAnalyzedAt: string;
  /** Number of projects analyzed */
  projectCount: number;
  /** Projects summary */
  projects: Array<{
    sessionId: string;
    projectName: string;
    artifactId: string;
    useCaseCount: number;
    serviceCount: number;
    dtoCount: number;
    technologies: string[];
  }>;
  /** Cross-module dependency resolution */
  crossModuleResolution: {
    totalLinks: number;
    resolvedLinks: ResolvedLink[];
    unresolvedLinks: UnresolvedLink[];
    resolutionRate: number;
  };
  /** Redundancy analysis */
  redundancy: RedundancyReport;
  /** Mutualization recommendations */
  mutualization: MutualizationReport;
  /** Global health score (0-100) */
  healthScore: number;
  /** Key insights as human-readable strings */
  keyInsights: string[];
}

// ─── WorkspaceIntelligenceEngine ───────────────────────────────────────────

export class WorkspaceIntelligenceEngine {
  private crossModuleResolver = new CrossModuleResolver();
  private redundancyDetector = new RedundancyDetector();
  private mutualizationRecommender = new MutualizationRecommender();

  /**
   * Run full workspace intelligence analysis.
   *
   * @param workspaceId - The workspace ID
   * @param projects - All projects in the workspace with their IRs
   * @returns Complete WorkspaceInsight report
   */
  analyze(
    workspaceId: string,
    projects: Array<{ sessionId: string; projectName: string; ir: ProjectIR }>
  ): WorkspaceInsight {

    if (projects.length === 0) {
      return this.emptyInsight(workspaceId);
    }

    // ── Step 1: Resolve cross-module links ──────────────────────────────
    const allResolved: ResolvedLink[] = [];
    const allUnresolved: UnresolvedLink[] = [];

    // Run resolution for each project against all others
    for (let i = 0; i < projects.length; i++) {
      const current = projects[i];
      const others: WorkspaceProject[] = projects
        .filter((_, idx) => idx !== i)
        .map(p => ({
          sessionId: p.sessionId,
          projectName: p.projectName,
          artifactId: p.ir.artifactId || p.projectName,
          ir: p.ir,
        }));

      const result = this.crossModuleResolver.resolveLinks(
        current.sessionId,
        current.ir,
        others
      );

      // Deduplicate resolved links (A→B and B→A are the same link)
      for (const link of result.resolved) {
        const exists = allResolved.some(
          r => r.jndiPath === link.jndiPath &&
               r.sourceSessionId === link.sourceSessionId
        );
        if (!exists) allResolved.push(link);
      }

      for (const link of result.unresolved) {
        const exists = allUnresolved.some(
          u => u.jndiPath === link.jndiPath &&
               u.sourceSessionId === link.sourceSessionId
        );
        if (!exists) allUnresolved.push(link);
      }
    }

    // Remove from unresolved any that are now resolved
    const resolvedPaths = new Set(allResolved.map(r => `${r.sourceSessionId}:${r.jndiPath}`));
    const filteredUnresolved = allUnresolved.filter(
      u => !resolvedPaths.has(`${u.sourceSessionId}:${u.jndiPath}`)
    );

    const totalLinks = allResolved.length + filteredUnresolved.length;
    const resolutionRate = totalLinks > 0
      ? Math.round((allResolved.length / totalLinks) * 100)
      : 100;

    // ── Step 2: Detect redundancies ─────────────────────────────────────
    const projectEntries: WorkspaceProjectEntry[] = projects.map(p => ({
      sessionId: p.sessionId,
      projectName: p.projectName,
      ir: p.ir,
    }));

    const redundancyReport = this.redundancyDetector.detect(projectEntries);

    // ── Step 3: Generate mutualization recommendations ──────────────────
    const mutualizationReport = this.mutualizationRecommender.recommend(
      projects,
      redundancyReport,
      allResolved,
      filteredUnresolved
    );

    // ── Step 4: Compute health score ────────────────────────────────────
    const healthScore = this.computeHealthScore(
      projects.length,
      resolutionRate,
      redundancyReport,
      mutualizationReport
    );

    // ── Step 5: Generate key insights ───────────────────────────────────
    const keyInsights = this.generateKeyInsights(
      projects,
      allResolved,
      filteredUnresolved,
      redundancyReport,
      mutualizationReport
    );

    // ── Step 6: Build project summaries ─────────────────────────────────
    const projectSummaries = projects.map(p => ({
      sessionId: p.sessionId,
      projectName: p.projectName,
      artifactId: p.ir.artifactId || p.projectName,
      useCaseCount: p.ir.useCases.length,
      serviceCount: p.ir.services.length,
      dtoCount: p.ir.dtos.length,
      technologies: this.detectTechnologies(p.ir),
    }));

    return {
      workspaceId,
      lastAnalyzedAt: new Date().toISOString(),
      projectCount: projects.length,
      projects: projectSummaries,
      crossModuleResolution: {
        totalLinks,
        resolvedLinks: allResolved,
        unresolvedLinks: filteredUnresolved,
        resolutionRate,
      },
      redundancy: redundancyReport,
      mutualization: mutualizationReport,
      healthScore,
      keyInsights,
    };
  }

  /**
   * Incremental update: re-analyze when a project is added.
   * This is more efficient than full re-analysis for large workspaces.
   */
  analyzeIncremental(
    workspaceId: string,
    existingProjects: Array<{ sessionId: string; projectName: string; ir: ProjectIR }>,
    newProject: { sessionId: string; projectName: string; ir: ProjectIR }
  ): WorkspaceInsight {
    // For now, delegate to full analysis (optimization can come later)
    return this.analyze(workspaceId, [...existingProjects, newProject]);
  }

  // ── Private helpers ────────────────────────────────────────────────────

  private emptyInsight(workspaceId: string): WorkspaceInsight {
    return {
      workspaceId,
      lastAnalyzedAt: new Date().toISOString(),
      projectCount: 0,
      projects: [],
      crossModuleResolution: {
        totalLinks: 0,
        resolvedLinks: [],
        unresolvedLinks: [],
        resolutionRate: 100,
      },
      redundancy: {
        totalProjectsAnalyzed: 0,
        totalUseCasesScanned: 0,
        totalServicesScanned: 0,
        matches: [],
        highConfidenceCount: 0,
        mediumConfidenceCount: 0,
        lowConfidenceCount: 0,
        byDomain: {},
      },
      mutualization: {
        timestamp: new Date().toISOString(),
        totalProjects: 0,
        summary: {
          totalRecommendations: 0,
          criticalCount: 0,
          highCount: 0,
          mediumCount: 0,
          lowCount: 0,
          totalEstimatedLinesSaved: 0,
          averageEffortReduction: 0,
        },
        recommendations: [],
        dependencyGraph: {
          totalInterconnections: 0,
          resolvedLinks: 0,
          unresolvedLinks: 0,
          stronglyCoupledPairs: [],
        },
      },
      healthScore: 100,
      keyInsights: ["Aucun projet dans le workspace. Ajoutez des projets analysés pour activer l'intelligence."],
    };
  }

  /**
   * Compute a global health score for the workspace.
   * 100 = perfect (no redundancy, all links resolved)
   * 0 = critical issues everywhere
   */
  private computeHealthScore(
    projectCount: number,
    resolutionRate: number,
    redundancy: RedundancyReport,
    mutualization: MutualizationReport
  ): number {
    if (projectCount <= 1) return 100;

    let score = 100;

    // Penalize unresolved cross-module links
    score -= Math.round((100 - resolutionRate) * 0.3);

    // Penalize high-confidence redundancies
    score -= redundancy.highConfidenceCount * 10;
    score -= redundancy.mediumConfidenceCount * 5;

    // Penalize critical mutualization recommendations
    score -= mutualization.summary.criticalCount * 8;
    score -= mutualization.summary.highCount * 4;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Generate human-readable key insights.
   */
  private generateKeyInsights(
    projects: Array<{ sessionId: string; projectName: string; ir: ProjectIR }>,
    resolved: ResolvedLink[],
    unresolved: UnresolvedLink[],
    redundancy: RedundancyReport,
    mutualization: MutualizationReport
  ): string[] {
    const insights: string[] = [];

    // Project overview
    const totalUC = projects.reduce((sum, p) => sum + p.ir.useCases.length, 0);
    insights.push(
      `${projects.length} projets analysés, ${totalUC} use cases au total.`
    );

    // Cross-module links
    if (resolved.length > 0) {
      insights.push(
        `${resolved.length} interconnexion(s) EJB résolue(s) entre projets — ces appels devront être convertis en REST.`
      );
    }
    if (unresolved.length > 0) {
      insights.push(
        `${unresolved.length} dépendance(s) non résolue(s) — modules manquants dans le workspace. Ajoutez-les pour compléter le graphe.`
      );
    }

    // Redundancy
    if (redundancy.highConfidenceCount > 0) {
      insights.push(
        `⚠ ${redundancy.highConfidenceCount} doublon(s) critique(s) détecté(s) — des services quasi-identiques existent dans plusieurs projets.`
      );
    }
    if (redundancy.mediumConfidenceCount > 0) {
      insights.push(
        `${redundancy.mediumConfidenceCount} chevauchement(s) fonctionnel(s) détecté(s) — potentiel de mutualisation.`
      );
    }

    // Mutualization
    if (mutualization.summary.totalRecommendations > 0) {
      insights.push(
        `${mutualization.summary.totalRecommendations} recommandation(s) de mutualisation — économie estimée de ${mutualization.summary.totalEstimatedLinesSaved} lignes de code.`
      );
    }

    // Technologies
    const allTechs = new Set<string>();
    for (const p of projects) {
      this.detectTechnologies(p.ir).forEach(t => allTechs.add(t));
    }
    if (allTechs.size > 0) {
      insights.push(
        `Technologies détectées : ${[...allTechs].join(", ")}.`
      );
    }

    return insights;
  }

  /**
   * Detect technologies used in a project from its IR.
   */
  private detectTechnologies(ir: ProjectIR): string[] {
    const techs: string[] = [];

    // Check dependencies
    const depNames = ir.dependencies.map(d => `${d.groupId}:${d.artifactId}`.toLowerCase());

    if (depNames.some(d => d.includes("ejb"))) techs.push("EJB");
    if (depNames.some(d => d.includes("hibernate"))) techs.push("Hibernate");
    if (depNames.some(d => d.includes("jsf") || d.includes("faces"))) techs.push("JSF");
    if (depNames.some(d => d.includes("struts"))) techs.push("Struts");
    if (depNames.some(d => d.includes("jms") || d.includes("activemq"))) techs.push("JMS");
    if (depNames.some(d => d.includes("servlet"))) techs.push("Servlet");
    if (depNames.some(d => d.includes("jax-ws") || d.includes("soap"))) techs.push("SOAP");
    if (depNames.some(d => d.includes("jdbc"))) techs.push("JDBC");

    // Check from use cases
    for (const uc of ir.useCases) {
      if (uc.rawSource?.includes("@Stateless") || uc.rawSource?.includes("@Stateful")) {
        if (!techs.includes("EJB")) techs.push("EJB");
      }
      if (uc.rawSource?.includes("HibernateDao") || uc.rawSource?.includes("SessionFactory")) {
        if (!techs.includes("Hibernate")) techs.push("Hibernate");
      }
      if (uc.rawSource?.includes("PreparedStatement") || uc.rawSource?.includes("ResultSet")) {
        if (!techs.includes("JDBC")) techs.push("JDBC");
      }
    }

    // Check EJB 2.x beans
    if (ir.ejb2xBeans && ir.ejb2xBeans.length > 0) {
      if (!techs.includes("EJB 2.x")) techs.push("EJB 2.x");
    }

    // Check handler pattern
    if (ir.handlerPattern) {
      techs.push("Handler Pattern");
    }

    // Check batch jobs
    if (ir.batchJobs && ir.batchJobs.length > 0) {
      techs.push("JSR-352 Batch");
    }

    return techs;
  }
}
