package com.bank.tools.generator.bian;

import com.bank.tools.generator.model.UseCaseInfo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.*;

/**
 * Detecteur intelligent de mapping BIAN.
 *
 * Quand aucun bian-mapping.yml explicite ne couvre un UseCase,
 * ce composant devine automatiquement :
 * <ul>
 *   <li>Le Service Domain BIAN</li>
 *   <li>L'action BIAN (initiation, retrieval, execution, control, update, termination, evaluation, notification)</li>
 *   <li>Le Behavior Qualifier</li>
 *   <li>La methode HTTP (POST, PUT)</li>
 *   <li>Le code HTTP (200, 201)</li>
 *   <li>La presence ou non de {cr-reference-id} dans l'URL</li>
 * </ul>
 *
 * La strategie est basee sur le scoring par mots-cles :
 * nom du UseCase + package + noms des VoIn/VoOut.
 */
@Component
public class BianAutoDetector {

    private static final Logger log = LoggerFactory.getLogger(BianAutoDetector.class);

    // ===================== SERVICE DOMAIN KEYWORDS =====================

    private static final Map<List<String>, String> DOMAIN_KEYWORDS = new LinkedHashMap<>();
    static {
        // Carte bancaire
        DOMAIN_KEYWORDS.put(List.of("carte", "card", "activer", "bloquer", "opposition", "receptionner",
            "pin", "plafond", "cvv", "porteur"), "card-management");

        // Compte courant
        DOMAIN_KEYWORDS.put(List.of("compte", "account", "solde", "balance", "ouvrir", "cloturer",
            "releve", "decouvert", "agios", "dormant"), "current-account");

        // Epargne
        DOMAIN_KEYWORDS.put(List.of("epargne", "savings", "placement", "depot", "terme",
            "capitalisation"), "savings-account");

        // Virement / Paiement / MAD (Mise A Disposition)
        DOMAIN_KEYWORDS.put(List.of("virement", "transfer", "payment", "paiement", "sepa",
            "swift", "prelevement", "batch", "remise", "impaye",
            "miseadisposition", "disposition", "madattente", "traitement", "montant",
            "annuler", "emission", "transaction"), "payment-initiation");

        // Client / Tiers / Beneficiaire / Authentification
        DOMAIN_KEYWORDS.put(List.of("client", "party", "customer", "charger", "tiers",
            "prospect", "kyc", "sascc", "cin", "personne",
            "beneficiaire", "beneficiari", "benef", "beneficiaries",
            "telephone", "eligibilite", "eligibility",
            "auth", "token", "authentif", "login", "session", "madcore"), "party");

        // Credit / Pret
        DOMAIN_KEYWORDS.put(List.of("credit", "loan", "pret", "simuler", "scoring",
            "amortissement", "echeance", "refinancement", "restructuration",
            "dossier", "garantie", "hypotheque"), "loan");

        // Notification
        DOMAIN_KEYWORDS.put(List.of("notification", "notifier", "alert", "sms", "email",
            "push", "message", "envoyer", "multicanal"), "customer-notification");

        // Document
        DOMAIN_KEYWORDS.put(List.of("document", "releve", "attestation", "generer", "pdf",
            "edition", "impression", "courrier", "archivage",
            // Avis opere / GED / consultation documentaire
            "avis", "opere", "ged", "docubase", "edoc",
            "fichier", "scan", "numerisation",
            "repdemat", "view", "search"), "document-management");

        // Change / Devise
        DOMAIN_KEYWORDS.put(List.of("devise", "change", "currency", "exchange", "forex",
            "conversion", "taux", "cours"), "currency-exchange");

        // Conformite / Reglementaire
        DOMAIN_KEYWORDS.put(List.of("compliance", "conformite", "lbc", "ft", "sanctions",
            "aml", "kyc", "pep", "filtrage", "embargo", "reglementaire",
            "vigilance", "declaration", "suspicion"), "regulatory-compliance");

        // Risque
        DOMAIN_KEYWORDS.put(List.of("risk", "risque", "var", "stress", "exposition",
            "limite", "contrepartie", "marche", "operationnel",
            "liquidite", "concentration"), "risk-management");

        // Commande de chequier / Payment Order
        DOMAIN_KEYWORDS.put(List.of("chequier", "chequebook", "commande", "command",
            "vignette", "carnet", "cheque"), "payment-order");

        // Produit
        DOMAIN_KEYWORDS.put(List.of("produit", "product", "catalogue", "tarif", "offre",
            "souscription", "pack"), "product-directory");
    }

