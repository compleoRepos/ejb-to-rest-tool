/**
 * Step Body Mapper — Compleo v8.2
 *
 * Mapping fixe entre les labels de steps et les appels services Spring.
 * Ce mapping est construit depuis l'analyse du code EJB source.
 *
 * Chaque entry decrit :
 *   - Le service Spring a appeler
 *   - La methode du service
 *   - Les arguments a passer (depuis ctx.getXxx() ou input.getXxx())
 *   - Le champ du Context ou stocker le resultat
 *
 * Pour les steps qui sont des operations LOCALES (calcul, validation),
 * le body est inline (pas d'appel service).
 *
 * @author Hamza NORDINE
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface StepBodyMapping {
  service: string | null;     // null = inline (pas d'appel service)
  method: string | null;
  args: string[];             // expressions Java pour les arguments
  resultField: string | null; // champ ctx.setXxx() pour stocker le resultat
  resultType: string | null;
  inlineCode: string;         // code inline pour le step body
}

// ── Credit Step Body Map ─────────────────────────────────────────────────────

const CREDIT_STEP_BODY_MAP: Record<number, StepBodyMapping> = {

  // Step 1 — Validation dossier (locale, pas d'appel service)
  1: {
    service: null, method: null, args: [], resultField: null, resultType: null,
    inlineCode: `
        if (input.getCodeClient() == null || input.getCodeClient().isEmpty()) {
            throw new DossierInvalidException("Code client obligatoire");
        }
        if (input.getMontantDemande() == null || input.getMontantDemande().compareTo(BigDecimal.ZERO) <= 0) {
            throw new DossierInvalidException("Montant demande invalide");
        }
        log.info("[SAGA:Credit] Dossier valide pour client {}", input.getCodeClient());`,
  },

  // Step 2 — Verification eligibilite KYC
  2: {
    service: "kycRemediationService", method: "verifierEligibiliteClient",
    args: ["input.getCodeClient()"],
    resultField: "kycValide", resultType: "Boolean",
    inlineCode: `
        boolean eligible = kycRemediationService.verifierEligibiliteClient(input.getCodeClient());
        ctx.setKycValide(eligible);
        if (!eligible) {
            throw new ClientNonEligibleException("Client non eligible - KYC incomplet: " + input.getCodeClient());
        }`,
  },

  // Step 3 — Evaluation des garanties
  3: {
    service: "garantieEvalService", method: "evaluerGaranties",
    args: ["input.getCodeClient()", "input.getIdsGaranties()"],
    resultField: "valeurGaranties", resultType: "BigDecimal",
    inlineCode: `
        BigDecimal valeurGaranties = garantieEvalService.evaluerGaranties(
            input.getCodeClient(), input.getIdsGaranties());
        ctx.setValeurGaranties(valeurGaranties);
        log.info("[SAGA:Credit] Garanties evaluees: {}", valeurGaranties);`,
  },

  // Step 4 — Scoring composite
  4: {
    service: "scoringInternService", method: "calculerScoreComposite",
    args: ["input.getCodeClient()", "input.getMontantDemande()", "input.getDureeMois()"],
    resultField: "scoreComposite", resultType: "int",
    inlineCode: `
        int score = scoringInternService.calculerScoreComposite(
            input.getCodeClient(), input.getMontantDemande(), input.getDureeMois());
        ctx.setScoreComposite(score);
        log.info("[SAGA:Credit] Score composite: {}", score);`,
  },

  // Step 5 — Verification limites d'engagement (query locale)
  5: {
    service: null, method: null, args: [], resultField: null, resultType: null,
    inlineCode: `
        log.info("[SAGA:Credit] Verification limites engagement pour client {}", input.getCodeClient());
        // Verification effectuee par le service domaine dans le monolithe`,
  },

  // Step 6 — Calcul conditions financieres (calcul local)
  6: {
    service: null, method: null, args: [], resultField: null, resultType: null,
    inlineCode: `
        log.info("[SAGA:Credit] Calcul conditions financieres - score={}", ctx.getScoreComposite());
        // Calcul effectue par le service domaine`,
  },

  // Step 7 — Decision
  7: {
    service: null, method: null, args: [], resultField: "decisionCredit", resultType: "String",
    inlineCode: `
        String decision;
        if (ctx.getScoreComposite() >= 680) {
            decision = "APPROUVE_AUTO";
        } else if (ctx.getScoreComposite() >= 450) {
            decision = "ESCALADE_COMITE";
        } else {
            decision = "REFUSE";
        }
        ctx.setDecisionCredit(decision);
        log.info("[SAGA:Credit] Decision: {} (score={})", decision, ctx.getScoreComposite());`,
  },

  // Step 8 — Blocage garanties
  8: {
    service: null, method: null, args: [], resultField: "idGarantie", resultType: "Long",
    inlineCode: `
        if ("APPROUVE_AUTO".equals(ctx.getDecisionCredit())) {
            for (Long idGarantie : input.getIdsGaranties()) {
                jdbcTemplate.update(
                    "UPDATE T_GARANTIES SET STATUT = 'BLOQUEE', ID_DOSSIER_CREDIT = ? WHERE ID_GARANTIE = ? AND STATUT = 'DISPONIBLE'",
                    ctx.getIdDossier(), idGarantie);
                ctx.setIdGarantie(idGarantie);
            }
            log.info("[SAGA:Credit] Garanties bloquees pour dossier {}", ctx.getIdDossier());
        }`,
  },

  // Step 9 — Creation dossier + ligne de credit
  9: {
    service: null, method: null, args: [], resultField: "idDossier", resultType: "Long",
    inlineCode: `
        KeyHolder kh = new GeneratedKeyHolder();
        jdbcTemplate.update(conn -> {
            PreparedStatement ps = conn.prepareStatement(
                "INSERT INTO T_DOSSIERS_CREDIT (CODE_CLIENT, TYPE_CREDIT, MONTANT_DEMANDE, DUREE_MOIS, SCORE_COMPOSITE, DECISION, STATUT, DATE_CREATION) " +
                "VALUES (?, ?, ?, ?, ?, ?, 'EN_FORCE', SYSDATE)",
                new String[]{"ID_DOSSIER"});
            ps.setString(1, input.getCodeClient());
            ps.setString(2, input.getTypeCredit());
            ps.setBigDecimal(3, input.getMontantDemande());
            ps.setInt(4, input.getDureeMois());
            ps.setInt(5, ctx.getScoreComposite());
            ps.setString(6, ctx.getDecisionCredit());
            return ps;
        }, kh);
        ctx.setIdDossier(kh.getKey().longValue());
        log.info("[SAGA:Credit] Dossier cree - idDossier={}", ctx.getIdDossier());`,
  },

  // Step 10 — Deblocage des fonds
  10: {
    service: null, method: null, args: [], resultField: null, resultType: null,
    inlineCode: `
        if ("APPROUVE_AUTO".equals(ctx.getDecisionCredit())) {
            ctx.setMontant(input.getMontantDemande());
            ctx.setCompteDebiteur(input.getNumComptePret());
            int rows = jdbcTemplate.update(
                "UPDATE T_COMPTES SET SOLDE = SOLDE + ? WHERE NUM_COMPTE = ? AND STATUT = 'ACTIF'",
                input.getMontantDemande(), input.getNumComptePret());
            if (rows == 0) {
                throw new TechnicalException("ERR_DEBLOCK", "Compte introuvable: " + input.getNumComptePret());
            }
            log.info("[SAGA:Credit] Fonds debloques - {} MAD sur {}", input.getMontantDemande(), input.getNumComptePret());
        }`,
  },

  // Step 11 — Ecritures comptables
  11: {
    service: "comptabiliteGeneraleService", method: "passerEcrituresOctroiCredit",
    args: ["ctx.getIdDossier()", "input.getCodeClient()", "input.getMontantDemande()", "BigDecimal.ZERO"],
    resultField: "idEcriture", resultType: "long",
    inlineCode: `
        long idEcriture = comptabiliteGeneraleService.passerEcrituresOctroiCredit(
            ctx.getIdDossier(), input.getCodeClient(),
            input.getMontantDemande(), BigDecimal.ZERO);
        ctx.setIdEcriture(idEcriture);
        log.info("[SAGA:Credit] Ecritures comptables passees - idEcriture={}", idEcriture);`,
  },

  // Step 12 — Notification (fire-and-forget)
  12: {
    service: "notificationService", method: "notifierDecisionCredit",
    args: ["input.getCodeClient()", "ctx.getDecisionCredit()", "input.getMontantDemande()", "\"Octroi credit\""],
    resultField: null, resultType: null,
    inlineCode: `
        notificationService.notifierDecisionCredit(
            input.getCodeClient(), ctx.getDecisionCredit(),
            input.getMontantDemande(), "Octroi credit");
        log.info("[SAGA:Credit] Notification envoyee - client={}", input.getCodeClient());`,
  },
};

// ── API publique ─────────────────────────────────────────────────────────────

/**
 * Retourne le mapping step body pour un domaine donne.
 * Retourne null si aucun mapping n'est disponible pour ce domaine.
 */
export function getStepBodyMap(domain: string): Record<number, StepBodyMapping> | null {
  const normalized = domain.toLowerCase().replace(/[^a-z]/g, "");
  if (normalized.includes("credit")) return CREDIT_STEP_BODY_MAP;
  // Virement et Client n'ont pas de mapping explicite — les steps restent en TODO
  // car ils seront enrichis par le ML ou le fallback
  return null;
}

/**
 * Retourne le code inline pour un step donne.
 * Si aucun mapping n'est disponible, retourne null (le generateur utilisera le fallback TODO).
 */
export function getStepBody(domain: string, stepOrder: number): string | null {
  const map = getStepBodyMap(domain);
  if (!map) return null;
  const mapping = map[stepOrder];
  if (!mapping) return null;
  return mapping.inlineCode;
}

/**
 * Retourne les services additionnels requis par les step bodies d'un domaine.
 * Ces services doivent etre injectes dans le constructeur de l'orchestrateur.
 */
export function getAdditionalServicesForDomain(domain: string): string[] {
  const map = getStepBodyMap(domain);
  if (!map) return [];
  const services = new Set<string>();
  for (const mapping of Object.values(map)) {
    if (mapping.service) {
      services.add(mapping.service);
    }
  }
  return [...services];
}
