/**
 * LearningEngine — Cerveau du système d'apprentissage automatique des choix.
 *
 * Orchestre les composants :
 *   - RuleInferrer : crée des règles depuis les choix
 *   - RuleMatcher : trouve les règles applicables
 *   - ConfidenceScorer : renforce/dégrade la confiance
 *   - RuleConflictResolver : gère les contradictions
 *   - RuleStore : persistance DB
 *
 * API principale :
 *   - learnFromChoices() : apprend depuis les choix utilisateur
 *   - resolveAmbiguities() : tente de résoudre automatiquement les ambiguïtés
 *   - getRuleStats() : statistiques d'apprentissage
 *   - exportRules() / importRules() : export/import JSON
 *
 * @author Compleo
 */

import type { Ambiguity, UserChoice } from "../ambiguity-detector";
import type { LearningRule, InsertLearningRule } from "../../drizzle/schema";
import { RuleStore, type RuleStats } from "./RuleStore";
import { RuleInferrer } from "./RuleInferrer";
import { RuleMatcher, type RuleMatch, THRESHOLDS, computeMatchScore } from "./RuleMatcher";
import { ConfidenceScorer, type ChoiceWithAutoResolve, type ScoringResult } from "./ConfidenceScorer";
import { RuleConflictResolver, type ConflictCandidate } from "./RuleConflictResolver";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface LearningResult {
  rulesCreated: number;
  rulesReinforced: number;
  rulesDegraded: number;
  rulesCorrected: number;
  details: ScoringResult[];
}

export interface AmbiguityResolution {
  ambiguityId: string;
  /** Si auto-résolu par une règle apprise */
  autoResolved: boolean;
  /** L'option choisie automatiquement */
  chosenOption?: string;
  /** Suggestion pour l'utilisateur (si pas auto-résolu) */
  suggestion?: string;
  /** Confiance de la règle */
  confidence?: number;
  /** Message pour l'IHM */
  message?: string;
  /** ID de la règle utilisée */
  ruleId?: number;
  /** Nombre d'occurrences de la règle */
  occurrences?: number;
  /** Conflit détecté entre règles */
  hasConflict?: boolean;
  /** Options en conflit */
  conflictOptions?: Array<{
    option: string;
    confidence: number;
    occurrences: number;
    ruleId: number;
  }>;
}

export interface ExportedRules {
  version: string;
  tenant: string;
  exportedAt: string;
  stats: RuleStats;
  rules: Array<{
    ruleType: string;
    patterns: Record<string, string | null>;
    chosenOption: string;
    chosenReason: string | null;
    confidence: number;
    occurrenceCount: number;
    isActive: boolean;
    sourceProject: string | null;
    createdAt: string;
  }>;
}

// ─── LearningEngine Class ───────────────────────────────────────────────────

export class LearningEngine {
  private store: RuleStore;
  private inferrer: RuleInferrer;
  private matcher: RuleMatcher;
  private scorer: ConfidenceScorer;
  private conflictResolver: RuleConflictResolver;

  constructor(store?: RuleStore) {
    this.store = store || new RuleStore();
    this.inferrer = new RuleInferrer(this.store);
    this.matcher = new RuleMatcher(this.store);
    this.scorer = new ConfidenceScorer(this.store);
    this.conflictResolver = new RuleConflictResolver();
  }

  // ─── Core API ───────────────────────────────────────────────────────────

  /**
   * Apprend depuis les choix utilisateur.
   * Crée, renforce ou dégrade les règles en conséquence.
   */
  async learnFromChoices(
    ambiguities: Ambiguity[],
    choices: ChoiceWithAutoResolve[],
    tenantId: string,
    sourceProject: string,
    sourceSessionId: string
  ): Promise<LearningResult> {
    const results = await this.scorer.processChoices(
      ambiguities,
      choices,
      tenantId,
      sourceProject,
      sourceSessionId
    );

    return {
      rulesCreated: results.filter(r => r.action === "created").reduce((sum, r) => sum + (r.rulesCreated || 0), 0),
      rulesReinforced: results.filter(r => r.action === "reinforced").length,
      rulesDegraded: results.filter(r => r.action === "degraded").length,
      rulesCorrected: results.filter(r => r.action === "corrected").length,
      details: results,
    };
  }

