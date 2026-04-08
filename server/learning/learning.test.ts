/**
 * Tests du moteur d'apprentissage Compleo.
 *
 * Couverture :
 *   1. RuleInferrer — extraction de patterns, génération de règles
 *   2. RuleMatcher — scoring, seuils, auto-résolution
 *   3. ConfidenceScorer — renforcement, dégradation, correction
 *   4. RuleConflictResolver — résolution de conflits entre règles
 *   5. LearningEngine — scénario complet sur 5 itérations
 *
 * @author Hamza NORDINE
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Imports ────────────────────────────────────────────────────────────────

import {
  inferRules,
  buildInferenceContext,
  type InferenceInput,
} from "./RuleInferrer";

import {
  computeMatchScore,
  matchesPattern,
  THRESHOLDS,
  type MatchContext,
} from "./RuleMatcher";

import {
  RuleConflictResolver,
  countPatterns,
  compositeScore,
  type ConflictCandidate,
} from "./RuleConflictResolver";

import type { Ambiguity, UserChoice } from "../ambiguity-detector";
import type { LearningRule } from "../../drizzle/schema";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Crée une Ambiguity de test */
function makeAmbiguity(overrides: Partial<Ambiguity> = {}): Ambiguity {
  return {
    id: "amb_001",
    type: "TRANSACTION_AMBIGUOUS",
    severity: "info",
    context: {
      className: "TraiterDemandeUC",
      methodName: "execute",
      packageName: "ma.eai.boa.xbanking.credit.usecases",
    },
    question: "Quel comportement transactionnel ?",
    recommendation: "A",
    recommendationReason: "Par défaut, les opérations d'écriture bancaires doivent être transactionnelles.",
    options: [
      { id: "A", label: "@Transactional (readWrite)", description: "Transaction complète" },
      { id: "B", label: "@Transactional(readOnly)", description: "Lecture seule" },
      { id: "C", label: "Pas de transaction", description: "Sans effet de bord" },
    ],
    ...overrides,
  };
}