    // ===================== ACTION VERBS =====================

    private static final Map<String, List<String>> ACTION_VERBS = new LinkedHashMap<>();
    static {
        // ORDRE IMPORTANT : les actions les plus specifiques d'abord.
        // retrieval AVANT initiation car "get", "is", "list" sont des prefixes courts.

        // RETRIEVAL — Consulter/lire sans modifier (POST avec body, {cr-ref-id}, 200)
        ACTION_VERBS.put("retrieval", List.of(
            "consulter", "charger", "chercher", "rechercher", "lister",
            "get", "find", "fetch", "load", "read", "search", "list", "view",
            "afficher", "visualiser", "recuperer", "extraire", "generer",
            "hist", "historique", "isbenef", "eligibilite",
            "is", "existe",  // IsBenefEnregistrer = verification/consultation
            "suivi"  // SuiviCommande = consultation de suivi
        ));

        // INITIATION — Creer une nouvelle ressource (POST, pas de {cr-ref-id}, 201)
        ACTION_VERBS.put("initiation", List.of(
            "ouvrir", "creer", "create", "add", "register", "open",
            "souscrire", "initier", "demander", "enregistrer", "inscrire",
            "virement", "virer", "transferer", "transfer",
            "ajout", "ajouter", "emission", "emettre", "emit",
            "traitement",  // TraitementMad = creation d'une mise a disposition
            "enrg", "commande"  // EnrgCommande = creation d'une commande de chequier
        ));

        // EVALUATION — Calculer/simuler sans modifier (POST, pas de {cr-ref-id}, 200)
        ACTION_VERBS.put("evaluation", List.of(
            "simuler", "simulate", "evaluer", "evaluate", "calculer", "calculate",
            "estimer", "estimate", "scorer", "scoring", "tarifer", "coter"
        ));

        // NOTIFICATION — Envoyer une notification (POST, pas de {cr-ref-id}, 201)
        ACTION_VERBS.put("notification", List.of(
            "notifier", "notify", "notification", "envoyer", "send", "alerter", "alert",
            "diffuser", "publier", "communiquer", "sms", "email", "multicanal"
        ));

        // CONTROL — Verifier/controler/bloquer (PUT, {cr-ref-id}, 200)
        ACTION_VERBS.put("control", List.of(
            "bloquer", "block", "controler",
            "valider", "validate", "approuver", "approve", "rejeter", "reject",
            "suspendre", "suspend", "geler", "freeze", "opposition",
            "control", "controlmontant"
        ));

        // UPDATE — Modifier une ressource existante (PUT, {cr-ref-id}, 200)
        ACTION_VERBS.put("update", List.of(
            "modifier", "update", "edit", "change", "mettre", "maj",
            "corriger", "rectifier", "ajuster", "renouveler", "prolonger",
            "modif", "modifiertel", "modifbenef"
        ));

        // TERMINATION — Fermer/cloturer (PUT, {cr-ref-id}, 200)
        ACTION_VERBS.put("termination", List.of(
            "cloturer", "close", "fermer", "terminer", "terminate",
            "resilier", "annuler", "cancel", "revoquer", "supprimer",
            "desactiver", "deactivate", "archiver",
            "supf", "supprimerbenef"
        ));

        // EXECUTION — Executer une operation metier (POST, {cr-ref-id}, 200)
        // C'est le fallback, mais aussi l'action pour les operations transactionnelles
        ACTION_VERBS.put("execution", List.of(
            "executer", "execute", "traiter", "process", "run", "perform",
            "activer", "activate", "receptionner", "effectuer",
            "debiter", "crediter", "payer",
            "madcore"
        ));
    }

    // ===================== BQ NORMALIZATION TABLE =====================

