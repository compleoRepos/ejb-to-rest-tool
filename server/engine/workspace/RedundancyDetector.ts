/**
 * RedundancyDetector — Detects redundant services across workspace projects.
 *
 * Compares use cases and services between projects to find:
 * - Exact duplicates (same class name, same method signatures)
 * - Near-duplicates (similar names, overlapping method signatures)
 * - Functional overlaps (different names but same domain + similar logic)
 *
 * Does NOT modify any existing module — reads ProjectIR data only.
 *
 * @author Hamza NORDINE
 */

import type { ProjectIR, UseCaseIR, ServiceIR, ServiceMethodIR } from "../../java-parser";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface RedundancyMatch {
  /** Unique ID for this match */
  id: string;
  /** Confidence level of the match */
  confidence: "HIGH" | "MEDIUM" | "LOW";
  /** Type of redundancy detected */
  type: "EXACT_DUPLICATE" | "NEAR_DUPLICATE" | "FUNCTIONAL_OVERLAP";
  /** Score 0-100 indicating similarity */
  similarityScore: number;
  /** First project in the match */
  projectA: {
    sessionId: string;
    projectName: string;
    className: string;
    domain: string;
    methods: string[];
  };
  /** Second project in the match */
  projectB: {
    sessionId: string;
    projectName: string;
    className: string;
    domain: string;
    methods: string[];
  };
  /** Shared method signatures */
  sharedMethods: string[];
  /** Human-readable explanation */
  explanation: string;
}

export interface RedundancyReport {
  totalProjectsAnalyzed: number;
  totalUseCasesScanned: number;
  totalServicesScanned: number;
  matches: RedundancyMatch[];
  highConfidenceCount: number;
  mediumConfidenceCount: number;
  lowConfidenceCount: number;
  /** Grouped by domain for easier reading */
  byDomain: Record<string, RedundancyMatch[]>;
}

export interface WorkspaceProjectEntry {
  sessionId: string;
  projectName: string;
  ir: ProjectIR;
}

// ─── RedundancyDetector ────────────────────────────────────────────────────

export class RedundancyDetector {

  /**
   * Analyze all projects in a workspace for redundant services.
   */
  detect(projects: WorkspaceProjectEntry[]): RedundancyReport {
    const matches: RedundancyMatch[] = [];
    let totalUseCases = 0;
    let totalServices = 0;
    let matchId = 0;

    // Collect all use cases and services across projects
    const allUseCases: Array<{ entry: WorkspaceProjectEntry; uc: UseCaseIR }> = [];
    const allServices: Array<{ entry: WorkspaceProjectEntry; svc: ServiceIR }> = [];

    for (const entry of projects) {
      for (const uc of entry.ir.useCases) {
        allUseCases.push({ entry, uc });
        totalUseCases++;
      }
      for (const svc of entry.ir.services) {
        allServices.push({ entry, svc });
        totalServices++;
      }
    }

    // ── Phase 1: Compare UseCases across different projects ──────────────
    for (let i = 0; i < allUseCases.length; i++) {
      for (let j = i + 1; j < allUseCases.length; j++) {
        const a = allUseCases[i];
        const b = allUseCases[j];

        // Skip same project
        if (a.entry.sessionId === b.entry.sessionId) continue;

        const similarity = this.compareUseCases(a.uc, b.uc);
        if (similarity.score >= 40) {
          matchId++;
          matches.push({
            id: `RD-${matchId}`,
            confidence: similarity.score >= 80 ? "HIGH" : similarity.score >= 60 ? "MEDIUM" : "LOW",
            type: similarity.type,
            similarityScore: similarity.score,
            projectA: {
              sessionId: a.entry.sessionId,
              projectName: a.entry.projectName,
              className: a.uc.className,
              domain: a.uc.domain || a.uc.bianDomain || "unknown",
              methods: this.extractMethodNames(a.uc),
            },
            projectB: {
              sessionId: b.entry.sessionId,
              projectName: b.entry.projectName,
              className: b.uc.className,
              domain: b.uc.domain || b.uc.bianDomain || "unknown",
              methods: this.extractMethodNames(b.uc),
            },
            sharedMethods: similarity.sharedMethods,
            explanation: similarity.explanation,
          });
        }
      }
    }

    // ── Phase 2: Compare Services across different projects ──────────────
    for (let i = 0; i < allServices.length; i++) {
      for (let j = i + 1; j < allServices.length; j++) {
        const a = allServices[i];
        const b = allServices[j];

        // Skip same project
        if (a.entry.sessionId === b.entry.sessionId) continue;

        const similarity = this.compareServices(a.svc, b.svc);
        if (similarity.score >= 40) {
          matchId++;
          matches.push({
            id: `RD-${matchId}`,
            confidence: similarity.score >= 80 ? "HIGH" : similarity.score >= 60 ? "MEDIUM" : "LOW",
            type: similarity.type,
            similarityScore: similarity.score,
            projectA: {
              sessionId: a.entry.sessionId,
              projectName: a.entry.projectName,
              className: a.svc.className,
              domain: "service",
              methods: a.svc.methods.map(m => m.name),
            },
            projectB: {
              sessionId: b.entry.sessionId,
              projectName: b.entry.projectName,
              className: b.svc.className,
              domain: "service",
              methods: b.svc.methods.map(m => m.name),
            },
            sharedMethods: similarity.sharedMethods,
            explanation: similarity.explanation,
          });
        }
      }
    }

    // Sort by confidence then score
    matches.sort((a, b) => {
      const confOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      if (confOrder[a.confidence] !== confOrder[b.confidence]) {
        return confOrder[a.confidence] - confOrder[b.confidence];
      }
      return b.similarityScore - a.similarityScore;
    });

    // Group by domain
    const byDomain: Record<string, RedundancyMatch[]> = {};
    for (const m of matches) {
      const domain = m.projectA.domain || "unknown";
      if (!byDomain[domain]) byDomain[domain] = [];
      byDomain[domain].push(m);
    }

    return {
      totalProjectsAnalyzed: projects.length,
      totalUseCasesScanned: totalUseCases,
      totalServicesScanned: totalServices,
      matches,
      highConfidenceCount: matches.filter(m => m.confidence === "HIGH").length,
      mediumConfidenceCount: matches.filter(m => m.confidence === "MEDIUM").length,
      lowConfidenceCount: matches.filter(m => m.confidence === "LOW").length,
      byDomain,
    };
  }

