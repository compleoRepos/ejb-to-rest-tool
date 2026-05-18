/**
 * RuleMatcher — Trouve les règles apprises qui s'appliquent à un contexte d'ambiguïté.
 *
 * Pipeline :
 *   1. Récupérer les règles candidates (même ruleType, tenant + global)
 *   2. Calculer un score de correspondance pour chaque règle
 *   3. Appliquer les seuils de confiance :
 *      - >= 0.85 + occurrences >= 3 → auto-résolution
 *      - >= 0.50 → suggestion
 *      - < 0.50 → ignorer
 *
 * Poids des patterns :
 *   className=3, methodName=3, annotations=2, package=1, returnType=2, paramTypes=2
 *
 * @author Compleo
 */

import type { LearningRule } from "../../drizzle/schema";
import type { AmbiguityContext } from "../ambiguity-detector";
import { RuleStore } from "./RuleStore";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MatchContext {
  className: string;
  methodName?: string;
  packageName?: string;
  javadoc?: string;
  annotations?: string[];
  returnType?: string;
  paramTypes?: string[];
}

export interface RuleMatch {
  /** Si true, résoudre automatiquement sans demander à l'utilisateur */
  autoResolve: boolean;
  /** L'option choisie par la règle */
  chosenOption: string;
  /** Confiance de la règle (0.0 à 1.0) */
  confidence: number;
  /** ID de la règle en DB */
  ruleId: number;
  /** Score de correspondance (nombre de patterns matchés pondéré) */
  matchScore: number;
  /** Nombre de fois que cette règle a été confirmée */
  occurrences: number;
  /** Date d'apprentissage */
  learnedAt: Date;
  /** Message pour l'IHM */
  message: string;
  /** Si c'est une suggestion (pas auto-resolve), l'option suggérée */
  suggestion?: string;
}

// ─── Seuils ─────────────────────────────────────────────────────────────────

export const THRESHOLDS = {
  /** Confiance minimale pour considérer une règle */
  MIN_CONFIDENCE: 0.30,
  /** Confiance pour afficher une suggestion */
  SUGGESTION_CONFIDENCE: 0.50,
  /** Confiance pour suggérer fortement (recommandé) */
  STRONG_SUGGESTION_CONFIDENCE: 0.70,
  /** Confiance pour auto-résolution silencieuse */
  AUTO_RESOLVE_CONFIDENCE: 0.85,
  /** Nombre minimum d'occurrences pour auto-résolution */
  AUTO_RESOLVE_MIN_OCCURRENCES: 3,
};

// ─── Pattern Matching ───────────────────────────────────────────────────────

/**
 * Teste si une valeur correspond à un pattern regex.
 * Retourne true si le pattern est null/vide (pas de contrainte).
 */
function matchesPattern(value: string | undefined | null, pattern: string | null): boolean {
  if (!pattern) return false; // No pattern = no match contribution
  if (!value) return false;   // No value = can't match

  try {
    const regex = new RegExp(pattern, "i");
    return regex.test(value);
  } catch {
    // Pattern invalide → comparaison directe
    return value.toLowerCase().includes(pattern.toLowerCase());
  }
}

/**
 * Calcule le score de correspondance entre un contexte et une règle.
 * Retourne un score pondéré basé sur les patterns matchés.
 */
function computeMatchScore(context: MatchContext, rule: LearningRule): number {
  let score = 0;
  let matchedPatterns = 0;
  let totalPatterns = 0;

  // className (poids: 3)
  if (rule.patternClassName) {
    totalPatterns++;
    if (matchesPattern(context.className, rule.patternClassName)) {
      score += 3;
      matchedPatterns++;
    }
  }

  // methodName (poids: 3)
  if (rule.patternMethodName) {
    totalPatterns++;
    if (matchesPattern(context.methodName, rule.patternMethodName)) {
      score += 3;
      matchedPatterns++;
    }
  }

  // annotations (poids: 2)
  if (rule.patternAnnotations) {
    totalPatterns++;
    const annotStr = (context.annotations || []).join(",");
    if (matchesPattern(annotStr, rule.patternAnnotations)) {
      score += 2;
      matchedPatterns++;
    }
  }

  // package (poids: 1)
  if (rule.patternPackage) {
    totalPatterns++;
    if (matchesPattern(context.packageName, rule.patternPackage)) {
      score += 1;
      matchedPatterns++;
    }
  }

  // returnType (poids: 2)
  if (rule.patternReturnType) {
    totalPatterns++;
    if (matchesPattern(context.returnType, rule.patternReturnType)) {
      score += 2;
      matchedPatterns++;
    }
  }

  // paramTypes (poids: 2)
  if (rule.patternParamTypes) {
    totalPatterns++;
    const paramStr = (context.paramTypes || []).join(",");
    if (matchesPattern(paramStr, rule.patternParamTypes)) {
      score += 2;
      matchedPatterns++;
    }
  }

  // javadoc (poids: 1)
  if (rule.patternJavadoc) {
    totalPatterns++;
    if (matchesPattern(context.javadoc, rule.patternJavadoc)) {
      score += 1;
      matchedPatterns++;
    }
  }

  // Aucun pattern matché → score 0
  if (matchedPatterns === 0) return 0;

  // Bonus si tous les patterns de la règle matchent (règle très spécifique)
  if (totalPatterns > 0 && matchedPatterns === totalPatterns) {
    score += 2;
  }

  return score;
}