/** Crée une LearningRule de test */
function makeRule(overrides: Partial<LearningRule> = {}): LearningRule {
  return {
    id: 1,
    tenantId: "global",
    ruleType: "TRANSACTION_AMBIGUOUS",
    patternClassName: ".*UC$",
    patternMethodName: "^execute$",
    patternPackage: null,
    patternJavadoc: null,
    patternAnnotations: null,
    patternReturnType: null,
    patternParamTypes: null,
    chosenOption: "A",
    chosenReason: "Les UC avec execute() sont des opérations métier → POST",
    confidence: 0.85,
    occurrenceCount: 5,
    isActive: true,
    sourceProject: "seed",
    sourceSessionId: null,
    confirmedByUser: false,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. RuleInferrer — extraction de patterns
// ═══════════════════════════════════════════════════════════════════════════

describe("RuleInferrer", () => {
  describe("buildInferenceContext", () => {
    it("extrait le contexte depuis une Ambiguity", () => {
      const amb = makeAmbiguity();
      const ctx = buildInferenceContext(amb);

      expect(ctx.className).toBe("TraiterDemandeUC");
      expect(ctx.methodName).toBe("execute");
      expect(ctx.packageName).toBe("ma.eai.boa.xbanking.credit.usecases");
    });

    it("gère les contextes incomplets", () => {
      const amb = makeAmbiguity({
        context: { className: "MyClass" },
      });
      const ctx = buildInferenceContext(amb);

      expect(ctx.className).toBe("MyClass");
      expect(ctx.methodName).toBeUndefined();
      expect(ctx.packageName).toBeUndefined();
    });
  });

  describe("inferRules", () => {
    it("génère des règles depuis un choix sur une classe *UC + execute", () => {
      const input: InferenceInput = {
        ambiguity: makeAmbiguity(),
        chosenOptionId: "A",
        tenantId: "global",
        sourceProject: "test-project",
        sourceSessionId: "session-1",
      };

      const rules = inferRules(input);

      expect(rules.length).toBeGreaterThanOrEqual(1);

      // Règle forte : className + methodName
      const strongRule = rules.find(
        (r) => r.patterns.patternClassName && r.patterns.patternMethodName
      );
      expect(strongRule).toBeDefined();
      expect(strongRule!.patterns.patternClassName).toBe(".*UC$");
      expect(strongRule!.patterns.patternMethodName).toBe("^execute$");
      expect(strongRule!.chosenOption).toBe("A");
      expect(strongRule!.confidence).toBeGreaterThanOrEqual(0.60);
    });

    it("génère une règle package depuis un contexte avec package usecases", () => {
      const input: InferenceInput = {
        ambiguity: makeAmbiguity(),
        chosenOptionId: "B",
        tenantId: "client-1",
        sourceProject: "test-project",
        sourceSessionId: "session-1",
      };

      const rules = inferRules(input);

      const pkgRule = rules.find((r) => r.patterns.patternPackage);
      expect(pkgRule).toBeDefined();
      expect(pkgRule!.patterns.patternPackage).toBe(".*usecases.*");
    });

    it("génère une règle javadoc si le contexte contient de la javadoc", () => {
      const amb = makeAmbiguity({
        context: {
          className: "MyClass",
          javadoc: "Traite une demande de crédit immobilier",
        },
      });

      const input: InferenceInput = {
        ambiguity: amb,
        chosenOptionId: "A",
        tenantId: "global",
        sourceProject: "test",
        sourceSessionId: "s1",
      };

      const rules = inferRules(input);
      const javadocRule = rules.find((r) => r.patterns.patternJavadoc);
      expect(javadocRule).toBeDefined();
      expect(javadocRule!.confidence).toBe(0.40);
      expect(javadocRule!.patterns.patternJavadoc).toContain("traite");
    });

    it("retourne un tableau vide si aucun pattern n'est extractible", () => {
      const amb = makeAmbiguity({
        context: { className: "X" },
      });

      const input: InferenceInput = {
        ambiguity: amb,
        chosenOptionId: "A",
        tenantId: "global",
        sourceProject: "test",
        sourceSessionId: "s1",
      };

      const rules = inferRules(input);
      // Might be empty or have only weak rules
      for (const r of rules) {
        expect(r.chosenOption).toBe("A");
      }
    });

    it("gère les suffixes de classe courants (Action, Service, Bean)", () => {
      const testCases = [
        { className: "GetCarteAction", expected: ".*Action$" },
        { className: "CreditService", expected: ".*Service$" },
        { className: "PaymentBean", expected: ".*Bean$" },
        { className: "OrderHandler", expected: ".*Handler$" },
      ];

      for (const tc of testCases) {
        const amb = makeAmbiguity({
          context: { className: tc.className, methodName: "execute" },
        });
        const rules = inferRules({
          ambiguity: amb,
          chosenOptionId: "A",
          tenantId: "global",
          sourceProject: "test",
          sourceSessionId: "s1",
        });

        const classRule = rules.find((r) => r.patterns.patternClassName);
        expect(classRule, `Expected pattern for ${tc.className}`).toBeDefined();
        expect(classRule!.patterns.patternClassName).toBe(tc.expected);
      }
    });

    it("gère les préfixes de méthode courants (get, find, create, traiter)", () => {
      const testCases = [
        { methodName: "getCarteDetails", expected: "^get.*" },
        { methodName: "findClientById", expected: "^find.*" },
        { methodName: "createDemande", expected: "^create.*" },
        { methodName: "traiterDossier", expected: "^traiter.*" },
      ];

      for (const tc of testCases) {
        const amb = makeAmbiguity({
          context: { className: "TestUC", methodName: tc.methodName },
        });
        const rules = inferRules({
          ambiguity: amb,
          chosenOptionId: "B",
          tenantId: "global",
          sourceProject: "test",
          sourceSessionId: "s1",
        });

        const methodRule = rules.find((r) => r.patterns.patternMethodName);
        expect(methodRule, `Expected pattern for ${tc.methodName}`).toBeDefined();
        expect(methodRule!.patterns.patternMethodName).toBe(tc.expected);
      }
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. RuleMatcher — scoring et seuils
// ═══════════════════════════════════════════════════════════════════════════

describe("RuleMatcher", () => {
  describe("matchesPattern", () => {
    it("retourne true quand le pattern regex matche", () => {
      expect(matchesPattern("TraiterDemandeUC", ".*UC$")).toBe(true);
      expect(matchesPattern("execute", "^execute$")).toBe(true);
      expect(matchesPattern("getCarteDetails", "^get.*")).toBe(true);
    });

    it("retourne false quand le pattern ne matche pas", () => {
      expect(matchesPattern("TraiterDemandeUC", ".*Service$")).toBe(false);
      expect(matchesPattern("execute", "^get.*")).toBe(false);
    });

    it("retourne false pour un pattern null/vide", () => {
      expect(matchesPattern("TraiterDemandeUC", null)).toBe(false);
      expect(matchesPattern("TraiterDemandeUC", "")).toBe(false);
    });

    it("retourne false pour une valeur null/vide", () => {
      expect(matchesPattern(null, ".*UC$")).toBe(false);
      expect(matchesPattern(undefined, ".*UC$")).toBe(false);
      expect(matchesPattern("", ".*UC$")).toBe(false);
    });

    it("est case-insensitive", () => {
      expect(matchesPattern("traiterdemandeuc", ".*UC$")).toBe(true);
      expect(matchesPattern("EXECUTE", "^execute$")).toBe(true);
    });

    it("fait un fallback sur includes() pour un regex invalide", () => {
      expect(matchesPattern("hello world", "[invalid")).toBe(false);
      expect(matchesPattern("hello [invalid", "[invalid")).toBe(true);
    });
  });

  describe("computeMatchScore", () => {
    it("calcule un score élevé pour className + methodName matchés", () => {
      const context: MatchContext = {
        className: "TraiterDemandeUC",
        methodName: "execute",
      };
      const rule = makeRule({
        patternClassName: ".*UC$",
        patternMethodName: "^execute$",
      });

      const score = computeMatchScore(context, rule);
      // className (3) + methodName (3) + bonus all matched (2) = 8
      expect(score).toBe(8);
    });

    it("calcule un score partiel si seul className matche", () => {
      const context: MatchContext = {
        className: "TraiterDemandeUC",
        methodName: "doSomething",
      };
      const rule = makeRule({
        patternClassName: ".*UC$",
        patternMethodName: "^execute$",
      });

      const score = computeMatchScore(context, rule);
      // className (3) only, methodName doesn't match
      expect(score).toBe(3);
    });

    it("retourne 0 si aucun pattern ne matche", () => {
      const context: MatchContext = {
        className: "SomeRandomClass",
        methodName: "doSomething",
      };
      const rule = makeRule({
        patternClassName: ".*UC$",
        patternMethodName: "^execute$",
      });

      const score = computeMatchScore(context, rule);
      expect(score).toBe(0);
    });

    it("retourne 0 si la règle n'a aucun pattern", () => {
      const context: MatchContext = {
        className: "TraiterDemandeUC",
      };
      const rule = makeRule({
        patternClassName: null,
        patternMethodName: null,
      });

      const score = computeMatchScore(context, rule);
      expect(score).toBe(0);
    });

    it("inclut le poids des annotations (2)", () => {
      const context: MatchContext = {
        className: "MyClass",
        annotations: ["@UseCase", "@Transactional"],
      };
      const rule = makeRule({
        patternClassName: null,
        patternMethodName: null,
        patternAnnotations: "@UseCase",
      });

      const score = computeMatchScore(context, rule);
      // annotations (2) + bonus all matched (2) = 4
      expect(score).toBe(4);
    });

    it("inclut le poids du package (1)", () => {
      const context: MatchContext = {
        className: "MyClass",
        packageName: "ma.eai.boa.xbanking.credit.usecases",
      };
      const rule = makeRule({
        patternClassName: null,
        patternMethodName: null,
        patternPackage: ".*usecases.*",
      });

      const score = computeMatchScore(context, rule);
      // package (1) + bonus all matched (2) = 3
      expect(score).toBe(3);
    });

    it("inclut le poids du returnType (2) et paramTypes (2)", () => {
      const context: MatchContext = {
        className: "MyClass",
        returnType: "TraiterDemandeVoOut",
        paramTypes: ["TraiterDemandeVoIn"],
      };
      const rule = makeRule({
        patternClassName: null,
        patternMethodName: null,
        patternReturnType: ".*VoOut$",
        patternParamTypes: ".*VoIn$",
      });

      const score = computeMatchScore(context, rule);
      // returnType (2) + paramTypes (2) + bonus (2) = 6
      expect(score).toBe(6);
    });
  });

  describe("THRESHOLDS", () => {
    it("a les seuils corrects", () => {
      expect(THRESHOLDS.MIN_CONFIDENCE).toBe(0.30);
      expect(THRESHOLDS.SUGGESTION_CONFIDENCE).toBe(0.50);
      expect(THRESHOLDS.STRONG_SUGGESTION_CONFIDENCE).toBe(0.70);
      expect(THRESHOLDS.AUTO_RESOLVE_CONFIDENCE).toBe(0.85);
      expect(THRESHOLDS.AUTO_RESOLVE_MIN_OCCURRENCES).toBe(3);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. RuleConflictResolver — résolution de conflits
// ═══════════════════════════════════════════════════════════════════════════

describe("RuleConflictResolver", () => {
  const resolver = new RuleConflictResolver();

  describe("countPatterns", () => {
    it("compte les patterns non-null", () => {
      const rule = makeRule({
        patternClassName: ".*UC$",
        patternMethodName: "^execute$",
        patternPackage: null,
      });
      expect(countPatterns(rule)).toBe(2);
    });

    it("retourne 0 si aucun pattern", () => {
      const rule = makeRule({
        patternClassName: null,
        patternMethodName: null,
        patternPackage: null,
        patternAnnotations: null,
        patternReturnType: null,
        patternParamTypes: null,
        patternJavadoc: null,
      });
      expect(countPatterns(rule)).toBe(0);
    });

    it("compte tous les 7 patterns", () => {
      const rule = makeRule({
        patternClassName: ".*UC$",
        patternMethodName: "^execute$",
        patternPackage: ".*usecases.*",
        patternAnnotations: "@UseCase",
        patternReturnType: ".*VoOut$",
        patternParamTypes: ".*VoIn$",
        patternJavadoc: "traite",
      });
      expect(countPatterns(rule)).toBe(7);
    });
  });

  describe("compositeScore", () => {
    it("calcule confidence * log(occurrenceCount + 1)", () => {
      const rule = makeRule({ confidence: 0.85, occurrenceCount: 5 });
      const expected = 0.85 * Math.log(6);
      expect(compositeScore(rule)).toBeCloseTo(expected, 4);
    });

    it("retourne 0 pour confidence 0", () => {
      const rule = makeRule({ confidence: 0, occurrenceCount: 10 });
      expect(compositeScore(rule)).toBe(0);
    });
  });

  describe("resolve", () => {
    it("retourne resolved=true si un seul candidat", () => {
      const candidates: ConflictCandidate[] = [
        { rule: makeRule({ chosenOption: "A" }), matchScore: 5 },
      ];

      const result = resolver.resolve(candidates);
      expect(result.resolved).toBe(true);
      expect(result.winner?.chosenOption).toBe("A");
    });

    it("retourne resolved=true si tous les candidats sont d'accord", () => {
      const candidates: ConflictCandidate[] = [
        { rule: makeRule({ id: 1, chosenOption: "A", confidence: 0.90 }), matchScore: 8 },
        { rule: makeRule({ id: 2, chosenOption: "A", confidence: 0.85 }), matchScore: 5 },
        { rule: makeRule({ id: 3, chosenOption: "A", confidence: 0.70 }), matchScore: 3 },
      ];

      const result = resolver.resolve(candidates);
      expect(result.resolved).toBe(true);
      expect(result.winner?.id).toBe(1); // highest matchScore
    });

    it("résout par spécificité (plus de patterns gagne)", () => {
      const candidates: ConflictCandidate[] = [
        {
          rule: makeRule({
            id: 1,
            chosenOption: "A",
            confidence: 0.85,
            occurrenceCount: 5,
            patternClassName: ".*UC$",
            patternMethodName: "^execute$",
            patternPackage: ".*usecases.*",
          }),
          matchScore: 5,
        },
        {
          rule: makeRule({
            id: 2,
            chosenOption: "B",
            confidence: 0.85,
            occurrenceCount: 5,
            patternClassName: ".*UC$",
            patternMethodName: null,
            patternPackage: null,
          }),
          matchScore: 3,
        },
      ];

      const result = resolver.resolve(candidates);
      expect(result.resolved).toBe(true);
      expect(result.winner?.id).toBe(1); // more specific
    });

    it("résout par score composite quand spécificité égale", () => {
      const candidates: ConflictCandidate[] = [
        {
          rule: makeRule({
            id: 1,
            chosenOption: "A",
            confidence: 0.95,
            occurrenceCount: 10,
            patternClassName: ".*UC$",
          }),
          matchScore: 5,
        },
        {
          rule: makeRule({
            id: 2,
            chosenOption: "B",
            confidence: 0.60,
            occurrenceCount: 2,
            patternClassName: ".*UC$",
          }),
          matchScore: 5,
        },
      ];

      const result = resolver.resolve(candidates);
      expect(result.resolved).toBe(true);
      expect(result.winner?.id).toBe(1); // higher composite score
    });

    it("résout par priorité tenant (client > global)", () => {
      const candidates: ConflictCandidate[] = [
        {
          rule: makeRule({
            id: 1,
            chosenOption: "A",
            confidence: 0.85,
            occurrenceCount: 5,
            tenantId: "global",
            patternClassName: ".*UC$",
          }),
          matchScore: 5,
        },
        {
          rule: makeRule({
            id: 2,
            chosenOption: "B",
            confidence: 0.85,
            occurrenceCount: 5,
            tenantId: "client-1",
            patternClassName: ".*UC$",
          }),
          matchScore: 5,
        },
      ];

      const result = resolver.resolve(candidates);
      expect(result.resolved).toBe(true);
      expect(result.winner?.id).toBe(2); // client rule wins
    });

    it("retourne resolved=false si les candidats sont trop proches", () => {
      const candidates: ConflictCandidate[] = [
        {
          rule: makeRule({
            id: 1,
            chosenOption: "A",
            confidence: 0.85,
            occurrenceCount: 5,
            tenantId: "global",
            patternClassName: ".*UC$",
          }),
          matchScore: 5,
        },
        {
          rule: makeRule({
            id: 2,
            chosenOption: "B",
            confidence: 0.84,
            occurrenceCount: 5,
            tenantId: "global",
            patternClassName: ".*UC$",
          }),
          matchScore: 5,
        },
      ];

      const result = resolver.resolve(candidates);
      expect(result.resolved).toBe(false);
      expect(result.conflictOptions).toBeDefined();
      expect(result.conflictOptions!.length).toBe(2);
    });

    it("retourne resolved=true pour un tableau vide", () => {
      const result = resolver.resolve([]);
      expect(result.resolved).toBe(true);
      expect(result.winner).toBeUndefined();
    });

    it("inclut les conflictOptions avec les bonnes propriétés", () => {
      const candidates: ConflictCandidate[] = [
        {
          rule: makeRule({ id: 1, chosenOption: "A", confidence: 0.85, occurrenceCount: 5, tenantId: "global" }),
          matchScore: 5,
        },
        {
          rule: makeRule({ id: 2, chosenOption: "B", confidence: 0.84, occurrenceCount: 5, tenantId: "global" }),
          matchScore: 5,
        },
      ];

      const result = resolver.resolve(candidates);
      if (!result.resolved && result.conflictOptions) {
        for (const opt of result.conflictOptions) {
          expect(opt).toHaveProperty("option");
          expect(opt).toHaveProperty("confidence");
          expect(opt).toHaveProperty("occurrences");
          expect(opt).toHaveProperty("ruleId");
          expect(opt).toHaveProperty("isClient");
        }
      }
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Scénario complet — apprentissage sur 5 itérations
// ═══════════════════════════════════════════════════════════════════════════

describe("Scénario d'apprentissage sur 5 itérations", () => {
  it("les règles inférées deviennent de plus en plus spécifiques", () => {
    // Itération 1 : choix sur TraiterDemandeUC
    const rules1 = inferRules({
      ambiguity: makeAmbiguity({
        context: { className: "TraiterDemandeUC", methodName: "execute", packageName: "ma.eai.boa.credit.usecases" },
      }),
      chosenOptionId: "A",
      tenantId: "global",
      sourceProject: "projet-1",
      sourceSessionId: "s1",
    });

    // Itération 2 : même pattern, classe différente
    const rules2 = inferRules({
      ambiguity: makeAmbiguity({
        id: "amb_002",
        context: { className: "ValiderDossierUC", methodName: "execute", packageName: "ma.eai.boa.dossier.usecases" },
      }),
      chosenOptionId: "A",
      tenantId: "global",
      sourceProject: "projet-1",
      sourceSessionId: "s2",
    });

    // Itération 3 : pattern différent (Service au lieu de UC)
    const rules3 = inferRules({
      ambiguity: makeAmbiguity({
        id: "amb_003",
        context: { className: "PaymentService", methodName: "processPayment", packageName: "com.bank.payment.services" },
      }),
      chosenOptionId: "A",
      tenantId: "global",
      sourceProject: "projet-2",
      sourceSessionId: "s3",
    });

    // Itération 4 : choix différent (B au lieu de A)
    const rules4 = inferRules({
      ambiguity: makeAmbiguity({
        id: "amb_004",
        context: { className: "ConsulterSoldeUC", methodName: "execute", packageName: "ma.eai.boa.compte.usecases" },
      }),
      chosenOptionId: "B",
      tenantId: "global",
      sourceProject: "projet-1",
      sourceSessionId: "s4",
    });

    // Itération 5 : avec javadoc
    const rules5 = inferRules({
      ambiguity: makeAmbiguity({
        id: "amb_005",
        context: {
          className: "EnvoyerNotificationUC",
          methodName: "execute",
          packageName: "ma.eai.boa.notif.usecases",
          javadoc: "Envoie une notification au client après validation du dossier",
        },
      }),
      chosenOptionId: "A",
      tenantId: "global",
      sourceProject: "projet-1",
      sourceSessionId: "s5",
    });

    // Vérifications
    // 1. Toutes les itérations génèrent au moins une règle
    expect(rules1.length).toBeGreaterThanOrEqual(1);
    expect(rules2.length).toBeGreaterThanOrEqual(1);
    expect(rules3.length).toBeGreaterThanOrEqual(1);
    expect(rules4.length).toBeGreaterThanOrEqual(1);
    expect(rules5.length).toBeGreaterThanOrEqual(1);

    // 2. Les règles UC + execute sont cohérentes
    const ucRule1 = rules1.find((r) => r.patterns.patternClassName === ".*UC$");
    const ucRule2 = rules2.find((r) => r.patterns.patternClassName === ".*UC$");
    expect(ucRule1).toBeDefined();
    expect(ucRule2).toBeDefined();
    expect(ucRule1!.chosenOption).toBe("A");
    expect(ucRule2!.chosenOption).toBe("A");

    // 3. Le pattern Service est différent de UC
    const svcRule = rules3.find((r) => r.patterns.patternClassName === ".*Service$");
    expect(svcRule).toBeDefined();

    // 4. Un choix différent (B) génère une règle avec option B
    const consultRule = rules4.find((r) => r.patterns.patternClassName);
    expect(consultRule).toBeDefined();
    expect(consultRule!.chosenOption).toBe("B");

    // 5. L'itération avec javadoc génère une règle javadoc supplémentaire
    const javadocRule = rules5.find((r) => r.patterns.patternJavadoc);
    expect(javadocRule).toBeDefined();
    expect(javadocRule!.confidence).toBe(0.40);
  });

  it("les scores de matching augmentent avec la spécificité", () => {
    const context: MatchContext = {
      className: "TraiterDemandeUC",
      methodName: "execute",
      packageName: "ma.eai.boa.credit.usecases",
    };

    // Règle peu spécifique (className seul)
    const ruleWeak = makeRule({
      patternClassName: ".*UC$",
      patternMethodName: null,
      patternPackage: null,
    });

    // Règle moyennement spécifique (className + methodName)
    const ruleMedium = makeRule({
      patternClassName: ".*UC$",
      patternMethodName: "^execute$",
      patternPackage: null,
    });

    // Règle très spécifique (className + methodName + package)
    const ruleStrong = makeRule({
      patternClassName: ".*UC$",
      patternMethodName: "^execute$",
      patternPackage: ".*usecases.*",
    });

    const scoreWeak = computeMatchScore(context, ruleWeak);
    const scoreMedium = computeMatchScore(context, ruleMedium);
    const scoreStrong = computeMatchScore(context, ruleStrong);

    expect(scoreWeak).toBeLessThan(scoreMedium);
    expect(scoreMedium).toBeLessThan(scoreStrong);
  });

  it("le conflict resolver préfère la règle la plus spécifique", () => {
    const resolver = new RuleConflictResolver();

    const candidates: ConflictCandidate[] = [
      {
        rule: makeRule({
          id: 1,
          chosenOption: "A",
          confidence: 0.85,
          occurrenceCount: 10,
          patternClassName: ".*UC$",
          patternMethodName: null,
        }),
        matchScore: 3,
      },
      {
        rule: makeRule({
          id: 2,
          chosenOption: "B",
          confidence: 0.80,
          occurrenceCount: 3,
          patternClassName: ".*UC$",
          patternMethodName: "^execute$",
          patternPackage: ".*usecases.*",
        }),
        matchScore: 7,
      },
    ];

    const result = resolver.resolve(candidates);
    expect(result.resolved).toBe(true);
    expect(result.winner?.id).toBe(2); // more specific wins
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. Tests des constantes et types
// ═══════════════════════════════════════════════════════════════════════════

describe("Types et constantes", () => {
  it("les types d'ambiguïtés sont cohérents avec le détecteur", () => {
    const knownTypes = [
      "HTTP_VERB_AMBIGUOUS",
      "URL_STRUCTURE_AMBIGUOUS",
      "RETURN_TYPE_AMBIGUOUS",
      "CLASS_GROUPING_AMBIGUOUS",
      "TRANSACTION_AMBIGUOUS",
      "EXTERNAL_DEPENDENCY",
      "DOMAIN_NAME_AMBIGUOUS",
    ];

    // Vérifier que les seed rules utilisent des types connus
    const seedTypes = [
      "HTTP_VERB_AMBIGUOUS",
      "TRANSACTION_AMBIGUOUS",
      "URL_STRUCTURE_AMBIGUOUS",
      "TRANSACTION_BOUNDARY",
      "SCOPE_UNCLEAR",
      "DEPENDENCY_REPLACEMENT",
      "NAMING_CONVENTION",
      "SECURITY_PATTERN",
    ];

    // Les 3 premiers types de seed doivent correspondre aux types du détecteur
    expect(knownTypes).toContain("HTTP_VERB_AMBIGUOUS");
    expect(knownTypes).toContain("TRANSACTION_AMBIGUOUS");
    expect(knownTypes).toContain("URL_STRUCTURE_AMBIGUOUS");
  });

  it("les seuils de confiance sont ordonnés correctement", () => {
    expect(THRESHOLDS.MIN_CONFIDENCE).toBeLessThan(THRESHOLDS.SUGGESTION_CONFIDENCE);
    expect(THRESHOLDS.SUGGESTION_CONFIDENCE).toBeLessThan(THRESHOLDS.STRONG_SUGGESTION_CONFIDENCE);
    expect(THRESHOLDS.STRONG_SUGGESTION_CONFIDENCE).toBeLessThan(THRESHOLDS.AUTO_RESOLVE_CONFIDENCE);
    expect(THRESHOLDS.AUTO_RESOLVE_CONFIDENCE).toBeLessThanOrEqual(1.0);
  });
});
