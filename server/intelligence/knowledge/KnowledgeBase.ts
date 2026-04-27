/**
 * KnowledgeBase — Agrège toutes les règles métier par catégorie.
 * Point d'entrée unique pour le moteur d'intelligence.
 * Total: 816 règles dans 18 catégories.
 *
 * @author Compleo
 */

import type { Rule, RuleContext, RuleHit } from "./rules/RuleEngine";
type RuleCategory = string;

// ─── Catégories originales (Prompt 7) ───
import { financialRules } from "./rules/financial/FinancialRules";
import { securityRules } from "./rules/security/SecurityRules";
import { performanceRules } from "./rules/performance/PerformanceRules";
import { architectureRules } from "./rules/architecture/ArchitectureRules";
import { jakartaRules } from "./rules/jakarta/JakartaRules";

// ─── Enrichissements étendus (Prompt 8 — Batch 1) ───
import { financialExtendedRules } from "./rules/financial/FinancialExtendedRules";
import { securityExtendedRules } from "./rules/security/SecurityExtendedRules";
import { performanceExtendedRules } from "./rules/performance/PerformanceExtendedRules";
import { architectureExtendedRules } from "./rules/architecture/ArchitectureExtendedRules";
import { jakartaExtendedRules } from "./rules/jakarta/JakartaExtendedRules";

// ─── Nouvelles catégories (Prompt 8 — Batch 2) ───
import { testingRules } from "./rules/testing/TestingRules";
import { loggingRules } from "./rules/logging/LoggingRules";
import { resilienceRules } from "./rules/resilience/ResilienceRules";
import { cloudNativeRules } from "./rules/cloud/CloudNativeRules";
import { codeQualityRules } from "./rules/code-quality/CodeQualityRules";

// ─── Catégories supplémentaires (Prompt 8 — Batch 3) ───
import { apiDesignRules } from "./rules/api-design/ApiDesignRules";
import { databaseRules } from "./rules/database/DatabaseRules";
import { springMigrationRules } from "./rules/spring/SpringMigrationRules";
import { i18nRules } from "./rules/i18n/I18nRules";
import { dependencyRules } from "./rules/dependency/DependencyRules";

// ─── Catégories finales (Prompt 8 — Batch 4) ───
import { concurrencyRules } from "./rules/concurrency/ConcurrencyRules";
import { observabilityRules } from "./rules/observability/ObservabilityRules";
import { errorHandlingRules } from "./rules/error-handling/ErrorHandlingRules";

export interface KnowledgeBaseStats {
  totalRules: number;
  byCategory: Record<string, number>;
  bySeverity: Record<string, number>;
}

export class KnowledgeBase {
  private rules: Rule[] = [];

  constructor() {
    this.rules = [
      // Prompt 7 — 47 règles originales
      ...financialRules,
      ...securityRules,
      ...performanceRules,
      ...architectureRules,
      ...jakartaRules,
      // Prompt 8 Batch 1 — Enrichissements des 5 catégories existantes (+224)
      ...financialExtendedRules,
      ...securityExtendedRules,
      ...performanceExtendedRules,
      ...architectureExtendedRules,
      ...jakartaExtendedRules,
      // Prompt 8 Batch 2 — 5 nouvelles catégories (+235)
      ...testingRules,
      ...loggingRules,
      ...resilienceRules,
      ...cloudNativeRules,
      ...codeQualityRules,
      // Prompt 8 Batch 3 — 5 catégories supplémentaires (+210)
      ...apiDesignRules,
      ...databaseRules,
      ...springMigrationRules,
      ...i18nRules,
      ...dependencyRules,
      // Prompt 8 Batch 4 — 3 catégories finales (+100)
      ...concurrencyRules,
      ...observabilityRules,
      ...errorHandlingRules,
    ];
  }

  /**
   * Retourne toutes les règles.
   */
  getAllRules(): Rule[] {
    return this.rules;
  }

  /**
   * Retourne les règles d'une catégorie.
   */
  getRulesByCategory(category: RuleCategory): Rule[] {
    return this.rules.filter((r) => r.category === category);
  }

  /**
   * Retourne une règle par ID.
   */
  getRuleById(id: string): Rule | undefined {
    return this.rules.find((r) => r.id === id);
  }

  /**
   * Évalue toutes les règles sur un contexte donné.
   */
  evaluate(ctx: RuleContext): RuleHit[] {
    const hits: RuleHit[] = [];
    for (const rule of this.rules) {
      try {
        const ruleHits = rule.evaluate(ctx);
        // Inject category and className from rule/context if not set by the rule
        for (const hit of ruleHits) {
          if (!hit.category) hit.category = rule.category;
          if (!hit.className) hit.className = ctx.className;
          if (!hit.reason) hit.reason = hit.message;
        }
        hits.push(...ruleHits);
      } catch (err) {
        // Silenced in production to avoid log spam with 816 rules
      }
    }
    return hits;
  }

  /**
   * Évalue uniquement les règles d'une catégorie.
   */
  evaluateCategory(ctx: RuleContext, category: RuleCategory): RuleHit[] {
    const categoryRules = this.getRulesByCategory(category);
    const hits: RuleHit[] = [];
    for (const rule of categoryRules) {
      try {
        hits.push(...rule.evaluate(ctx));
      } catch (err) {
        // Silenced
      }
    }
    return hits;
  }

  /**
   * Statistiques de la knowledge base.
   */
  getStats(): KnowledgeBaseStats {
    const byCategory: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};

    for (const rule of this.rules) {
      byCategory[rule.category] = (byCategory[rule.category] || 0) + 1;
      bySeverity[rule.severity] = (bySeverity[rule.severity] || 0) + 1;
    }

    return {
      totalRules: this.rules.length,
      byCategory,
      bySeverity,
    };
  }

  /**
   * Ajoute des règles dynamiquement.
   */
  addRules(newRules: Rule[]): void {
    this.rules.push(...newRules);
  }

  /**
   * Nombre total de règles.
   */
  get ruleCount(): number {
    return this.rules.length;
  }

  /**
   * Retourne les catégories disponibles.
   */
  getCategories(): string[] {
    return [...new Set(this.rules.map((r) => r.category))];
  }
}