  /**
   * Tente de résoudre automatiquement les ambiguïtés.
   * Retourne pour chaque ambiguïté : auto-résolu, suggestion, ou rien.
   */
  async resolveAmbiguities(
    ambiguities: Ambiguity[],
    tenantId: string
  ): Promise<AmbiguityResolution[]> {
    const resolutions: AmbiguityResolution[] = [];

    for (const amb of ambiguities) {
      const context = {
        className: amb.context?.className ?? "",
        methodName: amb.context?.methodName ?? "",
        packageName: amb.context?.packageName ?? "",
        javadoc: amb.context?.javadoc ?? "",
      };

      // Chercher toutes les règles candidates
      const candidates = await this.store.findByTypeAndTenant(
        amb.type,
        tenantId,
        THRESHOLDS.MIN_CONFIDENCE
      );

      if (candidates.length === 0) {
        resolutions.push({
          ambiguityId: amb.id,
          autoResolved: false,
        });
        continue;
      }

      // Vérifier les conflits entre règles candidates
      const scoredCandidates: ConflictCandidate[] = candidates
        .map(rule => {
          return {
            rule,
            matchScore: computeMatchScore(context, rule),
          };
        })
        .filter((c: ConflictCandidate) => c.matchScore > 0);

      if (scoredCandidates.length === 0) {
        resolutions.push({
          ambiguityId: amb.id,
          autoResolved: false,
        });
        continue;
      }

      // Grouper par option pour détecter les conflits
      const optionGroups = new Map<string, ConflictCandidate[]>();
      for (const c of scoredCandidates) {
        const opt = c.rule.chosenOption;
        if (!optionGroups.has(opt)) optionGroups.set(opt, []);
        optionGroups.get(opt)!.push(c);
      }

      if (optionGroups.size > 1) {
        // Conflit détecté → résoudre
        const resolution = this.conflictResolver.resolve(scoredCandidates);

        if (resolution.resolved && resolution.winner) {
          // Conflit résolu → utiliser le gagnant
          const match = await this.matcher.findMatch(amb.type, context, tenantId);
          if (match) {
            resolutions.push({
              ambiguityId: amb.id,
              autoResolved: match.autoResolve,
              chosenOption: match.autoResolve ? match.chosenOption : undefined,
              suggestion: match.suggestion || match.chosenOption,
              confidence: match.confidence,
              message: match.message,
              ruleId: match.ruleId,
              occurrences: match.occurrences,
              hasConflict: true,
            });
            continue;
          }
        }

        // Conflit non résolu → présenter à l'utilisateur
        resolutions.push({
          ambiguityId: amb.id,
          autoResolved: false,
          hasConflict: true,
          conflictOptions: resolution.conflictOptions,
          message: resolution.reason,
        });
        continue;
      }

      // Pas de conflit → utiliser le matcher standard
      const match = await this.matcher.findMatch(amb.type, context, tenantId);
      if (match) {
        resolutions.push({
          ambiguityId: amb.id,
          autoResolved: match.autoResolve,
          chosenOption: match.autoResolve ? match.chosenOption : undefined,
          suggestion: match.suggestion || match.chosenOption,
          confidence: match.confidence,
          message: match.message,
          ruleId: match.ruleId,
          occurrences: match.occurrences,
        });
      } else {
        resolutions.push({
          ambiguityId: amb.id,
          autoResolved: false,
        });
      }
    }

    return resolutions;
  }

  // ─── Rule Management ──────────────────────────────────────────────────

  /**
   * Liste les règles avec filtres optionnels.
   */
  async listRules(filter: {
    tenantId?: string;
    ruleType?: string;
    minConfidence?: number;
    isActive?: boolean;
    limit?: number;
  } = {}): Promise<LearningRule[]> {
    return this.store.list(filter);
  }

