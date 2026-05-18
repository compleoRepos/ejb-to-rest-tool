/**
 * ConfidenceScorer — Gère le renforcement et la dégradation de la confiance des règles.
 *
 * Scénarios :
 *   A) Confirmation du même choix → renforcer (+0.05, max 1.0)
 *   B) Choix différent d'une règle existante → affaiblir (-0.10)
 *   C) Aucune règle existante → créer via RuleInferrer
 *   D) Correction d'une auto-résolution → pénalité forte (-0.30)
 *
 * Formule progressive :
 *   1 confirmation  → 0.60
 *   3 confirmations → 0.75
 *   5 confirmations → 0.85 (seuil auto-résolution)
 *   10 confirmations → 0.95
 *   Correction user  → -0.30
 *
 * @author Compleo
 */

import type { LearningRule } from "../../drizzle/schema";
import type { Ambiguity, UserChoice } from "../ambiguity-detector";
import { RuleStore } from "./RuleStore";
import { RuleInferrer } from "./RuleInferrer";
import { RuleMatcher, type RuleMatch } from "./RuleMatcher";

// ─── Constants ──────────────────────────────────────────────────────────────

export const CONFIDENCE = {
  /** Boost par confirmation */
  REINFORCE_BOOST: 0.05,
  /** Pénalité pour choix différent */
  CONTRADICT_PENALTY: 0.10,
  /** Pénalité forte pour correction d'auto-résolution */
  AUTO_RESOLVE_CORRECTION_PENALTY: 0.30,
  /** Seuil sous lequel une règle est désactivée */
  DEACTIVATION_THRESHOLD: 0.20,
  /** Seuil sous lequel une règle perd le mode auto-résolution */
  AUTO_RESOLVE_REMOVAL_THRESHOLD: 0.30,
  /** Confiance maximale */
  MAX_CONFIDENCE: 1.0,
  /** Confiance minimale */
  MIN_CONFIDENCE: 0.0,
};

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ScoringResult {
  action: "reinforced" | "degraded" | "created" | "corrected";
  ruleId?: number;
  previousConfidence?: number;
  newConfidence?: number;
  rulesCreated?: number;
  message: string;
}

export interface ChoiceWithAutoResolve {
  ambiguityId: string;
  choiceId: string;
  /** Si cette ambiguïté avait été auto-résolue par une règle */
  wasAutoResolved?: boolean;
  /** L'option qui avait été auto-résolue (si différente du choix final) */
  autoResolvedOption?: string;
  /** L'ID de la règle qui avait auto-résolu */
  autoResolvedRuleId?: number;
}

// ─── ConfidenceScorer Class ─────────────────────────────────────────────────

export class ConfidenceScorer {
  private store: RuleStore;
  private inferrer: RuleInferrer;
  private matcher: RuleMatcher;

  constructor(store?: RuleStore) {
    this.store = store || new RuleStore();
    this.inferrer = new RuleInferrer(this.store);
    this.matcher = new RuleMatcher(this.store);
  }

  /**
   * Traite un choix utilisateur et met à jour les règles en conséquence.
   *
   * @param ambiguity - L'ambiguïté résolue
   * @param choice - Le choix de l'utilisateur (avec info auto-résolution)
   * @param tenantId - ID du tenant
   * @param sourceProject - Nom du projet source
   * @param sourceSessionId - ID de la session source
   */
  async processChoice(
    ambiguity: Ambiguity,
    choice: ChoiceWithAutoResolve,
    tenantId: string,
    sourceProject: string,
    sourceSessionId: string
  ): Promise<ScoringResult> {
    // Cas D : Correction d'une auto-résolution
    if (choice.wasAutoResolved && choice.autoResolvedRuleId) {
      if (choice.autoResolvedOption !== choice.choiceId) {
        return this.correctAutoResolution(
          choice.autoResolvedRuleId,
          ambiguity,
          choice,
          tenantId,
          sourceProject,
          sourceSessionId
        );
      }
    }

    // Chercher si une règle existante correspond
    const context = {
      className: ambiguity.context?.className ?? "",
      methodName: ambiguity.context?.methodName ?? "",
      packageName: ambiguity.context?.packageName ?? "",
      javadoc: ambiguity.context?.javadoc ?? "",
    };

    const match = await this.matcher.findMatch(ambiguity.type, context, tenantId);

    if (match) {
      if (match.chosenOption === choice.choiceId) {
        // Cas A : Confirmation du même choix → renforcer
        return this.reinforceRule(match.ruleId, match.confidence);
      } else {
        // Cas B : Choix différent → affaiblir la règle contradictoire + créer nouvelle
        const degradeResult = await this.degradeRule(match.ruleId, match.confidence);

        // Créer une nouvelle règle avec le bon choix
        const createResult = await this.inferrer.processChoices(
          [ambiguity],
          [{ ambiguityId: ambiguity.id, choiceId: choice.choiceId }],
          tenantId,
          sourceProject,
          sourceSessionId
        );

        return {
          action: "degraded",
          ruleId: match.ruleId,
          previousConfidence: match.confidence,
          newConfidence: degradeResult.newConfidence,
          rulesCreated: createResult.rulesCreated,
          message: `Règle #${match.ruleId} dégradée (${Math.round(match.confidence * 100)}% → ${Math.round((degradeResult.newConfidence || 0) * 100)}%). ${createResult.rulesCreated} nouvelle(s) règle(s) créée(s).`,
        };
      }
    }

    // Cas C : Aucune règle existante → créer
    const createResult = await this.inferrer.processChoices(
      [ambiguity],
      [{ ambiguityId: ambiguity.id, choiceId: choice.choiceId }],
      tenantId,
      sourceProject,
      sourceSessionId
    );

    return {
      action: "created",
      rulesCreated: createResult.rulesCreated,
      message: `${createResult.rulesCreated} nouvelle(s) règle(s) créée(s) depuis le choix.`,
    };
  }

