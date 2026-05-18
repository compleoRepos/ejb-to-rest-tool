/**
 * Saga Step Extractor — Compleo v7.9
 *
 * Extrait les steps d'une Saga depuis le code source d'un EJB orchestrateur.
 * Deux stratégies :
 *   1. Parser les commentaires "// ÉTAPE N —" dans le code migré
 *   2. Inférer depuis l'ordre des appels aux dépendances injectées
 *
 * @author Compleo
 */

import type { EjbDependency, SagaCandidate } from "./saga-detector";
import { inferCompensation, type CompensationAction } from "./saga-compensation";

// ── Types ────────────────────────────────────────────────────────────────────

export type StepType = "validation" | "query" | "command" | "async";

export interface SagaStep {
  /** Ordre du step (1, 2, 3...) */
  order: number;
  /** Nom kebab-case (ex: validation-iban) */
  name: string;
  /** Label humain (ex: Validation IBAN) */
  label: string;
  /** Type du step */
  type: StepType;
  /** Microservice cible (null si local) */
  targetService: string | null;
  /** Méthode cible */
  targetMethod: string;
  /** Le step est-il compensable ? */
  isCompensable: boolean;
  /** Action de compensation (null si non compensable) */
  compensation: CompensationAction | null;
  /** Le step est-il asynchrone (fire-and-forget) ? */
  isAsync: boolean;
  /** Le step est-il critique (échec → rollback total) ? */
  isCritical: boolean;
  /** Commentaire source original */
  sourceComment: string;
}

export interface IntermediateResult {
  /** Nom du step qui produit ce résultat */
  stepName: string;
  /** Type Java du résultat */
  type: string;
  /** Nom du champ dans le SagaContext */
  fieldName: string;
}

// ── API publique ─────────────────────────────────────────────────────────────

/**
 * Extrait les steps d'une Saga depuis le code source et les dépendances.
 */
export function extractSagaSteps(
  sourceCode: string,
  methodName: string,
  ejbDeps: EjbDependency[],
): SagaStep[] {
  let steps: SagaStep[] = [];

  // STRATÉGIE 1 : Parser les commentaires "// ÉTAPE N —" dans le code migré
  steps = extractStepsFromComments(sourceCode, ejbDeps);

  // STRATÉGIE 2 : Si pas de commentaires numérotés, inférer depuis
  //               l'ordre des appels aux dépendances injectées
  if (steps.length === 0) {
    steps = inferStepsFromCallOrder(sourceCode, ejbDeps);
  }

  return steps;
}

/**
 * Extrait les résultats intermédiaires d'une Saga.
 * Ces résultats sont stockés dans le SagaContext et partagés entre steps.
 */
export function extractIntermediateResults(
  sourceCode: string,
  steps: SagaStep[],
): IntermediateResult[] {
  const results: IntermediateResult[] = [];
  const seen = new Set<string>();

  // Chercher les variables assignées entre les appels de service
  for (const step of steps) {
    // Chercher les patterns d'assignation autour du step
    const patterns = [
      // Type variable = service.method(...)
      new RegExp(
        `(\\w+(?:<[^>]+>)?)\\s+(\\w+)\\s*=\\s*\\w+\\.${escapeRegex(step.targetMethod)}\\s*\\(`,
        "g",
      ),
      // variable = service.method(...)
      new RegExp(
        `(\\w+)\\s*=\\s*\\w+\\.${escapeRegex(step.targetMethod)}\\s*\\(`,
        "g",
      ),
    ];

    for (const pattern of patterns) {
      const matches = sourceCode.matchAll(pattern);
      for (const m of matches) {
        const type = m[1] || "Object";
        const fieldName = m[2] || m[1];
        if (fieldName && !seen.has(fieldName) && !isJavaKeyword(fieldName)) {
          seen.add(fieldName);
          results.push({
            stepName: step.name,
            type: mapJavaType(type),
            fieldName,
          });
        }
      }
    }
  }

  // Enrichir avec des résultats connus par convention bancaire
  enrichBankingResults(results, steps, seen);

  return results;
}

// ── Stratégie 1 : Commentaires numérotés ─────────────────────────────────────

