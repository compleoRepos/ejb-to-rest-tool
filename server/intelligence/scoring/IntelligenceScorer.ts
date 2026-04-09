/**
 * IntelligenceScorer — Calcule les scores de maturité, risque et migration.
 * Agrège les résultats des règles pour produire un score composite.
 * 100% déterministe, 0 LLM.
 *
 * @author Hamza NORDINE
 */

import type { RuleHit } from "../knowledge/rules/RuleEngine";

export interface ScoreBreakdown {
  category: string;
  score: number;
  maxScore: number;
  percentage: number;
  hits: number;
  criticalHits: number;
}

export interface IntelligenceScore {
  /** Score global de maturité (0-100) */
  maturityScore: number;
  /** Score de risque (0-100, 100 = très risqué) */
  riskScore: number;
  /** Score de migration readiness (0-100) */
  migrationReadiness: number;
  /** Détail par catégorie */
  breakdown: ScoreBreakdown[];
  /** Grade lettre (A+ à F) */
  grade: string;
  /** Couleur associée au grade */
  gradeColor: string;
  /** Résumé textuel */
  summary: string;
  /** Nombre total de violations */
  totalHits: number;
  /** Nombre de violations critiques */
  criticalHits: number;
  /** Nombre de classes analysées */
  classesAnalyzed: number;
}

// ── Severity weights ───────────────────────────────────────────

const SEVERITY_WEIGHT: Record<string, number> = {
  CRITICAL: 10,
  HIGH: 5,
  MEDIUM: 2,
  LOW: 1,
  critical: 10,
  major: 5,
  minor: 2,
  info: 1,
};

// ── Category max scores ────────────────────────────────────────

const CATEGORY_MAX_SCORE: Record<string, number> = {
  FINANCIAL: 25,
  SECURITY: 25,
  PERFORMANCE: 20,
  ARCHITECTURE: 15,
  JAKARTA: 15,
};

// ── Grade thresholds ───────────────────────────────────────────

const GRADE_THRESHOLDS: { min: number; grade: string; color: string }[] = [
  { min: 95, grade: "A+", color: "#22c55e" },
  { min: 90, grade: "A", color: "#22c55e" },
  { min: 85, grade: "A-", color: "#4ade80" },
  { min: 80, grade: "B+", color: "#84cc16" },
  { min: 75, grade: "B", color: "#a3e635" },
  { min: 70, grade: "B-", color: "#facc15" },
  { min: 65, grade: "C+", color: "#fbbf24" },
  { min: 60, grade: "C", color: "#f59e0b" },
  { min: 55, grade: "C-", color: "#fb923c" },
  { min: 50, grade: "D+", color: "#f97316" },
  { min: 40, grade: "D", color: "#ef4444" },
  { min: 30, grade: "D-", color: "#dc2626" },
  { min: 0, grade: "F", color: "#991b1b" },
];

export class IntelligenceScorer {
  /**
   * Calcule le score complet à partir des hits de règles.
   */
  computeScore(hits: RuleHit[], classesAnalyzed: number): IntelligenceScore {
    const totalHits = hits.length;
    const criticalHits = hits.filter((h) => h.severity === "CRITICAL").length;

    // Group hits by category
    const hitsByCategory = new Map<string, RuleHit[]>();
    for (const hit of hits) {
      const cat = hit.category || "UNKNOWN";
      if (!hitsByCategory.has(cat)) hitsByCategory.set(cat, []);
      hitsByCategory.get(cat)!.push(hit);
    }

    // Compute breakdown per category
    const breakdown: ScoreBreakdown[] = [];
    let totalWeightedPenalty = 0;
    let totalMaxScore = 0;

    for (const [category, maxScore] of Object.entries(CATEGORY_MAX_SCORE)) {
      const categoryHits = hitsByCategory.get(category) || [];
      const penalty = this.computePenalty(categoryHits, classesAnalyzed);
      const score = Math.max(0, maxScore - penalty);

      breakdown.push({
        category,
        score,
        maxScore,
        percentage: maxScore > 0 ? Math.round((score / maxScore) * 100) : 100,
        hits: categoryHits.length,
        criticalHits: categoryHits.filter((h) => h.severity === "CRITICAL").length,
      });

      totalWeightedPenalty += penalty;
      totalMaxScore += maxScore;
    }

    // Compute global scores
    const maturityScore = Math.max(0, Math.min(100,
      Math.round(((totalMaxScore - totalWeightedPenalty) / totalMaxScore) * 100)
    ));

    const riskScore = this.computeRiskScore(hits, classesAnalyzed);
    const migrationReadiness = this.computeMigrationReadiness(hits, classesAnalyzed);

    const { grade, color } = this.computeGrade(maturityScore);
    const summary = this.generateSummary(maturityScore, criticalHits, totalHits, classesAnalyzed);

    return {
      maturityScore,
      riskScore,
      migrationReadiness,
      breakdown,
      grade,
      gradeColor: color,
      summary,
      totalHits,
      criticalHits,
      classesAnalyzed,
    };
  }

