/**
 * RuleConflictResolver — Gère les contradictions entre règles d'apprentissage.
 *
 * Cas de conflit : deux règles s'appliquent mais suggèrent des choix DIFFÉRENTS.
 *
 * Stratégie de résolution (par priorité) :
 *   1. Règle plus spécifique (plus de patterns) gagne
 *   2. Si égalité de spécificité : score = confidence * log(occurrence_count + 1)
 *   3. Règle client bat règle globale si confiance équivalente
 *   4. Conflit non résolvable → présenter les deux options à l'utilisateur
 *
 * @author Hamza NORDINE
 */

import type { LearningRule } from "../../drizzle/schema";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ConflictCandidate {
  rule: LearningRule;
  matchScore: number;
}

export interface ConflictResolution {
  resolved: boolean;
  winner?: LearningRule;
  loser?: LearningRule;
  reason: string;
  /** Si non résolu, les deux options en conflit */
  conflictOptions?: Array<{
    option: string;
    confidence: number;
    occurrences: number;
    ruleId: number;
    isClient: boolean;
  }>;
}

// ─── Helper Functions ───────────────────────────────────────────────────────

/**
 * Compte le nombre de patterns non-null dans une règle.
 * Plus de patterns = plus spécifique.
 */
function countPatterns(rule: LearningRule): number {
  let count = 0;
  if (rule.patternClassName) count++;
  if (rule.patternMethodName) count++;
  if (rule.patternPackage) count++;
  if (rule.patternJavadoc) count++;
  if (rule.patternAnnotations) count++;
  if (rule.patternReturnType) count++;
  if (rule.patternParamTypes) count++;
  return count;
}

/**
 * Calcule le score composite d'une règle pour le départage.
 * score = confidence * log(occurrence_count + 1)
 */
function compositeScore(rule: LearningRule): number {
  return rule.confidence * Math.log(rule.occurrenceCount + 1);
}

// ─── RuleConflictResolver Class ─────────────────────────────────────────────

export class RuleConflictResolver {
  /**
   * Résout un conflit entre deux ou plusieurs règles candidates.
   *
   * @param candidates - Les règles en conflit (avec leur matchScore)
   * @returns La résolution du conflit
   */
  resolve(candidates: ConflictCandidate[]): ConflictResolution {
    if (candidates.length < 2) {
      return {
        resolved: true,
        winner: candidates[0]?.rule,
        reason: "Pas de conflit (une seule règle candidate)",
      };
    }

    // Grouper par chosenOption pour identifier les vrais conflits
    const byOption = new Map<string, ConflictCandidate[]>();
    for (const c of candidates) {
      const opt = c.rule.chosenOption;
      if (!byOption.has(opt)) byOption.set(opt, []);
      byOption.get(opt)!.push(c);
    }

    // Si toutes les règles suggèrent la même option → pas de conflit
    if (byOption.size === 1) {
      const best = candidates.sort((a, b) => b.matchScore - a.matchScore)[0];
      return {
        resolved: true,
        winner: best.rule,
        reason: "Toutes les règles s'accordent sur la même option",
      };
    }

    // Prendre le meilleur candidat de chaque option
    const topPerOption: ConflictCandidate[] = [];
    for (const [, group] of byOption) {
      const best = group.sort((a, b) => b.matchScore - a.matchScore)[0];
      topPerOption.push(best);
    }

    // Trier les top candidats par les critères de résolution
    const sorted = topPerOption.sort((a, b) => {
      const ruleA = a.rule;
      const ruleB = b.rule;

      // 1. Spécificité (nombre de patterns)
      const specA = countPatterns(ruleA);
      const specB = countPatterns(ruleB);
      if (specA !== specB) return specB - specA;

      // 2. Score composite (confidence * log(occurrences))
      const scoreA = compositeScore(ruleA);
      const scoreB = compositeScore(ruleB);
      if (Math.abs(scoreA - scoreB) > 0.01) return scoreB - scoreA;

      // 3. Règle client > règle globale
      const clientA = ruleA.tenantId !== "global" ? 1 : 0;
      const clientB = ruleB.tenantId !== "global" ? 1 : 0;
      if (clientA !== clientB) return clientB - clientA;

      // 4. Match score
      return b.matchScore - a.matchScore;
    });

    const winner = sorted[0];
    const loser = sorted[1];

    // Vérifier si la différence est suffisante pour résoudre
    const winnerSpec = countPatterns(winner.rule);
    const loserSpec = countPatterns(loser.rule);
    const winnerScore = compositeScore(winner.rule);
    const loserScore = compositeScore(loser.rule);

    // Résolution claire si :
    // - Spécificité différente
    // - OU score composite significativement différent (>20%)
    // - OU l'un est client et l'autre global
    const specDiff = winnerSpec > loserSpec;
    const scoreDiff = winnerScore > loserScore * 1.2;
    const tenantDiff = winner.rule.tenantId !== "global" && loser.rule.tenantId === "global";

    if (specDiff || scoreDiff || tenantDiff) {
      let reason = "";
      if (specDiff) {
        reason = `Règle plus spécifique (${winnerSpec} patterns vs ${loserSpec})`;
      } else if (tenantDiff) {
        reason = `Règle client prioritaire sur règle globale`;
      } else {
        reason = `Score composite supérieur (${winnerScore.toFixed(2)} vs ${loserScore.toFixed(2)})`;
      }

      return {
        resolved: true,
        winner: winner.rule,
        loser: loser.rule,
        reason,
      };
    }

    // Conflit non résolvable → présenter à l'utilisateur
    return {
      resolved: false,
      reason: "Conflit entre règles de force équivalente — choix utilisateur requis",
      conflictOptions: sorted.map(c => ({
        option: c.rule.chosenOption,
        confidence: c.rule.confidence,
        occurrences: c.rule.occurrenceCount,
        ruleId: c.rule.id,
        isClient: c.rule.tenantId !== "global",
      })),
    };
  }
}

// ─── Exports for testing ────────────────────────────────────────────────────

export { countPatterns, compositeScore };