function extractStepsFromComments(
  source: string,
  deps: EjbDependency[],
): SagaStep[] {
  const steps: SagaStep[] = [];
  const stepRegex = /\/\/\s*[ÉE]TAPE\s+(\d+)\s*[—\-–]\s*(.+)/g;

  let match: RegExpExecArray | null;
  while ((match = stepRegex.exec(source)) !== null) {
    const order = parseInt(match[1], 10);
    const label = match[2].trim();
    steps.push(buildStepFromComment(order, label, source, deps));
  }

  return steps;
}

function buildStepFromComment(
  order: number,
  label: string,
  source: string,
  deps: EjbDependency[],
): SagaStep {
  const name = toKebabCase(label);
  const type = classifyStep(label, source, order);
  const targetDep = findTargetService(label, deps);
  const isCompensable = type === "command";
  const compensation = isCompensable
    ? inferCompensation(label, source)
    : null;

  return {
    order,
    name,
    label,
    type,
    targetService: targetDep?.serviceName ?? null,
    targetMethod: targetDep?.methodName ?? name,
    isCompensable,
    compensation,
    isAsync: /async|notif|broadcast|déclarer|déclar/i.test(label),
    isCritical: /sanction|bloqu|limit|contrôle/i.test(label),
    sourceComment: `ÉTAPE ${order} — ${label}`,
  };
}

// ── Stratégie 2 : Inférence depuis l'ordre des appels ────────────────────────

function inferStepsFromCallOrder(
  source: string,
  deps: EjbDependency[],
): SagaStep[] {
  const steps: SagaStep[] = [];
  let order = 0;

  // Trouver chaque appel de dépendance dans l'ordre d'apparition
  const callPattern = new RegExp(
    `(${deps.map((d) => escapeRegex(d.name)).join("|")})\\.([a-zA-Z]\\w*)\\s*\\(`,
    "g",
  );

  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = callPattern.exec(source)) !== null) {
    const depName = match[1];
    const methodName = match[2];
    const key = `${depName}.${methodName}`;
    if (seen.has(key)) continue;
    seen.add(key);

    order++;
    const dep = deps.find((d) => d.name === depName);
    const label = `${methodName} (${dep?.type || depName})`;
    const type = classifyStepFromMethod(methodName, source);
    const isCompensable = type === "command";

    steps.push({
      order,
      name: toKebabCase(methodName),
      label,
      type,
      targetService: dep?.serviceName ?? null,
      targetMethod: methodName,
      isCompensable,
      compensation: isCompensable
        ? inferCompensation(label, source)
        : null,
      isAsync: /async|notif|broadcast/i.test(methodName),
      isCritical: /sanction|bloqu|limit|control/i.test(methodName),
      sourceComment: `Inféré depuis ${key}`,
    });
  }

  return steps;
}

// ── Classification ───────────────────────────────────────────────────────────

function classifyStep(
  label: string,
  _source: string,
  _order: number,
): StepType {
  // Validation = vérification sans écriture
  if (/valid|vérif|contrôle|sanction|limite/i.test(label)) return "validation";

  // Query = lecture seule
  if (/charger|récupér|consulter|get|conversion|taux|chargement|collecte|calcul|génération|transformation|signature|canal|routage|score.*global|décision|règles/i.test(label))
    return "query";

  // Async = fire-and-forget
  if (/async|notif|broadcast|déclar/i.test(label)) return "async";

  // Command = écriture (débit, enregistrement, écriture comptable, envoi, mise à jour)
  return "command";
}