  // ── UseCase comparison ─────────────────────────────────────────────────

  private compareUseCases(a: UseCaseIR, b: UseCaseIR): {
    score: number;
    type: RedundancyMatch["type"];
    sharedMethods: string[];
    explanation: string;
  } {
    let score = 0;
    const reasons: string[] = [];
    const sharedMethods: string[] = [];

    // 1. Exact class name match (very strong signal)
    if (this.normalizeClassName(a.className) === this.normalizeClassName(b.className)) {
      score += 50;
      reasons.push(`Même nom de classe normalisé: ${a.className}`);
    }

    // 2. Similar class name (Levenshtein or stem comparison)
    else if (this.classNameSimilarity(a.className, b.className) > 0.7) {
      score += 30;
      reasons.push(`Noms de classes similaires: ${a.className} ↔ ${b.className}`);
    }

    // 3. Same domain
    const domainA = (a.domain || a.bianDomain || "").toLowerCase();
    const domainB = (b.domain || b.bianDomain || "").toLowerCase();
    if (domainA && domainB && domainA === domainB) {
      score += 15;
      reasons.push(`Même domaine métier: ${domainA}`);
    }

    // 4. Same voIn/voOut types
    if (a.voInType && b.voInType && this.normalizeType(a.voInType) === this.normalizeType(b.voInType)) {
      score += 10;
      reasons.push(`Même type d'entrée: ${a.voInType}`);
    }
    if (a.voOutType && b.voOutType && this.normalizeType(a.voOutType) === this.normalizeType(b.voOutType)) {
      score += 10;
      reasons.push(`Même type de sortie: ${a.voOutType}`);
    }

    // 5. Shared injected services
    const sharedInjections = this.findSharedInjections(a.injectedServices, b.injectedServices);
    if (sharedInjections.length > 0) {
      score += Math.min(sharedInjections.length * 5, 15);
      reasons.push(`${sharedInjections.length} dépendance(s) partagée(s): ${sharedInjections.join(", ")}`);
      sharedMethods.push(...sharedInjections.map(s => `@Inject ${s}`));
    }

    // 6. Method name overlap from rawSource
    const methodsA = this.extractMethodNames(a);
    const methodsB = this.extractMethodNames(b);
    const shared = methodsA.filter(m => methodsB.includes(m));
    if (shared.length > 0) {
      score += Math.min(shared.length * 8, 20);
      reasons.push(`${shared.length} méthode(s) en commun: ${shared.join(", ")}`);
      sharedMethods.push(...shared);
    }

    // Determine type
    let type: RedundancyMatch["type"] = "FUNCTIONAL_OVERLAP";
    if (score >= 80) type = "EXACT_DUPLICATE";
    else if (score >= 60) type = "NEAR_DUPLICATE";

    // Cap at 100
    score = Math.min(score, 100);

    return {
      score,
      type,
      sharedMethods: [...new Set(sharedMethods)],
      explanation: reasons.join(". ") || "Aucune similarité significative détectée",
    };
  }

  // ── Service comparison ─────────────────────────────────────────────────

