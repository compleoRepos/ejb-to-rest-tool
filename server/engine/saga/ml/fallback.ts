/**
 * Saga ML Fallback — Compleo v7.10
 *
 * Fallback rule-based quand Ollama est absent ou que la réponse ML
 * échoue à la validation. Produit un enrichissement minimal mais
 * fonctionnel basé sur des patterns bancaires connus.
 *
 * @author Hamza NORDINE
 */

import type { StepContext, MLStepEnrichment } from "./prompts";

// ── Patterns bancaires connus ───────────────────────────────────────────────

interface CompensationPattern {
  /** Regex sur le label du step */
  stepPattern: RegExp;
  /** Template de compensation Java */
  compensationTemplate: string;
  /** Champs de contexte typiques */
  contextFields: Array<{ name: string; type: string }>;
}

const BANKING_COMPENSATION_PATTERNS: CompensationPattern[] = [
  {
    stepPattern: /débit|prélèvement|mouvement.*comptable|debit/i,
    compensationTemplate: `// Contre-passation : crédit du montant débité
        log.info("Compensation débit: annulation écriture {}", context.getReferenceEcriture());
        comptabiliteService.contrepasser(context.getReferenceEcriture(), context.getMontant());`,
    contextFields: [
      { name: "referenceEcriture", type: "String" },
      { name: "montant", type: "BigDecimal" },
    ],
  },
  {
    stepPattern: /enregistrement.*transaction|création.*transaction/i,
    compensationTemplate: `// Annulation de la transaction enregistrée
        log.info("Compensation transaction: annulation {}", context.getIdTransaction());
        transactionService.annuler(context.getIdTransaction());`,
    contextFields: [
      { name: "idTransaction", type: "Long" },
    ],
  },
  {
    stepPattern: /envoi.*canal|envoi.*swift|soumission/i,
    compensationTemplate: `// Demande d'annulation auprès du canal de routage
        log.info("Compensation envoi: demande annulation {}", context.getCodeRetourSWIFT());
        canalRoutageService.demanderAnnulation(context.getCodeRetourSWIFT());`,
    contextFields: [
      { name: "codeRetourSWIFT", type: "String" },
    ],
  },
  {
    stepPattern: /mise.*à.*jour.*statut|update.*status/i,
    compensationTemplate: `// Restauration du statut précédent
        log.info("Compensation statut: restauration statut précédent");
        statusService.restaurerStatutPrecedent(context.getSagaId());`,
    contextFields: [],
  },
  {
    stepPattern: /réservation|reservation|blocage.*fonds|provision/i,
    compensationTemplate: `// Libération des fonds réservés
        log.info("Compensation réservation: libération fonds {}", context.getMontant());
        compteService.libererFonds(context.getCompteDebiteur(), context.getMontant());`,
    contextFields: [
      { name: "compteDebiteur", type: "String" },
      { name: "montant", type: "BigDecimal" },
    ],
  },
  {
    stepPattern: /décaissement|deblocage|versement/i,
    compensationTemplate: `// Annulation du décaissement
        log.info("Compensation décaissement: annulation {}", context.getReferenceDecaissement());
        decaissementService.annuler(context.getReferenceDecaissement());`,
    contextFields: [
      { name: "referenceDecaissement", type: "String" },
      { name: "montantDecaisse", type: "BigDecimal" },
    ],
  },
  {
    stepPattern: /garantie|collateral|hypotheque/i,
    compensationTemplate: `// Libération de la garantie
        log.info("Compensation garantie: libération {}", context.getReferenceGarantie());
        garantieService.liberer(context.getReferenceGarantie());`,
    contextFields: [
      { name: "referenceGarantie", type: "String" },
    ],
  },
  {
    stepPattern: /ouverture.*compte|création.*compte/i,
    compensationTemplate: `// Clôture du compte ouvert
        log.info("Compensation ouverture compte: clôture {}", context.getNumeroCompte());
        compteService.cloturer(context.getNumeroCompte(), "ANNULATION_SAGA");`,
    contextFields: [
      { name: "numeroCompte", type: "String" },
    ],
  },
  {
    stepPattern: /echeancier|amortissement|plan.*remboursement/i,
    compensationTemplate: `// Suppression de l'échéancier généré
        log.info("Compensation échéancier: suppression");
        echeancierService.supprimer(context.getIdTransaction());`,
    contextFields: [],
  },
  {
    stepPattern: /conversion.*devise|change/i,
    compensationTemplate: `// Contre-passation de la conversion de devise
        log.info("Compensation conversion: contre-passation au taux {}", context.getTauxChange());
        deviseService.contrepasserConversion(context.getSagaId(), context.getTauxChange());`,
    contextFields: [
      { name: "tauxChange", type: "BigDecimal" },
      { name: "montantMAD", type: "BigDecimal" },
    ],
  },
];

// ── API publique ────────────────────────────────────────────────────────────

/**
 * Génère un enrichissement fallback rule-based pour un step Saga.
 * Utilisé quand Ollama est absent ou que la réponse ML est invalide.
 */