function classifyStepFromMethod(
  methodName: string,
  _source: string,
): StepType {
  if (/valid|verif|check|control/i.test(methodName)) return "validation";
  if (/get|find|load|fetch|consult|convert|calcul/i.test(methodName))
    return "query";
  if (/notify|broadcast|send.*notif|async/i.test(methodName)) return "async";
  return "command";
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function findTargetService(
  label: string,
  deps: EjbDependency[],
): { serviceName: string; methodName: string } | null {
  // Chercher une dépendance dont le type ou le nom correspond au label
  for (const dep of deps) {
    const typeLower = dep.type.toLowerCase();
    const labelLower = label.toLowerCase();

    // Match par mots-clés dans le label
    const typeWords = typeLower
      .replace(/ejb|local|remote|bean|service/gi, "")
      .split(/(?=[A-Z])/)
      .map((w) => w.toLowerCase())
      .filter((w) => w.length > 2);

    for (const word of typeWords) {
      if (labelLower.includes(word)) {
        return {
          serviceName: dep.serviceName || dep.name,
          methodName: dep.name,
        };
      }
    }
  }
  return null;
}

function toKebabCase(s: string): string {
  return s
    .replace(/[^a-zA-ZÀ-ÿ0-9]+/g, "-")
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/^-|-$/g, "")
    .replace(/-{2,}/g, "-");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mapJavaType(type: string): string {
  // Simplifier les types génériques
  if (type.includes("<")) return type;
  // Mapper les types primitifs
  const map: Record<string, string> = {
    int: "Integer",
    long: "Long",
    double: "Double",
    float: "Float",
    boolean: "Boolean",
    String: "String",
    string: "String",
  };
  return map[type] || type;
}

function isJavaKeyword(s: string): boolean {
  const keywords = new Set([
    "if", "else", "for", "while", "do", "switch", "case", "break",
    "continue", "return", "try", "catch", "finally", "throw", "throws",
    "new", "this", "super", "class", "interface", "extends", "implements",
    "import", "package", "public", "private", "protected", "static",
    "final", "abstract", "void", "null", "true", "false",
  ]);
  return keywords.has(s);
}

function enrichBankingResults(
  results: IntermediateResult[],
  steps: SagaStep[],
  seen: Set<string>,
): void {
  // Patterns bancaires connus
  const bankingPatterns: Array<{
    stepPattern: RegExp;
    fields: IntermediateResult[];
  }> = [
    {
      stepPattern: /conversion.*devise|devise.*conversion/i,
      fields: [
        { stepName: "conversion-devise", type: "BigDecimal", fieldName: "tauxChange" },
        { stepName: "conversion-devise", type: "BigDecimal", fieldName: "montantMAD" },
      ],
    },
    {
      stepPattern: /generation.*identif|identif.*generation/i,
      fields: [
        { stepName: "generation-identifiants", type: "String", fieldName: "endToEndId" },
        { stepName: "generation-identifiants", type: "String", fieldName: "uetr" },
      ],
    },
    {
      stepPattern: /transformation.*pain|pain.*001/i,
      fields: [
        { stepName: "transformation-pain001", type: "String", fieldName: "pain001Xml" },
      ],
    },
    {
      stepPattern: /signature.*xades|xades/i,
      fields: [
        { stepName: "signature-xades", type: "String", fieldName: "xmlSigne" },
      ],
    },
    {
      stepPattern: /canal.*routage|routage/i,
      fields: [
        { stepName: "canal-routage", type: "String", fieldName: "canalRoutage" },
      ],
    },
    {
      stepPattern: /enregistrement.*transaction/i,
      fields: [
        { stepName: "enregistrement-transaction", type: "Long", fieldName: "idTransaction" },
      ],
    },
    {
      stepPattern: /envoi.*canal|envoi.*swift/i,
      fields: [
        { stepName: "envoi-canal-routage", type: "String", fieldName: "codeRetourSWIFT" },
      ],
    },
    {
      stepPattern: /chargement.*compte/i,
      fields: [
        { stepName: "chargement-compte", type: "CompteDebiteurDTO", fieldName: "compteDebiteur" },
      ],
    },
    {
      stepPattern: /controle.*sanction|sanction/i,
      fields: [
        { stepName: "controle-sanctions", type: "SanctionsCheckResult", fieldName: "sanctionsResult" },
      ],
    },
    // ── v8.2 STEP 4: Champs typés Credit ─────────────────────────────────────
    {
      stepPattern: /scoring|score.*composite|score.*global|décision/i,
      fields: [
        { stepName: "scoring", type: "int", fieldName: "scoreComposite" },
        { stepName: "scoring", type: "String", fieldName: "decisionCredit" },
      ],
    },
    {
      stepPattern: /garantie|collateral|hypotheque|évaluation.*garantie/i,
      fields: [
        { stepName: "garantie", type: "BigDecimal", fieldName: "valeurGaranties" },
        { stepName: "garantie", type: "Long", fieldName: "idGarantie" },
      ],
    },
    {
      stepPattern: /création.*dossier|dossier.*crédit|ligne.*crédit/i,
      fields: [
        { stepName: "creation-dossier", type: "Long", fieldName: "idDossier" },
        { stepName: "creation-dossier", type: "Long", fieldName: "idCredit" },
      ],
    },
    {
      stepPattern: /écriture.*comptable|comptabilité|passation/i,
      fields: [
        { stepName: "ecritures-comptables", type: "long", fieldName: "idEcriture" },
      ],
    },
    {
      stepPattern: /déblocage|décaissement|versement.*fonds/i,
      fields: [
        { stepName: "deblocage", type: "BigDecimal", fieldName: "montant" },
        { stepName: "deblocage", type: "String", fieldName: "compteDebiteur" },
      ],
    },
    {
      stepPattern: /kyc|know.*your.*customer|vérification.*identit|éligibilité/i,
      fields: [
        { stepName: "verification-kyc", type: "Boolean", fieldName: "kycValide" },
      ],
    },
    // ── v8.2 STEP 4: Champs typés Virement ───────────────────────────────────
    {
      stepPattern: /conversion.*devise|devise.*conversion|taux.*change/i,
      fields: [
        { stepName: "conversion-devise", type: "BigDecimal", fieldName: "tauxChange" },
        { stepName: "conversion-devise", type: "BigDecimal", fieldName: "montantMAD" },
      ],
    },
    {
      stepPattern: /frais|commission/i,
      fields: [
        { stepName: "frais", type: "BigDecimal", fieldName: "fraisSwift" },
        { stepName: "frais", type: "BigDecimal", fieldName: "commissionChange" },
      ],
    },
    {
      stepPattern: /swift|soumission.*swift|envoi.*swift/i,
      fields: [
        { stepName: "soumission-swift", type: "String", fieldName: "refSwift" },
        { stepName: "soumission-swift", type: "String", fieldName: "uetr" },
      ],
    },
    {
      stepPattern: /enregistrement.*virement|virement.*international/i,
      fields: [
        { stepName: "enregistrement-virement", type: "Long", fieldName: "idVirement" },
      ],
    },
    {
      stepPattern: /débit|prélèvement|mouvement.*comptable/i,
      fields: [
        { stepName: "debit", type: "BigDecimal", fieldName: "montantDebite" },
      ],
    },
    // ── v8.2 STEP 4: Champs typés Client ─────────────────────────────────────
    {
      stepPattern: /ouverture.*compte|création.*compte/i,
      fields: [
        { stepName: "ouverture-compte", type: "String", fieldName: "numCompte" },
      ],
    },
    {
      stepPattern: /création.*client|dossier.*client|enregistrement.*client/i,
      fields: [
        { stepName: "creation-client", type: "String", fieldName: "codeClient" },
      ],
    },
    {
      stepPattern: /risque|niveau.*risque|évaluation.*risque/i,
      fields: [
        { stepName: "evaluation-risque", type: "String", fieldName: "niveauRisque" },
      ],
    },
    {
      stepPattern: /enregistrement.*kyc/i,
      fields: [
        { stepName: "enregistrement-kyc", type: "Long", fieldName: "idKyc" },
      ],
    },
    // ── Champs génériques (notification, etc.) ───────────────────────────────
    {
      stepPattern: /notification|envoi.*mail|sms/i,
      fields: [
        { stepName: "notification", type: "Boolean", fieldName: "notificationEnvoyee" },
      ],
    },
    // Champs communs (compte, agence)
    {
      stepPattern: /chargement.*compte|compte.*client/i,
      fields: [
        { stepName: "chargement-compte", type: "String", fieldName: "numCompte" },
        { stepName: "chargement-compte", type: "String", fieldName: "codeClient" },
        { stepName: "chargement-compte", type: "String", fieldName: "codeAgence" },
      ],
    },
    {
      stepPattern: /controle.*sanction|sanction/i,
      fields: [
        { stepName: "controle-sanctions", type: "SanctionsCheckResult", fieldName: "sanctionsResult" },
      ],
    },
  ];

  for (const pattern of bankingPatterns) {
    const matchingStep = steps.find((s) => pattern.stepPattern.test(s.label));
    if (matchingStep) {
      for (const field of pattern.fields) {
        if (!seen.has(field.fieldName)) {
          seen.add(field.fieldName);
          results.push({
            ...field,
            stepName: matchingStep.name,
          });
        }
      }
    }
  }
}