    private static final Map<String, String> BQ_NORMALIZE = new LinkedHashMap<>();
    static {
        // Abréviations BOA → noms complets
        BQ_NORMALIZE.put("benef", "beneficiary");
        BQ_NORMALIZE.put("beneficiari", "beneficiary");
        BQ_NORMALIZE.put("beneficiaries", "beneficiary");
        BQ_NORMALIZE.put("benef-enregistrer", "beneficiary-registration");

        // Jargon interne → noms fonctionnels
        BQ_NORMALIZE.put("mad", "transfer");
        BQ_NORMALIZE.put("hist-mad-attente", "pending-history");
        BQ_NORMALIZE.put("list-mad-attente", "pending-list");
        BQ_NORMALIZE.put("core-auth", "authentication");

        // Français → anglais
        BQ_NORMALIZE.put("eligibilite", "eligibility");
        BQ_NORMALIZE.put("montant", "amount");
        BQ_NORMALIZE.put("telephone", "phone");
        BQ_NORMALIZE.put("virement", "transfer");
        BQ_NORMALIZE.put("solde", "balance");
        BQ_NORMALIZE.put("carte", "card");
        BQ_NORMALIZE.put("compte", "account");
        BQ_NORMALIZE.put("client", "customer");
        BQ_NORMALIZE.put("historique", "history");
        BQ_NORMALIZE.put("consultation", "inquiry");
        BQ_NORMALIZE.put("emission", "issuance");
        BQ_NORMALIZE.put("annulation", "cancellation");
        BQ_NORMALIZE.put("cloture", "closure");
        BQ_NORMALIZE.put("ouverture", "opening");
        BQ_NORMALIZE.put("reception", "reception");
        BQ_NORMALIZE.put("activer-carte", "card-activation");
        BQ_NORMALIZE.put("client-data", "customer-data");

        // Noms de classes EJB → noms REST (FIX 2)
        BQ_NORMALIZE.put("devise-conversion", "conversion");
        BQ_NORMALIZE.put("virement-sepa", "transfer");
        BQ_NORMALIZE.put("virement-sepaorchestrateur", "transfer");
        BQ_NORMALIZE.put("credit-scoring", "scoring");
        BQ_NORMALIZE.put("notification-multicanal", "notification");
        BQ_NORMALIZE.put("risk-management", "risk-assessment");

        // Avis opere / GED — noms de classes EJB → BQ REST distincts
        BQ_NORMALIZE.put("avis-opere-get-list-index", "list-index");
        BQ_NORMALIZE.put("avis-opere-get-list-type-document", "type-list");
        BQ_NORMALIZE.put("search-avis-opere", "search");
        BQ_NORMALIZE.put("view-avis-opere", "view");
        BQ_NORMALIZE.put("view-releve-seule-page", "single-page");

        // Commander chequier / Payment Order
        BQ_NORMALIZE.put("enrg-commande", "order");
        BQ_NORMALIZE.put("suivi-commande", "tracking");
        BQ_NORMALIZE.put("history-cmd", "history");
        BQ_NORMALIZE.put("commande", "order");
        BQ_NORMALIZE.put("chequier", "chequebook");
        // Inline actions : le BQ brut inclut le nom complet de la classe parent
        BQ_NORMALIZE.put("command-chequier-enrg-commande", "order");
        BQ_NORMALIZE.put("command-chequier-suivi-commande", "tracking");
        BQ_NORMALIZE.put("command-chequier-history-cmd", "history");

        // Suffixes techniques → suppression (null = supprimer le BQ)
        BQ_NORMALIZE.put("orchestrateur", null);
        BQ_NORMALIZE.put("multicanal", null);
    }

    /**
     * Normalise un BQ brut en nom REST anglais standard.
     * Remplace les abreviations BOA, le jargon interne et le francais.
     * Retourne null si le BQ doit etre supprime (suffixe technique).
     */
    public String normalizeBehaviorQualifier(String rawBq) {
        if (rawBq == null) return null;
        String key = rawBq.toLowerCase();
        if (BQ_NORMALIZE.containsKey(key)) {
            return BQ_NORMALIZE.get(key);  // peut retourner null = suppression
        }
        return rawBq;
    }

