/**
 * Saga Compensation — Compleo v7.9
 *
 * Infère les actions de compensation pour chaque step d'écriture
 * d'une Saga. Basé sur les patterns bancaires BMCE/BAM.
 *
 * Règles d'inférence :
 *   - Débit compte → Re-créditer
 *   - Enregistrement transaction → Annuler (statut ANNULE)
 *   - Écriture comptable → Contre-passer (sens inversé)
 *   - Score crédit → Invalider
 *   - Envoi SWIFT/SEPA → Envoyer annulation PAIN.002
 *   - Mise à jour statut → Restaurer statut précédent
 *
 * @author Hamza NORDINE
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface CompensationAction {
  /** Nom de la méthode de compensation (ex: compenserDebitCompte) */
  method: string;
  /** Description humaine de la compensation */
  description: string;
  /** Hint SQL pour la compensation (null si pas de SQL direct) */
  sqlHint: string | null;
}

// ── Règles d'inférence ──────────────────────────────────────────────────────

interface CompensationRule {
  /** Pattern regex sur le label du step */
  pattern: RegExp;
  /** Fabrique de CompensationAction */
  build: (label: string) => CompensationAction;
}

const COMPENSATION_RULES: CompensationRule[] = [
  // Débit compte → Re-créditer
  {
    pattern: /débit|debit/i,
    build: () => ({
      method: "compenserDebitCompte",
      description:
        "Re-créditer le compte débité du montant de la transaction",
      sqlHint:
        "UPDATE T_COMPTES SET SOLDE = SOLDE + :montant WHERE IBAN = :iban",
    }),
  },

  // Enregistrement transaction → Annuler la transaction
  {
    pattern: /enregistr|insert.*transaction|transaction.*sepa/i,
    build: () => ({
      method: "annulerTransaction",
      description: "Passer le statut de la transaction à ANNULE",
      sqlHint:
        "UPDATE T_TRANSACTIONS_SEPA SET STATUT = 'ANNULE', MOTIF_ANNULATION = :motif WHERE END_TO_END_ID = :e2eId",
    }),
  },

  // Écriture comptable → Contre-passer
  {
    pattern: /écriture|comptab|compta/i,
    build: () => ({
      method: "contrePasserEcriture",
      description:
        "Passer une écriture comptable de contre-passation (sens inversé)",
      sqlHint:
        "INSERT INTO T_ECRITURES_COMPTABLES (TYPE, SENS, MONTANT, REF_ORIGINE) VALUES ('CONTREPASSATION', :sensInverse, :montant, :refOrigine)",
    }),
  },

  // Score crédit → Invalider le score
  {
    pattern: /score|persister.*score|persistance/i,
    build: () => ({
      method: "invaliderScore",
      description: "Marquer le score comme INVALIDE",
      sqlHint:
        "UPDATE T_SCORES_CREDIT SET STATUT = 'INVALIDE' WHERE ID_SCORE = :idScore",
    }),
  },

  // Envoi SWIFT/SEPA → Envoyer annulation
  {
    pattern: /envoi|swift|canal|routage/i,
    build: () => ({
      method: "envoyerAnnulationSEPA",
      description:
        "Envoyer un message SEPA PAIN.002 (rejet/annulation)",
      sqlHint: null,
    }),
  },

  // Mise à jour statut → Restaurer statut précédent
  {
    pattern: /maj.*statut|mise.*jour.*statut|status.*update/i,
    build: () => ({
      method: "restaurerStatutPrecedent",
      description:
        "Restaurer le statut précédent de l'entité",
      sqlHint:
        "UPDATE T_TRANSACTIONS_SEPA SET STATUT = :statutPrecedent WHERE END_TO_END_ID = :e2eId",
    }),
  },
];

// ── API publique ─────────────────────────────────────────────────────────────

/**
 * Infère la compensation pour un step donné.
 * Retourne null si le step n'est pas compensable.
 */
export function inferCompensation(
  stepLabel: string,
  source: string,
): CompensationAction | null {
  for (const rule of COMPENSATION_RULES) {
    if (rule.pattern.test(stepLabel)) {
      return rule.build(stepLabel);
    }
  }

  // Fallback : si le label contient un verbe d'écriture générique
  if (/insert|update|delete|créer|modifier|supprimer/i.test(stepLabel)) {
    return {
      method: `compenser${toPascalCase(stepLabel)}`,
      description: `Compenser l'opération : ${stepLabel}`,
      sqlHint: null,
    };
  }

  return null;
}

// ── Utilitaire ───────────────────────────────────────────────────────────────

function toPascalCase(s: string): string {
  return s
    .replace(/[^a-zA-ZÀ-ÿ0-9]+/g, " ")
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("");
}
