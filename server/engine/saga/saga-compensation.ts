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

  // Post-Audit STEP 8: Compensations concrètes + SQL Oracle

  // Décaissement crédit → Annuler le décaissement
  {
    pattern: /décaissement|deblocage|versement.*crédit/i,
    build: () => ({
      method: "annulerDecaissement",
      description:
        "Annuler le décaissement : re-créditer le compte de prêt et débiter le compte client",
      sqlHint:
        "UPDATE T_PRETS SET STATUT = 'ANNULE', DATE_ANNULATION = SYSDATE WHERE REFERENCE_PRET = :refPret; " +
        "UPDATE T_COMPTES SET SOLDE = SOLDE - :montant WHERE NUMERO_COMPTE = :compteClient",
    }),
  },

  // Garantie → Libérer la garantie
  {
    pattern: /garantie|collateral|hypotheque|nantissement/i,
    build: () => ({
      method: "libererGarantie",
      description:
        "Libérer la garantie enregistrée (hypothèque, nantissement, caution)",
      sqlHint:
        "UPDATE T_GARANTIES SET STATUT = 'LIBEREE', DATE_LIBERATION = SYSDATE WHERE REFERENCE_GARANTIE = :refGarantie",
    }),
  },

  // Échéancier → Supprimer l'échéancier
  {
    pattern: /echeancier|amortissement|plan.*remboursement/i,
    build: () => ({
      method: "supprimerEcheancier",
      description:
        "Supprimer l'échéancier généré pour le prêt",
      sqlHint:
        "DELETE FROM T_ECHEANCIER WHERE REFERENCE_PRET = :refPret AND STATUT = 'GENERE'",
    }),
  },

  // Ouverture compte → Fermer le compte
  {
    pattern: /ouverture.*compte|création.*compte/i,
    build: () => ({
      method: "fermerCompte",
      description:
        "Fermer le compte ouvert (statut CLOTURE, date clôture)",
      sqlHint:
        "UPDATE T_COMPTES SET STATUT = 'CLOTURE', DATE_CLOTURE = SYSDATE, MOTIF_CLOTURE = 'ANNULATION_SAGA' WHERE NUMERO_COMPTE = :numeroCompte",
    }),
  },

  // KYC → Invalider le KYC
  {
    pattern: /kyc|know.*your.*customer|vérification.*identit/i,
    build: () => ({
      method: "invaliderKyc",
      description:
        "Invalider la vérification KYC effectuée",
      sqlHint:
        "UPDATE T_KYC_VERIFICATIONS SET STATUT = 'INVALIDE', DATE_INVALIDATION = SYSDATE WHERE REFERENCE_KYC = :refKyc",
    }),
  },

  // Notification → Envoyer notification d'annulation
  {
    pattern: /notification|envoi.*mail|sms|alerte/i,
    build: () => ({
      method: "envoyerNotificationAnnulation",
      description:
        "Envoyer une notification d'annulation au client",
      sqlHint: null,
    }),
  },

  // Scoring → Invalider le score
  {
    pattern: /scoring|calcul.*score|décision.*crédit/i,
    build: () => ({
      method: "invaliderScoring",
      description:
        "Invalider le scoring et la décision de crédit",
      sqlHint:
        "UPDATE T_SCORING SET STATUT = 'INVALIDE' WHERE ID_DEMANDE = :idDemande; " +
        "UPDATE T_DECISIONS_CREDIT SET STATUT = 'ANNULEE' WHERE ID_DEMANDE = :idDemande",
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