    /**
     * Supprime les BQ redondants avec le Service Domain ou l'action. (FIX 1)
     * Exemples :
     *   risk-management dans domain risk-management → null
     *   notification dans action notification → null
     *   scoring dans domain loan → conserve (pas redondant)
     *
     * IMPORTANT : ne s'applique PAS aux handlers ActionHandler car leurs BQ
     * sont essentiels pour distinguer les endpoints dans un meme controller.
     */
    public String cleanBehaviorQualifier(String bq, String serviceDomain, String action) {
        if (bq == null || bq.isEmpty()) return null;

        String bqLower = bq.toLowerCase().replace("-", "");
        String domainLower = serviceDomain.toLowerCase().replace("-", "");

        // 1. BQ identique ou contenu dans le Service Domain → supprimer
        //    "risk-management" dans domain "risk-management" → null
        if (domainLower.contains(bqLower) || bqLower.contains(domainLower)) {
            return null;
        }

        // 2. BQ contient le nom du Service Domain → retirer la partie domain
        for (String domainWord : serviceDomain.split("-")) {
            if (domainWord.length() > 3 && bqLower.contains(domainWord.toLowerCase())) {
                bq = bq.replaceAll("(?i)-?" + domainWord + "-?", "").trim();
                // Nettoyer les tirets orphelins en debut/fin
                bq = bq.replaceAll("^-+|-+$", "").trim();
                if (bq.isEmpty()) return null;
            }
        }

        // 3. BQ identique à l'action → supprimer
        //    "notification" quand action = "notification" → null
        if (bq.toLowerCase().replace("-", "").equals(action.replace("-", ""))) {
            return null;
        }

        // 4. BQ contient des suffixes techniques → nettoyer
        bq = bq.replaceAll("(?i)-?(multicanal|orchestrateur|orchestrator|ejb|bean|impl|service)", "");
        if (bq.isEmpty() || bq.equals("-")) return null;

        return bq;
    }

    // ===================== VERBES POUR EXTRACTION BQ =====================

    private static final String[] ALL_VERBS = {
        // Formes nominales longues d'abord (pour eviter que "Consult" matche avant "Consultation")
        "Consultation", "Annulation", "Emission", "Modification",
        "Suppression", "Verification", "Activation", "Receptionner",
        // Formes verbales longues AVANT les courtes ("Modifier" avant "Modif", etc.)
        "Authentifier", "Modifier", "Consulter", "Controler", "Supprimer",
        "Annuler", "Verifier", "MadCore",
        // Formes courtes (matchent apres les longues)
        "Add", "Ajouter", "Ajout", "Charger",
        "Control", "Consult", "Get", "Is", "List", "Modif",
        "Supf", "Supp", "Traitement", "Traiter", "Auth",
        "Emit", "Emettre", "Activer", "Bloquer", "Ouvrir", "Cloturer",
        "Simuler", "Envoyer", "Generer", "Creer",
        "Executer", "Valider", "Approuver", "Rejeter", "Maj", "Scorer", "Notifier",
        "Virer", "Payer", "Debiter", "Crediter", "Convertir", "Filtrer",
        "Calculer", "Evaluer", "Estimer", "Archiver"
    };

    // ===================== AUTO-DETECTION PRINCIPALE =====================

