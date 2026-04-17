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
            "edition", "impression", "courrier", "archivage"), "document-management");

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
            "get", "find", "fetch", "load", "read", "search", "list",
            "afficher", "visualiser", "recuperer", "extraire", "generer",
            "hist", "historique", "isbenef", "eligibilite",
            "is", "existe"  // IsBenefEnregistrer = verification/consultation
        ));

        // INITIATION — Creer une nouvelle ressource (POST, pas de {cr-ref-id}, 201)
        ACTION_VERBS.put("initiation", List.of(
            "ouvrir", "creer", "create", "add", "register", "open",
            "souscrire", "initier", "demander", "enregistrer", "inscrire",
            "virement", "virer", "transferer", "transfer",
            "ajout", "ajouter", "emission", "emettre", "emit",
            "traitement"  // TraitementMad = creation d'une mise a disposition
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

    // ===================== VERBES POUR EXTRACTION BQ =====================

    private static final String[] ALL_VERBS = {
        // Prefixes longs d'abord (pour eviter que "Consult" matche avant "Consultation")
        "Consultation", "Annulation", "Emission", "Modification",
        "Suppression", "Verification", "Activation", "MadCore",
        // Verbes courts
        "Add", "Ajouter", "Ajout", "Annuler", "Consulter", "Charger",
        "Control", "Controler", "Get", "Is", "List", "Modif", "Modifier",
        "Supf", "Supprimer", "Traitement", "Traiter", "Auth", "Authentifier",
        "Emit", "Emettre", "Activer", "Bloquer", "Ouvrir", "Cloturer",
        "Simuler", "Envoyer", "Generer", "Receptionner", "Creer", "Verifier",
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
        String bq = detectBehaviorQualifier(useCase, action);
        mapping.setBehaviorQualifier(bq);

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
     */
    public String detectServiceDomain(UseCaseInfo useCase) {
        // 1. Concatener : nom UseCase + package + noms VoIn/VoOut
        String haystack = buildHaystack(useCase);

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

        // Convertir en kebab-case
        return bq.replaceAll("([a-z])([A-Z])", "$1-$2").toLowerCase();
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
        if (useCase.getOutputDtoClassName() != null) sb.append(useCase.getOutputDtoClassName());
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
