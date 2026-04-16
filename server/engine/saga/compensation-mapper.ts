/**
 * Compensation Mapper — Compleo v8.2
 *
 * Mapping fixe entre les steps compensables et le code de compensation reel.
 * Ce mapping remplace les TODO dans les methodes compensateStepN().
 *
 * Chaque compensation doit etre IDEMPOTENTE : si elle est appelee
 * plusieurs fois (retry), le resultat doit etre identique.
 *
 * @author Hamza NORDINE
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface CompensationMapping {
  body: string;        // code Java inline pour la compensation
  description: string; // description pour le Javadoc
}

// ── Credit Compensation Map ──────────────────────────────────────────────────

const CREDIT_COMPENSATION_MAP: Record<number, CompensationMapping> = {

  // Step 3 — Compensation evaluation garanties
  3: {
    description: "Invalider l'evaluation des garanties dans le contexte",
    body: `
            log.warn("[SAGA:Credit] Compensation step 3 — invalidation evaluation garanties");
            ctx.setValeurGaranties(null);
            logTransition(ctx, "COMPENSATING", "COMPENSATED", null);`,
  },

  // Step 4 — Compensation scoring
  4: {
    description: "Invalider le scoring composite dans le contexte",
    body: `
            log.warn("[SAGA:Credit] Compensation step 4 — invalidation scoring");
            ctx.setScoreComposite(0);
            logTransition(ctx, "COMPENSATING", "COMPENSATED", null);`,
  },

  // Step 8 — Deblocage garanties (compensation = liberation)
  8: {
    description: "Liberer les garanties bloquees pour le dossier",
    body: `
            log.warn("[SAGA:Credit] Compensation step 8 — liberation garanties dossier {}", ctx.getIdDossier());
            jdbcTemplate.update(
                "UPDATE T_GARANTIES SET STATUT = 'DISPONIBLE', ID_DOSSIER_CREDIT = NULL WHERE ID_DOSSIER_CREDIT = ? AND STATUT = 'BLOQUEE'",
                ctx.getIdDossier());
            logTransition(ctx, "COMPENSATING", "COMPENSATED", null);`,
  },

  // Step 9 — Annulation dossier credit
  9: {
    description: "Annuler le dossier de credit cree",
    body: `
            log.warn("[SAGA:Credit] Compensation step 9 — annulation dossier {}", ctx.getIdDossier());
            jdbcTemplate.update(
                "UPDATE T_DOSSIERS_CREDIT SET STATUT = 'ANNULE', MOTIF_ANNULATION = ? WHERE ID_DOSSIER = ?",
                "SAGA_COMPENSATION:" + ctx.getSagaId(), ctx.getIdDossier());
            logTransition(ctx, "COMPENSATING", "COMPENSATED", null);`,
  },

  // Step 10 — Annulation deblocage fonds
  10: {
    description: "Annuler le deblocage des fonds (re-debiter le compte)",
    body: `
            log.warn("[SAGA:Credit] Compensation step 10 — annulation deblocage fonds sur {}", ctx.getCompteDebiteur());
            jdbcTemplate.update(
                "UPDATE T_COMPTES SET SOLDE = SOLDE - ? WHERE NUM_COMPTE = ? AND STATUT = 'ACTIF'",
                ctx.getMontant(), ctx.getCompteDebiteur());
            logTransition(ctx, "COMPENSATING", "COMPENSATED", null);`,
  },

  // Step 11 — Contre-passation ecritures comptables
  11: {
    description: "Contre-passer les ecritures comptables via le service comptabilite",
    body: `
            log.warn("[SAGA:Credit] Compensation step 11 — contre-passation ecriture {}", ctx.getIdEcriture());
            comptabiliteGeneraleService.contrePasserEcriture(
                ctx.getIdEcriture(),
                "SAGA_COMPENSATION:" + ctx.getSagaId());
            logTransition(ctx, "COMPENSATING", "COMPENSATED", null);`,
  },
};

// ── Virement Compensation Map ────────────────────────────────────────────────

const VIREMENT_COMPENSATION_MAP: Record<number, CompensationMapping> = {

  // debit-compte
  3: {
    description: "Re-crediter le compte debite",
    body: `
            log.warn("[SAGA:Virement] Compensation step 3 — re-credit compte");
            jdbcTemplate.update("UPDATE T_COMPTES SET SOLDE = SOLDE + ? WHERE NUM_COMPTE = ?",
                ctx.getMontantDebite(), ctx.getNumCompte());
            logTransition(ctx, "COMPENSATING", "COMPENSATED", null);`,
  },

  // enregistrement-virement
  5: {
    description: "Annuler le virement enregistre",
    body: `
            log.warn("[SAGA:Virement] Compensation step 5 — annulation virement {}", ctx.getIdVirement());
            jdbcTemplate.update(
                "UPDATE T_VIREMENTS_INTERNATIONAUX SET STATUT = 'ANNULE', MOTIF_ANNULATION = ? WHERE ID_VIREMENT = ?",
                "SAGA_COMPENSATION:" + ctx.getSagaId(), ctx.getIdVirement());
            logTransition(ctx, "COMPENSATING", "COMPENSATED", null);`,
  },

  // ecritures-comptables
  6: {
    description: "Contre-passer les ecritures comptables du virement",
    body: `
            log.warn("[SAGA:Virement] Compensation step 6 — contre-passation ecriture");
            comptabiliteGeneraleService.contrePasserEcriture(
                ctx.getIdEcriture(), "SAGA_COMPENSATION:" + ctx.getSagaId());
            logTransition(ctx, "COMPENSATING", "COMPENSATED", null);`,
  },

  // soumission-swift
  7: {
    description: "Generer un message PAIN.002 d'annulation SWIFT",
    body: `
            log.info("[SAGA:Virement] Compensation step 7 — generation PAIN.002 annulation pour ref={}", ctx.getRefSwift());
            // En production : envoi du message PAIN.002 via le canal SWIFT
            logTransition(ctx, "COMPENSATING", "COMPENSATED", null);`,
  },
};

// ── Client Compensation Map ──────────────────────────────────────────────────

const CLIENT_COMPENSATION_MAP: Record<number, CompensationMapping> = {

  // creation-dossier-client
  4: {
    description: "Archiver le dossier client cree",
    body: `
            log.warn("[SAGA:Client] Compensation step 4 — archivage client {}", ctx.getCodeClient());
            jdbcTemplate.update("UPDATE T_CLIENTS SET STATUT = 'ARCHIVE' WHERE CODE_CLIENT = ?",
                ctx.getCodeClient());
            logTransition(ctx, "COMPENSATING", "COMPENSATED", null);`,
  },

  // ouverture-compte
  5: {
    description: "Fermer le compte ouvert",
    body: `
            log.warn("[SAGA:Client] Compensation step 5 — fermeture compte {}", ctx.getNumCompte());
            jdbcTemplate.update("UPDATE T_COMPTES SET STATUT = 'FERME' WHERE NUM_COMPTE = ?",
                ctx.getNumCompte());
            logTransition(ctx, "COMPENSATING", "COMPENSATED", null);`,
  },

  // enregistrement-kyc
  6: {
    description: "Supprimer les donnees KYC enregistrees",
    body: `
            log.warn("[SAGA:Client] Compensation step 6 — suppression KYC client {}", ctx.getCodeClient());
            jdbcTemplate.update("DELETE FROM T_KYC_CLIENTS WHERE CODE_CLIENT = ?",
                ctx.getCodeClient());
            logTransition(ctx, "COMPENSATING", "COMPENSATED", null);`,
  },

  // parametrage-services
  7: {
    description: "Annuler le parametrage des services (carte, e-banking)",
    body: `
            log.info("[SAGA:Client] Compensation step 7 — annulation parametrage services client={}", ctx.getCodeClient());
            // Annulation carte + e-banking — en production via API dediee
            logTransition(ctx, "COMPENSATING", "COMPENSATED", null);`,
  },
};

// ── Registre global ──────────────────────────────────────────────────────────

const COMPENSATION_MAPS: Record<string, Record<number, CompensationMapping>> = {
  credit: CREDIT_COMPENSATION_MAP,
  virement: VIREMENT_COMPENSATION_MAP,
  client: CLIENT_COMPENSATION_MAP,
};

// ── API publique ─────────────────────────────────────────────────────────────

/**
 * Retourne le code de compensation pour un step donne.
 * Si aucun mapping n'est disponible, retourne null (le generateur utilisera le fallback TODO).
 */
export function getCompensationBody(domain: string, stepOrder: number): string | null {
  const normalized = domain.toLowerCase().replace(/[^a-z]/g, "");
  for (const [key, map] of Object.entries(COMPENSATION_MAPS)) {
    if (normalized.includes(key)) {
      const mapping = map[stepOrder];
      return mapping ? mapping.body : null;
    }
  }
  return null;
}

/**
 * Retourne la description de compensation pour un step donne.
 */
export function getCompensationDescription(domain: string, stepOrder: number): string | null {
  const normalized = domain.toLowerCase().replace(/[^a-z]/g, "");
  for (const [key, map] of Object.entries(COMPENSATION_MAPS)) {
    if (normalized.includes(key)) {
      const mapping = map[stepOrder];
      return mapping ? mapping.description : null;
    }
  }
  return null;
}