    /**
     * Detecte automatiquement le mapping BIAN pour un UseCase donne.
     *
     * @param useCase le UseCase a analyser
     * @return le BianMapping detecte
     */
    public BianMapping autoDetect(UseCaseInfo useCase) {
        BianMapping mapping = new BianMapping();
        mapping.setUseCaseName(useCase.getClassName());
        mapping.setExplicit(false);

        // 1. Service Domain
        String serviceDomain = detectServiceDomain(useCase);
        mapping.setServiceDomain(serviceDomain);

        // 2. Action
        String action = detectAction(useCase);
        mapping.setAction(action);

        // 3. Behavior Qualifier
        String bqRaw = detectBehaviorQualifier(useCase, action);
        String bqNormalized = normalizeBehaviorQualifier(bqRaw);

        // FIX 1 : Nettoyer les BQ redondants UNIQUEMENT pour les EJB classiques (BaseUseCase).
        // Les handlers ActionHandler conservent leur BQ car il est essentiel
        // pour distinguer les 13+ endpoints dans un meme controller.
        boolean isActionHandler = useCase.getEjbPattern() != null
            && (useCase.getEjbPattern() == UseCaseInfo.EjbPattern.ACTION_HANDLER
                || useCase.getEjbPattern() == UseCaseInfo.EjbPattern.INLINE_ACTION);
        if (!isActionHandler) {
            bqNormalized = cleanBehaviorQualifier(bqNormalized, serviceDomain, action);
        }

        mapping.setBehaviorQualifier(bqNormalized);

        // 4. HTTP Method (derive de l'action)
        String httpMethod = switch (action) {
            case "control", "update", "termination" -> "PUT";
            default -> "POST";
        };
        mapping.setHttpMethod(httpMethod);

        // 5. HTTP Status
        int httpStatus = switch (action) {
            case "initiation", "notification" -> 201;
            default -> 200;
        };
        mapping.setHttpStatus(httpStatus);

        // 6. BIAN ID
        mapping.setBianId(guessBianId(serviceDomain));

        // 7. Summary
        mapping.setSummary(deriveSummary(useCase, action, serviceDomain));

        // 8. Construire les derives (URL, operationId, tag)
        mapping.buildUrl("/api/v1");
        mapping.buildOperationId();
        mapping.buildTagName();
        mapping.buildTagDescription();

        // 9. Log de confiance
        int confidence = calculateConfidence(useCase, mapping);
        log.info("[BIAN-AUTO] {} → {}/{}/{} (confiance: {}%)",
            useCase.getClassName(),
            mapping.getServiceDomain(),
            mapping.getAction(),
            mapping.getBehaviorQualifier() != null ? mapping.getBehaviorQualifier() : "-",
            confidence);

        return mapping;
    }

    // ===================== DETECTION SERVICE DOMAIN =====================

    /**
     * Detecte le Service Domain BIAN par scoring multi-criteres.
     * Analyse : nom UseCase + package + noms VoIn/VoOut.
     *
     * FIX 3 : Regle de priorite absolue — auth/token/login → TOUJOURS party.
     * L'authentification est toujours un concept 'party' dans BIAN.
     */
    public String detectServiceDomain(UseCaseInfo useCase) {
        // 1. Concatener : nom UseCase + package + noms VoIn/VoOut
        String haystack = buildHaystack(useCase);

        // FIX 3 : REGLE DE PRIORITE — auth/token/login → TOUJOURS party
        // Cette regle est AVANT le scoring pour eviter que 'auth' soit capte
        // par un autre domain comme channel-activity-analysis.
        if (haystack.contains("auth") || haystack.contains("token")
            || haystack.contains("login") || haystack.contains("session")
            || haystack.contains("jwt") || haystack.contains("otp")) {
            // Verifier qu'il ne s'agit pas d'un autre contexte dominant
            // (ex: "AuthorizePayment" devrait rester payment-initiation)
            // On ne force party QUE si aucun autre domain n'a un score >= 2
            int bestOtherScore = 0;
            String bestOtherDomain = null;
            for (var entry : DOMAIN_KEYWORDS.entrySet()) {
                String domain = entry.getValue();
                if ("party".equals(domain)) continue;  // skip party dans le scoring
                int score = 0;
                for (String keyword : entry.getKey()) {
                    if (haystack.contains(keyword)) score++;
                }
                if (score > bestOtherScore) {
                    bestOtherScore = score;
                    bestOtherDomain = domain;
                }
            }
            // Si aucun autre domain n'a un score fort (>= 2), c'est party
            if (bestOtherScore < 2) {
                return "party";
            }
            // Sinon, on laisse le scoring normal decider
        }

        // 2. Scorer chaque domain par nombre de keywords matches
        String bestDomain = null;
        int bestScore = 0;

        for (var entry : DOMAIN_KEYWORDS.entrySet()) {
            int score = 0;
            for (String keyword : entry.getKey()) {
                if (haystack.contains(keyword)) score++;
            }
            if (score > bestScore) {
                bestScore = score;
                bestDomain = entry.getValue();
            }
        }

        return bestDomain != null ? bestDomain : "service-domain";
    }

    // ===================== DETECTION ACTION =====================

