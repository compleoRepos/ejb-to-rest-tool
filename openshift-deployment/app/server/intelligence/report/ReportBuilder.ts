/**
 * ReportBuilder — Génère des rapports d'intelligence structurés.
 * Produit des rapports Markdown et JSON à partir des résultats d'analyse.
 * 100% déterministe, 0 LLM.
 *
 * @author Compleo
 */

import type { IntelligenceReport } from "../IntelligenceOrchestrator";
import type { RuleHit } from "../knowledge/rules/RuleEngine";

export interface ReportSection {
  title: string;
  content: string;
  level: number;
}

export class ReportBuilder {
  /**
   * Génère un rapport Markdown complet.
   */
  buildMarkdown(report: IntelligenceReport): string {
    const sections: string[] = [];

    // Header
    sections.push("# Rapport d'Intelligence — Analyse de Code Legacy\n");
    sections.push(`**Date:** ${new Date(report.timestamp).toLocaleDateString("fr-FR")}`);
    sections.push(`**Durée d'analyse:** ${report.durationMs}ms`);
    sections.push(`**Fichiers analysés:** ${report.filesAnalyzed}`);
    sections.push(`**Classes analysées:** ${report.classesAnalyzed}`);
    sections.push(`**Règles évaluées:** ${report.knowledgeBaseStats.totalRules}\n`);

    // Score Summary
    sections.push("## Score de Maturité\n");
    sections.push(`| Métrique | Valeur |`);
    sections.push(`|----------|--------|`);
    sections.push(`| **Score global** | **${report.score.maturityScore}/100** (${report.score.grade}) |`);
    sections.push(`| Score de risque | ${report.score.riskScore}/100 |`);
    sections.push(`| Migration readiness | ${report.score.migrationReadiness}/100 |`);
    sections.push(`| Violations totales | ${report.score.totalHits} |`);
    sections.push(`| Violations critiques | ${report.score.criticalHits} |\n`);
    sections.push(`> ${report.score.summary}\n`);

    // Breakdown by category
    sections.push("## Détail par Catégorie\n");
    sections.push("| Catégorie | Score | Violations | Critiques |");
    sections.push("|-----------|-------|------------|-----------|");
    for (const b of report.score.breakdown) {
      sections.push(`| ${b.category} | ${b.score}/${b.maxScore} (${b.percentage}%) | ${b.hits} | ${b.criticalHits} |`);
    }
    sections.push("");

    // Domain Analysis
    sections.push("## Analyse du Domaine\n");
    sections.push(`**Domaine principal:** ${report.domainAnalysis.primaryDomain}`);
    sections.push(`**Confiance:** ${Math.round(report.domainAnalysis.confidence * 100)}%`);
    if (report.domainAnalysis.subDomains.length > 0) {
      sections.push(`**Sous-domaines:** ${report.domainAnalysis.subDomains.join(", ")}`);
    }
    sections.push("");

    // Top 10 Violations
    sections.push("## Top 10 Violations\n");
    if (report.topViolations.length > 0) {
      sections.push("| # | Sévérité | Règle | Classe | Message |");
      sections.push("|---|----------|-------|--------|---------|");
      report.topViolations.forEach((hit, i) => {
        const location = hit.methodName
          ? `${hit.className}.${hit.methodName}`
          : hit.fieldName
            ? `${hit.className}.${hit.fieldName}`
            : hit.className;
        sections.push(`| ${i + 1} | ${this.severityBadge(hit.severity)} | ${hit.ruleId} | ${location} | ${hit.message} |`);
      });
    } else {
      sections.push("Aucune violation détectée.");
    }
    sections.push("");

    // Violations by category
    for (const [category, hits] of Object.entries(report.hitsByCategory)) {
      sections.push(`### ${category} (${hits.length} violations)\n`);
      const grouped = this.groupByRule(hits);
      for (const [ruleId, ruleHits] of Object.entries(grouped)) {
        sections.push(`#### ${ruleId} — ${ruleHits[0].message.split('"')[0]} (${ruleHits.length}x)\n`);
        for (const hit of ruleHits.slice(0, 5)) {
          const location = hit.methodName || hit.fieldName || hit.className;
          sections.push(`- **${location}**: ${hit.message}`);
          if (hit.fix) {
            sections.push(`  - Fix: \`${hit.fix.newValue}\``);
          }
        }
        if (ruleHits.length > 5) {
          sections.push(`- ... et ${ruleHits.length - 5} autre(s)`);
        }
        sections.push("");
      }
    }

    // Data Profiles
    if (report.dataProfiles.length > 0) {
      sections.push("## Profils de Données\n");
      for (const dp of report.dataProfiles) {
        sections.push(`### ${dp.className} (${dp.totalFields} champs)\n`);
        sections.push(`- Champs sensibles: ${dp.sensitiveFields}`);
        sections.push(`- Champs obligatoires: ${dp.requiredFields}`);
        sections.push(`- Validations suggérées: ${dp.hasValidation ? "Oui" : "Non"}`);
        sections.push("");
      }
    }

    // Recommendations
    sections.push("## Recommandations\n");
    sections.push(this.generateRecommendations(report));

    return sections.join("\n");
  }