  private compareServices(a: ServiceIR, b: ServiceIR): {
    score: number;
    type: RedundancyMatch["type"];
    sharedMethods: string[];
    explanation: string;
  } {
    let score = 0;
    const reasons: string[] = [];
    const sharedMethods: string[] = [];

    // 1. Exact class name match
    if (this.normalizeClassName(a.className) === this.normalizeClassName(b.className)) {
      score += 50;
      reasons.push(`Même nom de service normalisé: ${a.className}`);
    }
    // 2. Similar class name
    else if (this.classNameSimilarity(a.className, b.className) > 0.7) {
      score += 30;
      reasons.push(`Noms de services similaires: ${a.className} ↔ ${b.className}`);
    }

    // 3. Method signature overlap
    const sigA = a.methods.map(m => this.methodSignature(m));
    const sigB = b.methods.map(m => this.methodSignature(m));
    const shared = sigA.filter(s => sigB.includes(s));
    if (shared.length > 0) {
      const overlap = shared.length / Math.max(sigA.length, sigB.length, 1);
      score += Math.round(overlap * 40);
      reasons.push(`${shared.length}/${Math.max(sigA.length, sigB.length)} signatures de méthodes identiques`);
      sharedMethods.push(...shared);
    }

    // 4. Shared injected dependencies
    const sharedDeps = this.findSharedInjections(a.injectedDependencies, b.injectedDependencies);
    if (sharedDeps.length > 0) {
      score += Math.min(sharedDeps.length * 5, 15);
      reasons.push(`${sharedDeps.length} dépendance(s) partagée(s)`);
    }

    // Determine type
    let type: RedundancyMatch["type"] = "FUNCTIONAL_OVERLAP";
    if (score >= 80) type = "EXACT_DUPLICATE";
    else if (score >= 60) type = "NEAR_DUPLICATE";

    score = Math.min(score, 100);

    return {
      score,
      type,
      sharedMethods: [...new Set(sharedMethods)],
      explanation: reasons.join(". ") || "Aucune similarité significative détectée",
    };
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  /**
   * Normalize a class name by removing common prefixes/suffixes.
   * e.g., "AddBeneficiariHandler" → "addbeneficiari"
   */
  private normalizeClassName(name: string): string {
    return name
      .replace(/^(Abstract|Base|Default|Impl|Legacy)/, "")
      .replace(/(UC|UseCase|Handler|Bean|EJB|Facade|Service|Impl|Remote|Local|Home)$/i, "")
      .toLowerCase()
      .trim();
  }

  /**
   * Normalize a type name for comparison.
   */
  private normalizeType(type: string): string {
    return type
      .replace(/^(com\.\w+\.)+/, "") // Remove package prefix
      .replace(/(VO|Dto|DTO|Request|Response|Input|Output)$/i, "")
      .toLowerCase();
  }

  /**
   * Calculate similarity between two class names (0-1).
   * Uses Dice coefficient on bigrams.
   */
  private classNameSimilarity(a: string, b: string): number {
    const normA = this.normalizeClassName(a);
    const normB = this.normalizeClassName(b);

    if (normA === normB) return 1.0;
    if (!normA || !normB) return 0;

    const bigramsA = this.bigrams(normA);
    const bigramsB = this.bigrams(normB);

    const intersection = bigramsA.filter(bg => bigramsB.includes(bg));
    return (2 * intersection.length) / (bigramsA.length + bigramsB.length);
  }

  private bigrams(str: string): string[] {
    const result: string[] = [];
    for (let i = 0; i < str.length - 1; i++) {
      result.push(str.substring(i, i + 2));
    }
    return result;
  }

  /**
   * Find shared injected services between two lists.
   */
  private findSharedInjections(
    a: Array<{ type: string; name: string }>,
    b: Array<{ type: string; name: string }>
  ): string[] {
    if (!a || !b) return [];
    const typesA = a.map(s => s.type.toLowerCase());
    const typesB = b.map(s => s.type.toLowerCase());
    return typesA.filter(t => typesB.includes(t) && t !== "logger" && t !== "entitymanager");
  }

  /**
   * Extract method names from a UseCase's rawSource.
   */
  private extractMethodNames(uc: UseCaseIR): string[] {
    if (!uc.rawSource) return [];
    const regex = /(?:public|protected)\s+\w+(?:<[^>]+>)?\s+(\w+)\s*\(/g;
    const methods: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(uc.rawSource)) !== null) {
      const name = match[1];
      // Skip constructors, getters/setters, and common lifecycle methods
      if (name && !name.startsWith("get") && !name.startsWith("set") &&
          !name.startsWith("is") && name !== "init" && name !== "destroy" &&
          name !== "toString" && name !== "hashCode" && name !== "equals") {
        methods.push(name.toLowerCase());
      }
    }
    return [...new Set(methods)];
  }

  /**
   * Create a normalized method signature for comparison.
   */
  private methodSignature(m: ServiceMethodIR): string {
    const params = m.parameters.map(p => this.normalizeType(p.type)).sort().join(",");
    return `${m.name.toLowerCase()}(${params})→${this.normalizeType(m.returnType)}`;
  }
}