    /**
     * Detecte l'action BIAN a partir du verbe dans le nom du UseCase.
     * Strategie : verbe exact > type de retour > presence VoIn > fallback.
     */
    public String detectAction(UseCaseInfo useCase) {
        String name = cleanName(useCase.getClassName());

        // 1. Chercher le verbe le plus specifique
        for (var entry : ACTION_VERBS.entrySet()) {
            for (String verb : entry.getValue()) {
                if (name.contains(verb)) {
                    return entry.getKey();
                }
            }
        }

        // 2. Analyse du type de retour (VoOut)
        if (useCase.getOutputDtoClassName() != null) {
            String outName = useCase.getOutputDtoClassName().toLowerCase();
            if (outName.contains("result") || outName.contains("simulation")) return "evaluation";
            if (outName.contains("statut") || outName.contains("status")) return "retrieval";
        }

        // 3. Analyse du VoIn — si pas de VoIn, c'est probablement du retrieval
        if (useCase.getInputDtoClassName() == null || useCase.getInputDtoClassName().isEmpty()) {
            return "retrieval";
        }

        // 4. Fallback
        return "execution";
    }

    // ===================== DETECTION BEHAVIOR QUALIFIER =====================

    /**
     * Detecte le Behavior Qualifier en retirant le verbe du nom du UseCase.
     * Ex: ActiverCarteUC → "carte" → "carte"
     *     ConsulterSoldeUC → "solde" → "solde"
     *     BloquerCarteUC → "carte" → "carte"
     */
    public String detectBehaviorQualifier(UseCaseInfo useCase, String action) {
        String name = useCase.getClassName()
            .replaceAll("(Handler|UC|UseCase|Bean|Impl|Service|EJB)$", "");

        // Retirer les verbes connus du debut
        String bq = name;
        for (String verb : ALL_VERBS) {
            if (bq.startsWith(verb)) {
                bq = bq.substring(verb.length());
                break;
            }
        }

        // Si le BQ est vide apres le retrait du verbe, utiliser le nom complet en kebab
        if (bq.isEmpty() || bq.equals(name)) {
            bq = name;
        }

        // Convertir en kebab-case (underscores → tirets pour les inline actions)
        String rawBq = bq.replaceAll("([a-z])([A-Z])", "$1-$2").replace('_', '-').toLowerCase();

        // Normaliser : jargon BOA → noms REST anglais
        return normalizeBehaviorQualifier(rawBq);
    }

    // ===================== BIAN ID =====================

    private String guessBianId(String serviceDomain) {
        return switch (serviceDomain) {
            case "card-management" -> "SD0070";
            case "current-account" -> "SD0152";
            case "savings-account" -> "SD0155";
            case "payment-initiation" -> "SD0249";
            case "party" -> "SD0254";
            case "loan" -> "SD0433";
            case "customer-notification" -> "SD0121";
            case "document-management" -> "SD0281";
            case "currency-exchange" -> "SD0159";
            case "regulatory-compliance" -> "SD0289";
            case "risk-management" -> "SD0434";
            case "product-directory" -> "SD0313";
            case "payment-order" -> "SD0250";
            default -> null;
        };
    }

    // ===================== SUMMARY =====================

    private String deriveSummary(UseCaseInfo useCase, String action, String serviceDomain) {
        String cleanName = useCase.getClassName()
            .replaceAll("(UC|UseCase|Bean|Impl|Service|EJB)$", "");
        String domainTitle = toTitleCase(serviceDomain);

        return switch (action) {
            case "initiation" -> "Initier une nouvelle instance de " + domainTitle + " (" + cleanName + ")";
            case "retrieval" -> "Consulter les informations de " + domainTitle + " (" + cleanName + ")";
            case "update" -> "Mettre a jour une instance de " + domainTitle + " (" + cleanName + ")";
            case "execution" -> "Executer l'operation " + cleanName + " sur " + domainTitle;
            case "termination" -> "Cloturer / Resilier une instance de " + domainTitle + " (" + cleanName + ")";
            case "evaluation" -> "Evaluer / Simuler une operation de " + domainTitle + " (" + cleanName + ")";
            case "notification" -> "Envoyer une notification via " + domainTitle + " (" + cleanName + ")";
            case "control" -> "Controler / Changer le statut de " + domainTitle + " (" + cleanName + ")";
            default -> "Operation " + cleanName + " sur " + domainTitle;
        };
    }