export function generateFallbackEnrichment(ctx: StepContext): MLStepEnrichment {
  const stepBody = generateFallbackStepBody(ctx);
  const compensationBody = ctx.isCompensable
    ? generateFallbackCompensation(ctx)
    : "// Step non compensable — aucune action de compensation";
  const contextFields = inferContextFields(ctx);
  const retryRecommendation = inferRetryPolicy(ctx);
  const preconditions = inferPreconditions(ctx);
  const postconditions = inferPostconditions(ctx);

  return {
    stepBody,
    compensationBody,
    contextFields,
    retryRecommendation,
    preconditions,
    postconditions,
  };
}

// ── Générateurs fallback ────────────────────────────────────────────────────

function generateFallbackStepBody(ctx: StepContext): string {
  const service = ctx.targetService || "localService";
  const method = ctx.targetMethod;

  switch (ctx.stepType) {
    case "validation":
      return `// Validation : ${ctx.stepLabel}
        log.info("Step ${ctx.stepNumber}: ${ctx.stepLabel}");
        ${service}.${method}(context);
        context.getCompletedSteps().add("${ctx.stepLabel}");`;

    case "query":
      return `// Lecture : ${ctx.stepLabel}
        log.info("Step ${ctx.stepNumber}: ${ctx.stepLabel}");
        var result = ${service}.${method}(context);
        // TODO: stocker le résultat dans le contexte
        context.getCompletedSteps().add("${ctx.stepLabel}");`;

    case "command":
      return `// Commande : ${ctx.stepLabel}
        log.info("Step ${ctx.stepNumber}: ${ctx.stepLabel}");
        ${service}.${method}(context);
        context.getCompletedSteps().add("${ctx.stepLabel}");`;

    case "async":
      return `// Async : ${ctx.stepLabel}
        log.info("Step ${ctx.stepNumber}: ${ctx.stepLabel} (fire-and-forget)");
        CompletableFuture.runAsync(() -> ${service}.${method}(context));`;

    default:
      return `// ${ctx.stepLabel}
        log.info("Step ${ctx.stepNumber}: ${ctx.stepLabel}");
        ${service}.${method}(context);
        context.getCompletedSteps().add("${ctx.stepLabel}");`;
  }
}

function generateFallbackCompensation(ctx: StepContext): string {
  // Chercher un pattern bancaire connu
  for (const pattern of BANKING_COMPENSATION_PATTERNS) {
    if (pattern.stepPattern.test(ctx.stepLabel)) {
      return pattern.compensationTemplate;
    }
  }

  // Fallback générique
  const service = ctx.targetService || "localService";
  return `// Compensation générique : ${ctx.stepLabel}
        log.info("Compensation step ${ctx.stepNumber}: annulation ${ctx.stepLabel}");
        ${service}.annuler${capitalize(ctx.targetMethod)}(context);`;
}

function inferContextFields(ctx: StepContext): Array<{ name: string; type: string }> {
  // Chercher des champs connus dans les patterns bancaires
  for (const pattern of BANKING_COMPENSATION_PATTERNS) {
    if (pattern.stepPattern.test(ctx.stepLabel) && pattern.contextFields.length > 0) {
      return pattern.contextFields;
    }
  }

  // Inférer depuis les SQL statements
  if (ctx.sqlStatements.length > 0) {
    const fields: Array<{ name: string; type: string }> = [];
    for (const sql of ctx.sqlStatements) {
      if (/INSERT/i.test(sql)) {
        fields.push({ name: "insertedId", type: "Long" });
      }
      if (/SELECT.*montant/i.test(sql)) {
        fields.push({ name: "montant", type: "BigDecimal" });
      }
    }
    if (fields.length > 0) return fields;
  }

  return [];
}

function inferRetryPolicy(ctx: StepContext): string {
  if (ctx.stepType === "async") return "RetryPolicy.forAsync()";
  if (!ctx.targetService) return "RetryPolicy.forLocalDb()";
  if (/SWIFT|TARGET2|SEPA|pain|gateway/i.test(ctx.stepLabel)) {
    return "RetryPolicy.forExternalGateway()";
  }
  return "RetryPolicy.forRemoteService()";
}

function inferPreconditions(ctx: StepContext): string[] {
  const conditions: string[] = [];

  if (ctx.stepType === "command" || ctx.stepType === "async") {
    conditions.push("context.getSagaId() != null");
  }

  if (/débit|prélèvement|versement|décaissement/i.test(ctx.stepLabel)) {
    conditions.push("context.getMontant() != null && context.getMontant().compareTo(BigDecimal.ZERO) > 0");
  }

  if (/envoi|soumission|canal/i.test(ctx.stepLabel)) {
    conditions.push("Les steps précédents de validation sont complétés");
  }

  if (conditions.length === 0) {
    conditions.push("context != null");
  }

  return conditions;
}

function inferPostconditions(ctx: StepContext): string[] {
  const conditions: string[] = [];

  conditions.push(`Step "${ctx.stepLabel}" ajouté à completedSteps`);

  if (ctx.stepType === "command") {
    conditions.push("Transaction persistée en base");
  }

  if (ctx.stepType === "validation") {
    conditions.push("Validation passée sans exception");
  }

  return conditions;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
