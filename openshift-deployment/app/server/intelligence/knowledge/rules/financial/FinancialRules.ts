/**
 * FinancialRules — 15 règles métier bancaires.
 * Validation des montants, devises, IBAN, transactions, etc.
 * 100% déterministe, 0 LLM.
 *
 * @author Compleo
 */

import type { Rule, RuleContext, RuleHit } from "../RuleEngine";

// ── Helpers ────────────────────────────────────────────────────

function hasFieldOfType(ctx: RuleContext, typePattern: RegExp): boolean {
  return ctx.fields.some((f) => typePattern.test(f.type));
}

function findFieldsByName(ctx: RuleContext, namePattern: RegExp) {
  return ctx.fields.filter((f) => namePattern.test(f.name));
}

function hasAnnotation(annotations: string[], pattern: RegExp): boolean {
  return annotations.some((a) => pattern.test(a));
}

// ── Rules ──────────────────────────────────────────────────────

export const financialRules: Rule[] = [
  // FIN-001: BigDecimal obligatoire pour les montants
  {
    id: "FIN-001",
    category: "FINANCIAL",
    name: "BigDecimal pour montants",
    severity: "CRITICAL",
    description: "Les champs montant/solde/prix doivent utiliser BigDecimal, jamais double/float",
    evaluate(ctx) {
      const hits: RuleHit[] = [];
      const moneyFields = findFieldsByName(ctx, /montant|amount|solde|balance|prix|price|total|somme/i);
      for (const f of moneyFields) {
        if (/double|float|Double|Float/i.test(f.type)) {
          hits.push({
            ruleId: this.id,
            category: this.category,
            severity: this.severity,
            className: ctx.className,
            fieldName: f.name,
            line: f.line,
            message: `Le champ "${f.name}" utilise ${f.type} au lieu de BigDecimal`,
            reason: "Les types flottants provoquent des erreurs d'arrondi dans les calculs financiers",
            fix: {
              type: "CHANGE_TYPE",
              target: f.name,
              newValue: "BigDecimal",
              additionalImports: ["java.math.BigDecimal"],
            },
          });
        }
      }
      return hits;
    },
  },

  // FIN-002: Devise obligatoire à côté du montant
  {
    id: "FIN-002",
    category: "FINANCIAL",
    name: "Devise obligatoire",
    severity: "HIGH",
    description: "Tout champ montant doit être accompagné d'un champ devise (Currency)",
    evaluate(ctx) {
      const hits: RuleHit[] = [];
      const hasAmount = findFieldsByName(ctx, /montant|amount|solde|balance|prix|price|total/i).length > 0;
      const hasCurrency = findFieldsByName(ctx, /devise|currency|currencyCode/i).length > 0;

      if (hasAmount && !hasCurrency) {
        hits.push({
          ruleId: this.id,
          category: this.category,
          severity: this.severity,
          className: ctx.className,
          message: "Champ montant détecté sans champ devise associé",
          reason: "Un montant sans devise est ambigu (EUR? USD? MAD?)",
          fix: {
            type: "ADD_METHOD",
            newValue: 'private String devise = "MAD";',
          },
        });
      }
      return hits;
    },
  },

  // FIN-003: Validation IBAN format
  {
    id: "FIN-003",
    category: "FINANCIAL",
    name: "Validation IBAN",
    severity: "HIGH",
    description: "Les champs IBAN doivent avoir une validation de format",
    evaluate(ctx) {
      const hits: RuleHit[] = [];
      const ibanFields = findFieldsByName(ctx, /iban/i);
      for (const f of ibanFields) {
        if (!hasAnnotation(f.annotations, /@Pattern|@IBAN/)) {
          hits.push({
            ruleId: this.id,
            category: this.category,
            severity: this.severity,
            className: ctx.className,
            fieldName: f.name,
            message: `Le champ IBAN "${f.name}" n'a pas de validation de format`,
            reason: "Un IBAN invalide peut provoquer un rejet de virement",
            fix: {
              type: "ADD_ANNOTATION",
              target: f.name,
              newValue: '@Pattern(regexp = "^[A-Z]{2}[0-9]{2}[A-Z0-9]{4,30}$")',
            },
          });
        }
      }
      return hits;
    },
  },

  // FIN-004: @Transactional sur les opérations financières
  {
    id: "FIN-004",
    category: "FINANCIAL",
    name: "Transaction obligatoire",
    severity: "CRITICAL",
    description: "Les méthodes de mutation financière doivent être @Transactional",
    evaluate(ctx) {
      const hits: RuleHit[] = [];
      for (const m of ctx.methods) {
        const isFinancial = /virer|debiter|crediter|transfer|payer|rembourser|annuler/i.test(m.name);
        if (isFinancial && !hasAnnotation(m.annotations, /@Transactional/)) {
          hits.push({
            ruleId: this.id,
            category: this.category,
            severity: this.severity,
            className: ctx.className,
            methodName: m.name,
            line: m.line,
            message: `La méthode financière "${m.name}" n'est pas @Transactional`,
            reason: "Une opération financière sans transaction peut laisser les données dans un état incohérent",
            fix: {
              type: "ADD_ANNOTATION",
              target: m.name,
              newValue: "@Transactional",
              additionalImports: ["org.springframework.transaction.annotation.Transactional"],
            },
          });
        }
      }
      return hits;
    },
  },

  // FIN-005: Montant positif
  {
    id: "FIN-005",
    category: "FINANCIAL",
    name: "Montant positif",
    severity: "HIGH",
    description: "Les montants doivent avoir une validation @DecimalMin(0)",
    evaluate(ctx) {
      const hits: RuleHit[] = [];
      const moneyFields = findFieldsByName(ctx, /montant|amount|prix|price|total/i);
      for (const f of moneyFields) {
        if (!hasAnnotation(f.annotations, /@DecimalMin|@Positive|@PositiveOrZero|@Min/)) {
          hits.push({
            ruleId: this.id,
            category: this.category,
            severity: this.severity,
            className: ctx.className,
            fieldName: f.name,
            message: `Le champ montant "${f.name}" n'a pas de validation de positivité`,
            reason: "Un montant négatif peut provoquer des erreurs comptables",
            fix: {
              type: "ADD_ANNOTATION",
              target: f.name,
              newValue: '@DecimalMin(value = "0.00")',
            },
          });
        }
      }
      return hits;
    },
  },

  // FIN-006: Précision décimale
  {
    id: "FIN-006",
    category: "FINANCIAL",
    name: "Précision décimale",
    severity: "MEDIUM",
    description: "Les montants BigDecimal doivent avoir @Digits pour la précision",
    evaluate(ctx) {
      const hits: RuleHit[] = [];
      const moneyFields = findFieldsByName(ctx, /montant|amount|solde|balance|prix|price/i);
      for (const f of moneyFields) {
        if (/BigDecimal/.test(f.type) && !hasAnnotation(f.annotations, /@Digits/)) {
          hits.push({
            ruleId: this.id,
            category: this.category,
            severity: this.severity,
            className: ctx.className,
            fieldName: f.name,
            message: `Le champ "${f.name}" (BigDecimal) n'a pas de contrainte @Digits`,
            reason: "Sans @Digits, la précision n'est pas contrôlée (risque d'arrondi)",
            fix: {
              type: "ADD_ANNOTATION",
              target: f.name,
              newValue: "@Digits(integer = 15, fraction = 2)",
            },
          });
        }
      }
      return hits;
    },
  },

  // FIN-007: Audit trail sur les opérations financières
  {
    id: "FIN-007",
    category: "FINANCIAL",
    name: "Audit trail",
    severity: "MEDIUM",
    description: "Les opérations financières doivent logger un audit trail",
    evaluate(ctx) {
      const hits: RuleHit[] = [];
      for (const m of ctx.methods) {
        const isFinancial = /virer|debiter|crediter|transfer|payer|annuler|valider/i.test(m.name);
        if (isFinancial && !/log|audit|trace|Logger/i.test(m.body)) {
          hits.push({
            ruleId: this.id,
            category: this.category,
            severity: this.severity,
            className: ctx.className,
            methodName: m.name,
            message: `La méthode financière "${m.name}" ne contient pas de trace d'audit`,
            reason: "Les opérations financières doivent être traçables pour la conformité",
            fix: {
              type: "ADD_COMMENT",
              newValue: "// TODO: Ajouter un audit trail pour la traçabilité réglementaire",
            },
          });
        }
      }
      return hits;
    },
  },

  // FIN-008: Idempotence des virements
  {
    id: "FIN-008",
    category: "FINANCIAL",
    name: "Idempotence virement",
    severity: "HIGH",
    description: "Les opérations de virement doivent être idempotentes (référence unique)",
    evaluate(ctx) {
      const hits: RuleHit[] = [];
      const hasVirement = ctx.methods.some((m) => /virer|transfer|initierVirement/i.test(m.name));
      const hasRef = findFieldsByName(ctx, /reference|idempotencyKey|requestId/i).length > 0;

      if (hasVirement && !hasRef) {
        hits.push({
          ruleId: this.id,
          category: this.category,
          severity: this.severity,
          className: ctx.className,
          message: "Opération de virement sans clé d'idempotence",
          reason: "Sans idempotence, un retry peut provoquer un double virement",
          fix: {
            type: "ADD_METHOD",
            newValue: "private String idempotencyKey; // Clé unique pour éviter les doublons",
          },
        });
      }
      return hits;
    },
  },

  // FIN-009: Plafond de transaction
  {
    id: "FIN-009",
    category: "FINANCIAL",
    name: "Plafond de transaction",
    severity: "MEDIUM",
    description: "Les méthodes de transaction doivent vérifier les plafonds",
    evaluate(ctx) {
      const hits: RuleHit[] = [];
      for (const m of ctx.methods) {
        const isTx = /virer|debiter|payer|retirer/i.test(m.name);
        if (isTx && !/plafond|limit|max|ceiling|threshold/i.test(m.body)) {
          hits.push({
            ruleId: this.id,
            category: this.category,
            severity: this.severity,
            className: ctx.className,
            methodName: m.name,
            message: `La méthode "${m.name}" ne vérifie pas les plafonds de transaction`,
            reason: "Les transactions sans vérification de plafond sont un risque de fraude",
            fix: {
              type: "ADD_COMMENT",
              newValue: "// TODO: Vérifier le plafond de transaction avant exécution",
            },
          });
        }
      }
      return hits;
    },
  },

  // FIN-010: Date de valeur
  {
    id: "FIN-010",
    category: "FINANCIAL",
    name: "Date de valeur",
    severity: "LOW",
    description: "Les opérations financières doivent inclure une date de valeur",
    evaluate(ctx) {
      const hits: RuleHit[] = [];
      const hasFinancialOp = ctx.methods.some((m) => /virer|debiter|crediter/i.test(m.name));
      const hasDateValeur = findFieldsByName(ctx, /dateValeur|valueDate|settlementDate/i).length > 0;

      if (hasFinancialOp && !hasDateValeur) {
        hits.push({
          ruleId: this.id,
          category: this.category,
          severity: this.severity,
          className: ctx.className,
          message: "Opération financière sans date de valeur",
          reason: "La date de valeur est nécessaire pour le calcul des intérêts",
          fix: {
            type: "ADD_METHOD",
            newValue: "private LocalDate dateValeur;",
            additionalImports: ["java.time.LocalDate"],
          },
        });
      }
      return hits;
    },
  },

  // FIN-011: Solde insuffisant check
  {
    id: "FIN-011",
    category: "FINANCIAL",
    name: "Vérification solde",
    severity: "HIGH",
    description: "Les débits doivent vérifier le solde disponible",
    evaluate(ctx) {
      const hits: RuleHit[] = [];
      for (const m of ctx.methods) {
        const isDebit = /debiter|retirer|payer|virer/i.test(m.name);
        if (isDebit && !/solde|balance|disponible|sufficient/i.test(m.body)) {
          hits.push({
            ruleId: this.id,
            category: this.category,
            severity: this.severity,
            className: ctx.className,
            methodName: m.name,
            message: `La méthode "${m.name}" ne vérifie pas le solde disponible`,
            reason: "Un débit sans vérification de solde peut provoquer un découvert non autorisé",
            fix: {
              type: "ADD_COMMENT",
              newValue: "// TODO: Vérifier le solde disponible avant débit",
            },
          });
        }
      }
      return hits;
    },
  },

  // FIN-012: Devise ISO 4217
  {
    id: "FIN-012",
    category: "FINANCIAL",
    name: "Devise ISO 4217",
    severity: "MEDIUM",
    description: "Les champs devise doivent respecter le format ISO 4217 (3 lettres)",
    evaluate(ctx) {
      const hits: RuleHit[] = [];
      const deviseFields = findFieldsByName(ctx, /devise|currency|currencyCode/i);
      for (const f of deviseFields) {
        if (/String/.test(f.type) && !hasAnnotation(f.annotations, /@Size|@Pattern|@Length/)) {
          hits.push({
            ruleId: this.id,
            category: this.category,
            severity: this.severity,
            className: ctx.className,
            fieldName: f.name,
            message: `Le champ devise "${f.name}" n'a pas de validation ISO 4217`,
            reason: "Un code devise invalide peut provoquer des erreurs de conversion",
            fix: {
              type: "ADD_ANNOTATION",
              target: f.name,
              newValue: "@Size(min = 3, max = 3)",
            },
          });
        }
      }
      return hits;
    },
  },

  // FIN-013: Taux d'intérêt borné
  {
    id: "FIN-013",
    category: "FINANCIAL",
    name: "Taux borné",
    severity: "MEDIUM",
    description: "Les taux d'intérêt doivent être bornés entre 0 et 100%",
    evaluate(ctx) {
      const hits: RuleHit[] = [];
      const tauxFields = findFieldsByName(ctx, /taux|rate|taeg|taea|pourcentage/i);
      for (const f of tauxFields) {
        if (!hasAnnotation(f.annotations, /@DecimalMax|@Max/)) {
          hits.push({
            ruleId: this.id,
            category: this.category,
            severity: this.severity,
            className: ctx.className,
            fieldName: f.name,
            message: `Le champ taux "${f.name}" n'a pas de borne supérieure`,
            reason: "Un taux non borné peut provoquer des calculs aberrants",
            fix: {
              type: "ADD_ANNOTATION",
              target: f.name,
              newValue: '@DecimalMax(value = "100.00")',
            },
          });
        }
      }
      return hits;
    },
  },

  // FIN-014: Numéro de carte masqué
  {
    id: "FIN-014",
    category: "FINANCIAL",
    name: "PAN masqué",
    severity: "CRITICAL",
    description: "Les numéros de carte (PAN) ne doivent jamais être exposés en clair dans les logs ou réponses",
    evaluate(ctx) {
      const hits: RuleHit[] = [];
      const panFields = findFieldsByName(ctx, /pan|numCarte|cardNumber|numeroCarte/i);
      for (const f of panFields) {
        if (!hasAnnotation(f.annotations, /@JsonIgnore|@Masked|@ToString.Exclude/)) {
          hits.push({
            ruleId: this.id,
            category: this.category,
            severity: this.severity,
            className: ctx.className,
            fieldName: f.name,
            message: `Le champ PAN "${f.name}" n'est pas masqué`,
            reason: "PCI-DSS exige le masquage des numéros de carte",
            fix: {
              type: "ADD_ANNOTATION",
              target: f.name,
              newValue: "@JsonIgnore // PCI-DSS: ne jamais exposer le PAN complet",
            },
          });
        }
      }
      return hits;
    },
  },

  // FIN-015: Scoring crédit validé
  {
    id: "FIN-015",
    category: "FINANCIAL",
    name: "Scoring crédit",
    severity: "HIGH",
    description: "Les méthodes de scoring crédit doivent valider les entrées",
    evaluate(ctx) {
      const hits: RuleHit[] = [];
      for (const m of ctx.methods) {
        if (/scoring|evaluer|calculerScore|noteCredit/i.test(m.name)) {
          const hasValidation = m.parameters.some((p) =>
            /montant|revenus|charges|duree/i.test(p.name)
          );
          if (hasValidation && !/validate|verifier|check/i.test(m.body)) {
            hits.push({
              ruleId: this.id,
              category: this.category,
              severity: this.severity,
              className: ctx.className,
              methodName: m.name,
              message: `La méthode de scoring "${m.name}" ne valide pas ses entrées`,
              reason: "Un scoring avec des données invalides produit des résultats erronés",
              fix: {
                type: "ADD_COMMENT",
                newValue: "// TODO: Valider les paramètres d'entrée avant le calcul du score",
              },
            });
          }
        }
      }
      return hits;
    },
  },
];