    // ===================== CONFIANCE =====================

    /**
     * Calcule le niveau de confiance de la detection (0-100%).
     *
     * 90%+ : le nom du UseCase contient un verbe exact ET un mot-cle du Service Domain
     * 70-89% : le package contient un mot-cle du Service Domain
     * 50-69% : seul le verbe est detecte, Service Domain devine par le package
     * <50% : fallback complet
     */
    public int calculateConfidence(UseCaseInfo useCase, BianMapping mapping) {
        int score = 0;
        String haystack = buildHaystack(useCase);
        String nameLower = cleanName(useCase.getClassName());

        // Verbe detecte dans le nom ?
        boolean verbFound = false;
        for (var entry : ACTION_VERBS.entrySet()) {
            if (entry.getKey().equals(mapping.getAction())) {
                for (String verb : entry.getValue()) {
                    if (nameLower.contains(verb)) {
                        verbFound = true;
                        break;
                    }
                }
            }
        }
        if (verbFound) score += 40;

        // Mot-cle du Service Domain dans le nom du UseCase ?
        boolean domainInName = false;
        for (var entry : DOMAIN_KEYWORDS.entrySet()) {
            for (String keyword : entry.getKey()) {
                if (nameLower.contains(keyword)) {
                    domainInName = true;
                    break;
                }
            }
            if (domainInName) break;
        }
        if (domainInName) score += 30;

        // Mot-cle du Service Domain dans le package ou VoIn/VoOut ?
        boolean domainInContext = false;
        String contextHaystack = "";
        if (useCase.getPackageName() != null) contextHaystack += useCase.getPackageName().toLowerCase() + " ";
        if (useCase.getInputDtoClassName() != null) contextHaystack += useCase.getInputDtoClassName().toLowerCase() + " ";
        if (useCase.getOutputDtoClassName() != null) contextHaystack += useCase.getOutputDtoClassName().toLowerCase();
        for (var entry : DOMAIN_KEYWORDS.entrySet()) {
            for (String keyword : entry.getKey()) {
                if (contextHaystack.contains(keyword)) {
                    domainInContext = true;
                    break;
                }
            }
            if (domainInContext) break;
        }
        if (domainInContext) score += 20;

        // BIAN ID connu ?
        if (mapping.getBianId() != null && !mapping.getBianId().isEmpty()) score += 10;

        return Math.min(score, 100);
    }

    // ===================== UTILITAIRES =====================

    private String buildHaystack(UseCaseInfo useCase) {
        StringBuilder sb = new StringBuilder();
        if (useCase.getClassName() != null) sb.append(useCase.getClassName()).append(" ");
        if (useCase.getPackageName() != null) sb.append(useCase.getPackageName()).append(" ");
        if (useCase.getInputDtoClassName() != null) sb.append(useCase.getInputDtoClassName()).append(" ");
        if (useCase.getOutputDtoClassName() != null) sb.append(useCase.getOutputDtoClassName()).append(" ");
        // Pour INLINE_ACTION : ajouter le nom de l'action et les noms des champs Envelope
        if (useCase.getActionName() != null) sb.append(useCase.getActionName()).append(" ");
        if (useCase.getEnvelopeFields() != null) {
            for (UseCaseInfo.EnvelopeFieldInfo f : useCase.getEnvelopeFields()) {
                sb.append(f.getFieldName()).append(" ");
            }
        }
        return sb.toString().toLowerCase();
    }

    private String cleanName(String name) {
        return name.replaceAll("(UC|UseCase|Bean|Impl|Service|EJB|Handler)$", "")
                   .replaceAll("(UC|UseCase|Bean|Impl|Service|EJB|Handler)$", "")
                   .toLowerCase();
    }

    private String toTitleCase(String kebab) {
        if (kebab == null || kebab.isEmpty()) return "";
        StringBuilder sb = new StringBuilder();
        for (String part : kebab.split("-")) {
            if (!part.isEmpty()) {
                if (sb.length() > 0) sb.append(" ");
                sb.append(Character.toUpperCase(part.charAt(0)));
                if (part.length() > 1) sb.append(part.substring(1));
            }
        }
        return sb.toString();
    }
}