  /**
   * Confirme manuellement une règle (boost de confiance).
   */
  async confirmRule(ruleId: number): Promise<LearningRule | undefined> {
    return this.store.reinforce(ruleId, 0.15);
  }

  /**
   * Désactive une règle.
   */
  async deactivateRule(ruleId: number): Promise<LearningRule | undefined> {
    return this.store.update(ruleId, { isActive: false });
  }

  /**
   * Supprime une règle.
   */
  async deleteRule(ruleId: number): Promise<boolean> {
    return this.store.delete(ruleId);
  }

  /**
   * Statistiques d'apprentissage.
   */
  async getStats(tenantId?: string): Promise<RuleStats> {
    return this.store.getStats(tenantId);
  }

  // ─── Export / Import ──────────────────────────────────────────────────

  /**
   * Exporte les règles au format JSON.
   */
  async exportRules(tenantId: string): Promise<ExportedRules> {
    const rules = await this.store.exportRules(tenantId);
    const stats = await this.store.getStats(tenantId);

    return {
      version: "1.0",
      tenant: tenantId,
      exportedAt: new Date().toISOString(),
      stats,
      rules: rules.map(r => ({
        ruleType: r.ruleType,
        patterns: {
          className: r.patternClassName,
          methodName: r.patternMethodName,
          package: r.patternPackage,
          javadoc: r.patternJavadoc,
          annotations: r.patternAnnotations,
          returnType: r.patternReturnType,
          paramTypes: r.patternParamTypes,
        },
        chosenOption: r.chosenOption,
        chosenReason: r.chosenReason,
        confidence: r.confidence,
        occurrenceCount: r.occurrenceCount,
        isActive: r.isActive,
        sourceProject: r.sourceProject,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  /**
   * Importe des règles depuis un fichier JSON.
   * Gère les conflits avec les règles existantes.
   */
  async importRules(
    data: ExportedRules,
    targetTenantId: string,
    strategy: "merge" | "replace" = "merge"
  ): Promise<{ imported: number; skipped: number; conflicts: number }> {
    let imported = 0;
    let skipped = 0;
    let conflicts = 0;

    if (strategy === "replace") {
      await this.store.deleteByTenant(targetTenantId);
    }

    for (const rule of data.rules) {
      // Vérifier si une règle similaire existe déjà
      const existing = await this.store.findByTypeAndTenant(
        rule.ruleType,
        targetTenantId,
        0
      );

      const duplicate = existing.find(e =>
        e.chosenOption === rule.chosenOption &&
        e.patternClassName === rule.patterns.className &&
        e.patternMethodName === rule.patterns.methodName
      );

      if (duplicate) {
        if (strategy === "merge") {
          // Garder la règle avec la confiance la plus élevée
          if (rule.confidence > duplicate.confidence) {
            await this.store.update(duplicate.id, {
              confidence: rule.confidence,
              occurrenceCount: Math.max(duplicate.occurrenceCount, rule.occurrenceCount),
            });
            conflicts++;
          } else {
            skipped++;
          }
        }
        continue;
      }

      // Insérer la nouvelle règle
      const toInsert: InsertLearningRule = {
        tenantId: targetTenantId,
        ruleType: rule.ruleType,
        patternClassName: rule.patterns.className || null,
        patternMethodName: rule.patterns.methodName || null,
        patternPackage: rule.patterns.package || null,
        patternJavadoc: rule.patterns.javadoc || null,
        patternAnnotations: rule.patterns.annotations || null,
        patternReturnType: rule.patterns.returnType || null,
        patternParamTypes: rule.patterns.paramTypes || null,
        chosenOption: rule.chosenOption,
        chosenReason: rule.chosenReason,
        confidence: rule.confidence,
        occurrenceCount: rule.occurrenceCount,
        isActive: rule.isActive,
        sourceProject: rule.sourceProject,
        confirmedByUser: true,
      };

      await this.store.insert(toInsert);
      imported++;
    }

    return { imported, skipped, conflicts };
  }
}
