/**
 * KnowledgeBase — Agrège toutes les règles métier par catégorie.
 * Point d'entrée unique pour le moteur d'intelligence.
 *
 * @author Hamza NORDINE
 */

import type { Rule, RuleCategory, RuleContext, RuleHit } from "./rules/RuleEngine";
import { financialRules } from "./rules/financial/FinancialRules";
import { securityRules } from "./rules/security/SecurityRules";
import { performanceRules } from "./rules/performance/PerformanceRules";
import { architectureRules } from "./rules/architecture/ArchitectureRules";
import { jakartaRules } from "./rules/jakarta/JakartaRules";

export interface KnowledgeBaseStats {
  totalRules: number;
  byCategory: Record<string, number>;
  bySeverity: Record<string, number>;
}

export class KnowledgeBase {
  private rules: Rule[] = [];

  constructor() {
    this.rules = [
      ...financialRules,
      ...securityRules,
      ...performanceRules,
      ...architectureRules,
      ...jakartaRules,
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
        hits.push(...ruleHits);
      } catch (err) {
        // Log but don't fail — one broken rule shouldn't stop the analysis
        console.warn(`[KnowledgeBase] Rule ${rule.id} failed on ${ctx.className}:`, err);
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
        console.warn(`[KnowledgeBase] Rule ${rule.id} failed:`, err);
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
   * Ajoute des règles dynamiquement (pour les enrichissements Prompt 8).
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
}
