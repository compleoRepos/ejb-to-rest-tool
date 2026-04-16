/**
 * Saga ML Fallback — Compleo v8.0
 *
 * Fallback rule-based quand Ollama est absent ou que la réponse ML
 * échoue à la validation. Produit un enrichissement minimal mais
 * fonctionnel basé sur des patterns bancaires connus.
 *
 * v8.0 fixes:
 *   - BUG-3: All references use "ctx" (not "context")
 *   - BUG-3: No hyphens in method names (camelCase only)
 *   - BUG-3: No "localService" fallback (use jdbcTemplate or real service)
 *   - BUG-4: All services referenced are from the injected set or jdbcTemplate
 *
 * @author Hamza NORDINE
 */

import type { StepContext, MLStepEnrichment } from "./prompts";

// ── Patterns bancaires connus ───────────────────────────────────────────────

interface CompensationPattern {
  /** Regex sur le label du step */
  stepPattern: RegExp;
  /** Template de compensation Java — MUST use ctx, not context */
  compensationTemplate: string;
  /** Champs de contexte typiques */
  contextFields: Array<{ name: string; type: string }>;
  /** Service requis pour cette compensation */
  requiredService: string;
}

const BANKING_COMPENSATION_PATTERNS: CompensationPattern[] = [
  {
    stepPattern: /débit|prélèvement|mouvement.*comptable|debit/i,
    compensationTemplate: `// Contre-passation : credit du montant debite
        log.info("Compensation debit: annulation ecriture {}", ctx.getReferenceEcriture());
        jdbcTemplate.update("UPDATE T_ECRITURES SET STATUT = 'ANNULE' WHERE REFERENCE = ?", ctx.getReferenceEcriture());`,
    contextFields: [
      { name: "referenceEcriture", type: "String" },
      { name: "montant", type: "BigDecimal" },
    ],
    requiredService: "jdbcTemplate",
  },
  {
    stepPattern: /enregistrement.*transaction|création.*transaction|creation.*transaction/i,
    compensationTemplate: `// Annulation de la transaction enregistree
        log.info("Compensation transaction: annulation {}", ctx.getIdTransaction());
        jdbcTemplate.update("UPDATE T_TRANSACTIONS SET STATUT = 'ANNULE' WHERE ID_TRANSACTION = ?", ctx.getIdTransaction());`,
    contextFields: [
      { name: "idTransaction", type: "Long" },
    ],
    requiredService: "jdbcTemplate",
  },
  {
    stepPattern: /envoi.*canal|envoi.*swift|soumission/i,
    compensationTemplate: `// Demande d'annulation aupres du canal de routage
        log.info("Compensation envoi: demande annulation {}", ctx.getCodeRetourSWIFT());
        jdbcTemplate.update("UPDATE T_MESSAGES_SWIFT SET STATUT = 'ANNULE' WHERE CODE_RETOUR = ?", ctx.getCodeRetourSWIFT());`,
    contextFields: [
      { name: "codeRetourSWIFT", type: "String" },
    ],
    requiredService: "jdbcTemplate",
  },
  {
    stepPattern: /mise.*à.*jour.*statut|update.*status|mise.*a.*jour.*statut/i,
    compensationTemplate: `// Restauration du statut precedent
        log.info("Compensation statut: restauration statut precedent");
        jdbcTemplate.update("UPDATE T_SAGA_LOG SET STATUT = 'ROLLBACK' WHERE SAGA_ID = ?", ctx.getSagaId());`,
    contextFields: [],
    requiredService: "jdbcTemplate",
  },
  {
    stepPattern: /réservation|reservation|blocage.*fonds|provision/i,
    compensationTemplate: `// Liberation des fonds reserves
        log.info("Compensation reservation: liberation fonds {}", ctx.getMontant());
        jdbcTemplate.update("UPDATE T_COMPTES SET SOLDE = SOLDE + ? WHERE NUM_COMPTE = ?", ctx.getMontant(), ctx.getCompteDebiteur());`,
    contextFields: [
      { name: "compteDebiteur", type: "String" },
      { name: "montant", type: "BigDecimal" },
    ],
    requiredService: "jdbcTemplate",
  },
  {
    stepPattern: /décaissement|deblocage|versement|déblocage/i,
    compensationTemplate: `// Annulation du decaissement
        log.info("Compensation decaissement: annulation {}", ctx.getSagaId());
        jdbcTemplate.update("UPDATE T_COMPTES SET SOLDE = SOLDE - ? WHERE NUM_COMPTE = ?", ctx.getMontant(), ctx.getCompteDebiteur());`,
    contextFields: [
      { name: "referenceDecaissement", type: "String" },
      { name: "montantDecaisse", type: "BigDecimal" },
    ],
    requiredService: "jdbcTemplate",
  },
  {
    stepPattern: /garantie|collateral|hypotheque|hypothèque/i,
    compensationTemplate: `// Liberation de la garantie
        log.info("Compensation garantie: liberation {}", ctx.getReferenceGarantie());
        jdbcTemplate.update("UPDATE T_GARANTIES SET STATUT = 'LIBRE' WHERE REFERENCE = ?", ctx.getReferenceGarantie());`,
    contextFields: [
      { name: "referenceGarantie", type: "String" },
    ],
    requiredService: "jdbcTemplate",
  },
  {
    stepPattern: /ouverture.*compte|création.*compte|creation.*compte/i,
    compensationTemplate: `// Cloture du compte ouvert
        log.info("Compensation ouverture compte: cloture {}", ctx.getNumeroCompte());
        jdbcTemplate.update("UPDATE T_COMPTES SET STATUT = 'FERME' WHERE NUM_COMPTE = ?", ctx.getNumeroCompte());`,
    contextFields: [
      { name: "numeroCompte", type: "String" },
    ],
    requiredService: "jdbcTemplate",
  },
  {
    stepPattern: /echeancier|échéancier|amortissement|plan.*remboursement/i,
    compensationTemplate: `// Suppression de l'echeancier genere
        log.info("Compensation echeancier: suppression");
        jdbcTemplate.update("DELETE FROM T_ECHEANCIERS WHERE SAGA_ID = ?", ctx.getSagaId());`,
    contextFields: [],
    requiredService: "jdbcTemplate",
  },
  {
    stepPattern: /conversion.*devise|change/i,
    compensationTemplate: `// Contre-passation de la conversion de devise
        log.info("Compensation conversion: contre-passation au taux {}", ctx.getTauxChange());
        jdbcTemplate.update("UPDATE T_CONVERSIONS SET STATUT = 'ANNULE' WHERE SAGA_ID = ?", ctx.getSagaId());`,
    contextFields: [
      { name: "tauxChange", type: "BigDecimal" },
      { name: "montantMAD", type: "BigDecimal" },
    ],
    requiredService: "jdbcTemplate",
  },
  {
    stepPattern: /scoring|score/i,
    compensationTemplate: `// Invalidation du score calcule
        log.info("Compensation scoring: invalidation");
        jdbcTemplate.update("UPDATE T_SCORES_CREDIT SET STATUT = 'INVALIDE' WHERE SAGA_ID = ?", ctx.getSagaId());`,
    contextFields: [],
    requiredService: "jdbcTemplate",
  },
  {
    stepPattern: /vérification|verification|contrôle|controle|eligibilit|éligibilit/i,
    compensationTemplate: `// Annulation de la verification
        log.info("Compensation verification: rollback");
        jdbcTemplate.update("UPDATE T_SAGA_LOG SET STATUT = 'ROLLBACK' WHERE SAGA_ID = ? AND STEP_NAME = ?", ctx.getSagaId(), "${/* placeholder */""}"
        );`,
    contextFields: [],
    requiredService: "jdbcTemplate",
  },
  {
    stepPattern: /création.*dossier|creation.*dossier|dossier.*crédit|dossier.*credit/i,
    compensationTemplate: `// Annulation du dossier cree
        log.info("Compensation dossier: annulation");
        jdbcTemplate.update("UPDATE T_DOSSIERS_CREDIT SET STATUT = 'ANNULE' WHERE SAGA_ID = ?", ctx.getSagaId());`,
    contextFields: [
      { name: "insertedId", type: "Long" },
    ],
    requiredService: "jdbcTemplate",
  },
  {
    stepPattern: /décision|decision/i,
    compensationTemplate: `// Annulation de la decision
        log.info("Compensation decision: rollback");
        jdbcTemplate.update("UPDATE T_DECISIONS SET STATUT = 'ANNULE' WHERE SAGA_ID = ?", ctx.getSagaId());`,
    contextFields: [],
    requiredService: "jdbcTemplate",
  },
  {
    stepPattern: /calcul.*condition|conditions.*financ/i,
    compensationTemplate: `// Annulation des conditions financieres calculees
        log.info("Compensation conditions financieres: rollback");
        jdbcTemplate.update("UPDATE T_CONDITIONS_FINANCIERES SET STATUT = 'ANNULE' WHERE SAGA_ID = ?", ctx.getSagaId());`,
    contextFields: [],
    requiredService: "jdbcTemplate",
  },
  {
    stepPattern: /limite.*engagement|engagement/i,
    compensationTemplate: `// Restauration des limites d'engagement
        log.info("Compensation limites engagement: rollback");
        jdbcTemplate.update("UPDATE T_SAGA_LOG SET STATUT = 'ROLLBACK' WHERE SAGA_ID = ? AND STEP_NAME = ?", ctx.getSagaId(), "limites-engagement");`,
    contextFields: [],
    requiredService: "jdbcTemplate",
  },
  {
    stepPattern: /évaluation|evaluation/i,
    compensationTemplate: `// Annulation de l'evaluation
        log.info("Compensation evaluation: rollback");
        jdbcTemplate.update("UPDATE T_SAGA_LOG SET STATUT = 'ROLLBACK' WHERE SAGA_ID = ? AND STEP_NAME = ?", ctx.getSagaId(), "evaluation");`,
    contextFields: [],
    requiredService: "jdbcTemplate",
  },
  {
    stepPattern: /validation|pièces|pieces|justificati/i,
    compensationTemplate: `// Annulation de la validation
        log.info("Compensation validation: rollback");
        jdbcTemplate.update("UPDATE T_SAGA_LOG SET STATUT = 'ROLLBACK' WHERE SAGA_ID = ? AND STEP_NAME = ?", ctx.getSagaId(), "validation");`,
    contextFields: [],
    requiredService: "jdbcTemplate",
  },
  {
    stepPattern: /notification|envoi.*notif/i,
    compensationTemplate: `// Notification non compensable (fire-and-forget)
        log.info("Compensation notification: no-op (fire-and-forget)");`,
    contextFields: [],
    requiredService: "jdbcTemplate",
  },
  {
    stepPattern: /enregistrement.*virement|insert.*virement/i,
    compensationTemplate: `// Annulation du virement enregistre
        log.info("Compensation virement: annulation");
        jdbcTemplate.update("UPDATE T_VIREMENTS_INTERNATIONAUX SET STATUT = 'ANNULE' WHERE SAGA_ID = ?", ctx.getSagaId());`,
    contextFields: [],
    requiredService: "jdbcTemplate",
  },
  {
    stepPattern: /création.*client|creation.*client|onboarding/i,
    compensationTemplate: `// Archivage du client cree
        log.info("Compensation client: archivage");
        jdbcTemplate.update("UPDATE T_CLIENTS SET STATUT = 'ARCHIVE' WHERE SAGA_ID = ?", ctx.getSagaId());`,
    contextFields: [],
    requiredService: "jdbcTemplate",
  },
];