  /**
   * Génère un rapport JSON structuré.
   */
  buildJSON(report: IntelligenceReport): object {
    return {
      meta: {
        timestamp: report.timestamp,
        durationMs: report.durationMs,
        filesAnalyzed: report.filesAnalyzed,
        classesAnalyzed: report.classesAnalyzed,
        rulesEvaluated: report.knowledgeBaseStats.totalRules,
      },
      score: report.score,
      domain: report.domainAnalysis,
      violations: {
        total: report.hits.length,
        byCategory: Object.fromEntries(
          Object.entries(report.hitsByCategory).map(([k, v]) => [k, v.length])
        ),
        bySeverity: Object.fromEntries(
          Object.entries(report.hitsBySeverity).map(([k, v]) => [k, v.length])
        ),
        top10: report.topViolations.map((h) => ({
          ruleId: h.ruleId,
          severity: h.severity,
          category: h.category,
          className: h.className,
          method: h.methodName,
          field: h.fieldName,
          message: h.message,
          fix: h.fix?.newValue,
        })),
      },
      dataProfiles: report.dataProfiles.map((dp) => ({
        className: dp.className,
        totalFields: dp.totalFields,
        sensitiveFields: dp.sensitiveFields,
        requiredFields: dp.requiredFields,
      })),
    };
  }

  private severityBadge(severity: string): string {
    switch (severity) {
      case "CRITICAL": return "🔴 CRITICAL";
      case "HIGH": return "🟠 HIGH";
      case "MEDIUM": return "🟡 MEDIUM";
      case "LOW": return "🔵 LOW";
      default: return severity;
    }
  }

  private groupByRule(hits: RuleHit[]): Record<string, RuleHit[]> {
    const grouped: Record<string, RuleHit[]> = {};
    for (const hit of hits) {
      if (!grouped[hit.ruleId]) grouped[hit.ruleId] = [];
      grouped[hit.ruleId].push(hit);
    }
    return grouped;
  }

  private generateRecommendations(report: IntelligenceReport): string {
    const recs: string[] = [];
    const score = report.score;

    // Priority 1: Critical violations
    if (score.criticalHits > 0) {
      recs.push(`1. **Traiter les ${score.criticalHits} violation(s) critique(s) immédiatement** — elles représentent des risques de sécurité ou de perte de données.`);
    }

    // Priority 2: Category-specific
    for (const b of score.breakdown) {
      if (b.percentage < 50) {
        recs.push(`${recs.length + 1}. **${b.category}** — Score ${b.percentage}% : refactoring prioritaire recommandé.`);
      } else if (b.percentage < 75) {
        recs.push(`${recs.length + 1}. **${b.category}** — Score ${b.percentage}% : améliorations recommandées.`);
      }
    }

    // Priority 3: Migration readiness
    if (score.migrationReadiness < 60) {
      recs.push(`${recs.length + 1}. **Migration readiness faible (${score.migrationReadiness}%)** — Résoudre les problèmes Jakarta/Architecture avant de migrer.`);
    }

    if (recs.length === 0) {
      recs.push("Le code est en bon état. Continuer à maintenir les bonnes pratiques.");
    }

    return recs.join("\n");
  }
}