  private computePenalty(hits: RuleHit[], classCount: number): number {
    if (classCount === 0) return 0;

    let rawPenalty = 0;
    for (const hit of hits) {
      rawPenalty += SEVERITY_WEIGHT[hit.severity] || 1;
    }

    // Normalize by class count to avoid penalizing large projects
    return Math.min(25, rawPenalty / Math.max(1, classCount) * 5);
  }

  private computeRiskScore(hits: RuleHit[], classCount: number): number {
    if (classCount === 0) return 0;

    const criticalCount = hits.filter((h) => h.severity === "CRITICAL").length;
    const highCount = hits.filter((h) => h.severity === "HIGH").length;
    const securityHits = hits.filter((h) => h.category === "SECURITY").length;
    const financialHits = hits.filter((h) => h.category === "FINANCIAL").length;

    // Risk is heavily weighted towards critical/security issues
    const rawRisk =
      (criticalCount * 15 + highCount * 5 + securityHits * 8 + financialHits * 5) /
      Math.max(1, classCount);

    return Math.min(100, Math.round(rawRisk * 10));
  }

  private computeMigrationReadiness(hits: RuleHit[], classCount: number): number {
    if (classCount === 0) return 100;

    const jakartaHits = hits.filter((h) => h.category === "JAKARTA").length;
    const archHits = hits.filter((h) => h.category === "ARCHITECTURE").length;
    const criticalHits = hits.filter((h) => h.severity === "CRITICAL").length;

    // Migration readiness penalizes Jakarta and architecture issues more
    const penalty = (jakartaHits * 8 + archHits * 3 + criticalHits * 5) / Math.max(1, classCount);
    return Math.max(0, Math.min(100, Math.round(100 - penalty * 10)));
  }

  private computeGrade(score: number): { grade: string; color: string } {
    for (const threshold of GRADE_THRESHOLDS) {
      if (score >= threshold.min) {
        return { grade: threshold.grade, color: threshold.color };
      }
    }
    return { grade: "F", color: "#991b1b" };
  }

  private generateSummary(
    maturity: number,
    critical: number,
    total: number,
    classes: number
  ): string {
    const parts: string[] = [];

    if (maturity >= 90) {
      parts.push("Excellent niveau de maturité.");
    } else if (maturity >= 75) {
      parts.push("Bon niveau de maturité avec quelques améliorations possibles.");
    } else if (maturity >= 60) {
      parts.push("Niveau de maturité moyen — plusieurs points d'amélioration identifiés.");
    } else if (maturity >= 40) {
      parts.push("Niveau de maturité insuffisant — refactoring significatif recommandé.");
    } else {
      parts.push("Niveau de maturité critique — migration urgente nécessaire.");
    }

    if (critical > 0) {
      parts.push(`${critical} violation(s) critique(s) à traiter en priorité.`);
    }

    parts.push(`${total} violation(s) détectée(s) sur ${classes} classe(s) analysée(s).`);

    return parts.join(" ");
  }
}