// ─── RuleMatcher Class ──────────────────────────────────────────────────────

export class RuleMatcher {
  private store: RuleStore;

  constructor(store?: RuleStore) {
    this.store = store || new RuleStore();
  }

  /**
   * Cherche la meilleure règle correspondant au contexte donné.
   *
   * @param ruleType - Type d'ambiguïté (HTTP_VERB_AMBIGUOUS, etc.)
   * @param context - Contexte de l'ambiguïté
   * @param tenantId - ID du tenant (client)
   * @returns RuleMatch si une règle s'applique, null sinon
   */
  async findMatch(
    ruleType: string,
    context: MatchContext,
    tenantId: string
  ): Promise<RuleMatch | null> {
    // Récupérer les règles candidates (tenant + global, confiance >= seuil min)
    const candidates = await this.store.findByTypeAndTenant(
      ruleType,
      tenantId,
      THRESHOLDS.MIN_CONFIDENCE
    );

    if (candidates.length === 0) return null;

    // Calculer le score de correspondance pour chaque règle
    const scored = candidates
      .map(rule => ({
        rule,
        matchScore: computeMatchScore(context, rule),
      }))
      .filter(s => s.matchScore > 0) // Au moins un pattern doit matcher
      .sort((a, b) => {
        // Priorité : tenant client > global
        const aTenant = a.rule.tenantId !== "global" ? 1 : 0;
        const bTenant = b.rule.tenantId !== "global" ? 1 : 0;
        if (aTenant !== bTenant) return bTenant - aTenant;

        // Puis par score de correspondance
        if (a.matchScore !== b.matchScore) return b.matchScore - a.matchScore;

        // Puis par confiance
        if (a.rule.confidence !== b.rule.confidence) return b.rule.confidence - a.rule.confidence;

        // Puis par occurrences
        return b.rule.occurrenceCount - a.rule.occurrenceCount;
      });

    if (scored.length === 0) return null;

    const best = scored[0];
    const { rule, matchScore } = best;

    // Auto-résolution : confiance élevée + vu plusieurs fois
    if (
      rule.confidence >= THRESHOLDS.AUTO_RESOLVE_CONFIDENCE &&
      rule.occurrenceCount >= THRESHOLDS.AUTO_RESOLVE_MIN_OCCURRENCES
    ) {
      return {
        autoResolve: true,
        chosenOption: rule.chosenOption,
        confidence: rule.confidence,
        ruleId: rule.id,
        matchScore,
        occurrences: rule.occurrenceCount,
        learnedAt: rule.createdAt,
        message: `Résolu automatiquement (appris le ${rule.createdAt.toLocaleDateString("fr-FR")}, confirmé ${rule.occurrenceCount} fois, confiance ${Math.round(rule.confidence * 100)}%)`,
      };
    }

    // Suggestion forte
    if (rule.confidence >= THRESHOLDS.STRONG_SUGGESTION_CONFIDENCE) {
      return {
        autoResolve: false,
        chosenOption: rule.chosenOption,
        suggestion: rule.chosenOption,
        confidence: rule.confidence,
        ruleId: rule.id,
        matchScore,
        occurrences: rule.occurrenceCount,
        learnedAt: rule.createdAt,
        message: `Recommandé par Compleo (${rule.occurrenceCount} choix similaires, confiance ${Math.round(rule.confidence * 100)}%)`,
      };
    }

    // Suggestion simple
    if (rule.confidence >= THRESHOLDS.SUGGESTION_CONFIDENCE) {
      return {
        autoResolve: false,
        chosenOption: rule.chosenOption,
        suggestion: rule.chosenOption,
        confidence: rule.confidence,
        ruleId: rule.id,
        matchScore,
        occurrences: rule.occurrenceCount,
        learnedAt: rule.createdAt,
        message: `Basé sur ${rule.occurrenceCount} choix similaires (confiance ${Math.round(rule.confidence * 100)}%)`,
      };
    }

    return null;
  }

  /**
   * Cherche les correspondances pour un ensemble d'ambiguïtés.
   * Retourne une map ambiguityId → RuleMatch.
   */
  async findMatchesForAmbiguities(
    ambiguities: Array<{
      id: string;
      type: string;
      context: {
        className: string;
        methodName?: string;
        packageName?: string;
        javadoc?: string;
      };
    }>,
    tenantId: string
  ): Promise<Map<string, RuleMatch>> {
    const matches = new Map<string, RuleMatch>();

    for (const amb of ambiguities) {
      const context: MatchContext = {
        className: amb.context?.className ?? "",
        methodName: amb.context?.methodName ?? "",
        packageName: amb.context?.packageName ?? "",
        javadoc: amb.context?.javadoc ?? "",
      };

      const match = await this.findMatch(amb.type, context, tenantId);
      if (match) {
        matches.set(amb.id, match);
      }
    }

    return matches;
  }
}

// ─── Exports for testing ────────────────────────────────────────────────────

export { computeMatchScore, matchesPattern };