  /**
   * Traite un ensemble de choix en batch.
   */
  async processChoices(
    ambiguities: Ambiguity[],
    choices: ChoiceWithAutoResolve[],
    tenantId: string,
    sourceProject: string,
    sourceSessionId: string
  ): Promise<ScoringResult[]> {
    const results: ScoringResult[] = [];

    for (const choice of choices) {
      const ambiguity = ambiguities.find(a => a.id === choice.ambiguityId);
      if (!ambiguity) continue;

      const result = await this.processChoice(
        ambiguity,
        choice,
        tenantId,
        sourceProject,
        sourceSessionId
      );
      results.push(result);
    }

    return results;
  }

  // ─── Private Methods ───────────────────────────────────────────────────

  private async reinforceRule(ruleId: number, currentConfidence: number): Promise<ScoringResult> {
    const updated = await this.store.reinforce(ruleId, CONFIDENCE.REINFORCE_BOOST);
    const newConfidence = updated?.confidence ?? currentConfidence + CONFIDENCE.REINFORCE_BOOST;

    return {
      action: "reinforced",
      ruleId,
      previousConfidence: currentConfidence,
      newConfidence: Math.min(CONFIDENCE.MAX_CONFIDENCE, newConfidence),
      message: `Règle #${ruleId} renforcée (${Math.round(currentConfidence * 100)}% → ${Math.round(Math.min(CONFIDENCE.MAX_CONFIDENCE, newConfidence) * 100)}%)`,
    };
  }

  private async degradeRule(
    ruleId: number,
    currentConfidence: number
  ): Promise<{ newConfidence: number }> {
    const updated = await this.store.degrade(ruleId, CONFIDENCE.CONTRADICT_PENALTY);
    const newConfidence = updated?.confidence ?? Math.max(CONFIDENCE.MIN_CONFIDENCE, currentConfidence - CONFIDENCE.CONTRADICT_PENALTY);

    return { newConfidence };
  }

  private async correctAutoResolution(
    ruleId: number,
    ambiguity: Ambiguity,
    choice: ChoiceWithAutoResolve,
    tenantId: string,
    sourceProject: string,
    sourceSessionId: string
  ): Promise<ScoringResult> {
    // Pénalité forte sur la règle qui a mal auto-résolu
    const rule = await this.store.getById(ruleId);
    const previousConfidence = rule?.confidence ?? 0;

    await this.store.degrade(ruleId, CONFIDENCE.AUTO_RESOLVE_CORRECTION_PENALTY);

    const updatedRule = await this.store.getById(ruleId);
    const newConfidence = updatedRule?.confidence ?? 0;

    // Si la confiance tombe sous le seuil, désactiver l'auto-résolution
    if (newConfidence < CONFIDENCE.AUTO_RESOLVE_REMOVAL_THRESHOLD) {
      // La règle reste active mais ne sera plus auto-résolue
      // (le seuil d'auto-résolution est 0.85, donc elle ne sera plus auto-résolue)
    }

    // Créer une nouvelle règle avec le bon choix
    const createResult = await this.inferrer.processChoices(
      [ambiguity],
      [{ ambiguityId: ambiguity.id, choiceId: choice.choiceId }],
      tenantId,
      sourceProject,
      sourceSessionId
    );

    return {
      action: "corrected",
      ruleId,
      previousConfidence,
      newConfidence,
      rulesCreated: createResult.rulesCreated,
      message: `Correction d'auto-résolution : règle #${ruleId} pénalisée (${Math.round(previousConfidence * 100)}% → ${Math.round(newConfidence * 100)}%). ${createResult.rulesCreated} nouvelle(s) règle(s) créée(s).`,
    };
  }
}