// ── API publique ────────────────────────────────────────────────────────────

/**
 * Génère un enrichissement fallback rule-based pour un step Saga.
 * Utilisé quand Ollama est absent ou que la réponse ML est invalide.
 *
 * v8.0: All generated code uses "ctx" (not "context"), camelCase method names,
 * and only references jdbcTemplate or actually-injected services.
 */
export function generateFallbackEnrichment(ctx: StepContext): MLStepEnrichment {
  const stepBody = generateFallbackStepBody(ctx);
  const compensationBody = ctx.isCompensable
    ? generateFallbackCompensation(ctx)
    : "// Step non compensable - aucune action de compensation";
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

/**
 * Converts a step label to a valid Java camelCase method name.
 * Transliterates accents and removes hyphens.
 * "vérification-éligibilité-kyc" → "verificationEligibiliteKyc"
 */
function toSafeMethodName(label: string): string {
  return label
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")  // accents → ASCII
    .replace(/\u0153/g, "oe").replace(/\u00e6/g, "ae")
    .replace(/\u00c7/g, "C").replace(/\u00e7/g, "c")
    .replace(/[^a-zA-Z0-9\s]/g, " ")                     // non-alphanum → space
    .split(/\s+/)
    .filter(w => w.length > 0)
    .map((w, i) => i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("");
}

/**
 * Resolves the service to use for a step.
 * BUG-3/BUG-4 fix: Never returns "localService". Falls back to jdbcTemplate.
 */
function resolveService(ctx: StepContext): string {
  if (ctx.targetService) {
    const svc = ctx.targetService
      .replace(/EJB(?:Local|Remote)?$/i, "")
      .replace(/Bean$/i, "")
      .replace(/Impl$/i, "");
    const fieldName = svc.charAt(0).toLowerCase() + svc.slice(1);
    const serviceName = fieldName.endsWith("Service") ? fieldName : fieldName + "Service";
    // Validate it's a real Java identifier (not a keyword)
    if (/^[a-z][a-zA-Z0-9]*$/.test(serviceName) && serviceName.length >= 3) {
      return serviceName;
    }
  }
  // BUG-3 fix: Never use "localService" — fall back to jdbcTemplate
  return "jdbcTemplate";
}

function generateFallbackStepBody(ctx: StepContext): string {
  const service = resolveService(ctx);
  const method = toSafeMethodName(ctx.targetMethod);

  // If service is jdbcTemplate, generate SQL-style calls
  if (service === "jdbcTemplate") {
    switch (ctx.stepType) {
      case "validation":
        return `// Validation : ${ctx.stepLabel}
        log.info("Step ${ctx.stepNumber}: ${ctx.stepLabel}");
        // TODO: implement validation logic
        ctx.getCompletedSteps().add("${toSafeMethodName(ctx.stepLabel)}");`;

      case "query":
        return `// Query : ${ctx.stepLabel}
        log.info("Step ${ctx.stepNumber}: ${ctx.stepLabel}");
        // TODO: implement query logic
        ctx.getCompletedSteps().add("${toSafeMethodName(ctx.stepLabel)}");`;

      case "command":
        return `// Command : ${ctx.stepLabel}
        log.info("Step ${ctx.stepNumber}: ${ctx.stepLabel}");
        // TODO: implement command logic
        ctx.getCompletedSteps().add("${toSafeMethodName(ctx.stepLabel)}");`;

      case "async":
        return `// Async : ${ctx.stepLabel}
        log.info("Step ${ctx.stepNumber}: ${ctx.stepLabel} (fire-and-forget)");
        // TODO: implement async logic`;

      default:
        return `// ${ctx.stepLabel}
        log.info("Step ${ctx.stepNumber}: ${ctx.stepLabel}");
        // TODO: implement step logic
        ctx.getCompletedSteps().add("${toSafeMethodName(ctx.stepLabel)}");`;
    }
  }

  // Service-based calls
  switch (ctx.stepType) {
    case "validation":
      return `// Validation : ${ctx.stepLabel}
        log.info("Step ${ctx.stepNumber}: ${ctx.stepLabel}");
        ${service}.${method}(ctx);
        ctx.getCompletedSteps().add("${toSafeMethodName(ctx.stepLabel)}");`;

    case "query":
      return `// Query : ${ctx.stepLabel}
        log.info("Step ${ctx.stepNumber}: ${ctx.stepLabel}");
        var result = ${service}.${method}(ctx);
        // TODO: store result in context
        ctx.getCompletedSteps().add("${toSafeMethodName(ctx.stepLabel)}");`;

    case "command":
      return `// Command : ${ctx.stepLabel}
        log.info("Step ${ctx.stepNumber}: ${ctx.stepLabel}");
        ${service}.${method}(ctx);
        ctx.getCompletedSteps().add("${toSafeMethodName(ctx.stepLabel)}");`;

    case "async":
      return `// Async : ${ctx.stepLabel}
        log.info("Step ${ctx.stepNumber}: ${ctx.stepLabel} (fire-and-forget)");
        CompletableFuture.runAsync(() -> ${service}.${method}(ctx));`;

    default:
      return `// ${ctx.stepLabel}
        log.info("Step ${ctx.stepNumber}: ${ctx.stepLabel}");
        ${service}.${method}(ctx);
        ctx.getCompletedSteps().add("${toSafeMethodName(ctx.stepLabel)}");`;
  }
}

function generateFallbackCompensation(ctx: StepContext): string {
  // Chercher un pattern bancaire connu
  for (const pattern of BANKING_COMPENSATION_PATTERNS) {
    if (pattern.stepPattern.test(ctx.stepLabel)) {
      return pattern.compensationTemplate;
    }
  }

  // BUG-3 fix: Fallback générique uses jdbcTemplate (not localService)
  // and camelCase method name (not kebab-case)
  return `// Compensation generique : ${ctx.stepLabel}
        log.info("Compensation step ${ctx.stepNumber}: annulation");
        jdbcTemplate.update("UPDATE T_SAGA_LOG SET STATUT = 'ROLLBACK' WHERE SAGA_ID = ? AND STEP_NAME = ?", ctx.getSagaId(), "${toSafeMethodName(ctx.stepLabel)}");`;
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
    conditions.push("ctx.getSagaId() != null");
  }

  if (/débit|prélèvement|versement|décaissement/i.test(ctx.stepLabel)) {
    conditions.push("ctx.getMontant() != null && ctx.getMontant().compareTo(BigDecimal.ZERO) > 0");
  }

  if (/envoi|soumission|canal/i.test(ctx.stepLabel)) {
    conditions.push("Previous validation steps are completed");
  }

  if (conditions.length === 0) {
    conditions.push("ctx != null");
  }

  return conditions;
}

function inferPostconditions(ctx: StepContext): string[] {
  const conditions: string[] = [];

  conditions.push(`Step "${ctx.stepLabel}" added to completedSteps`);

  if (ctx.stepType === "command") {
    conditions.push("Transaction persisted in database");
  }

  if (ctx.stepType === "validation") {
    conditions.push("Validation passed without exception");
  }

  return conditions;
}
