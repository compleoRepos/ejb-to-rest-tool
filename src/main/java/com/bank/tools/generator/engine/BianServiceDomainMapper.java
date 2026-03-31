package com.bank.tools.generator.engine;

import com.bank.tools.generator.model.UseCaseInfo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.*;

/**
 * Moteur de mapping BIAN (Banking Industry Architecture Network).
 * Analyse les noms des EJB et de leurs methodes pour deduire automatiquement
 * le Service Domain BIAN cible, le Control Record, les Behavior Qualifiers
 * et les Action Terms.
 *
 * Reference : BIAN Semantic API Practitioner Guide V8.1
 */
@Component
public class BianServiceDomainMapper {

    private static final Logger log = LoggerFactory.getLogger(BianServiceDomainMapper.class);

    // ===================== SERVICE DOMAIN CATALOG =====================

    /**
     * Catalogue des Service Domains BIAN avec leurs Control Records et patterns fonctionnels.
     */
    public static class ServiceDomainInfo {
        public final String domainName;        // ex: "current-account"
        public final String displayName;       // ex: "Current Account"
        public final String controlRecord;     // ex: "Current Account Facility"
        public final String crPlural;          // ex: "facilities"
        public final String functionalPattern; // ex: "FULFILL"
        public final List<String> keywords;    // mots-cles pour detection

        public ServiceDomainInfo(String domainName, String displayName, String controlRecord,
                                  String crPlural, String functionalPattern, List<String> keywords) {
            this.domainName = domainName;
            this.displayName = displayName;
            this.controlRecord = controlRecord;
            this.crPlural = crPlural;
            this.functionalPattern = functionalPattern;
            this.keywords = keywords;
        }
    }

    private static final List<ServiceDomainInfo> BIAN_CATALOG = new ArrayList<>();
    static {
        BIAN_CATALOG.add(new ServiceDomainInfo(
                "current-account", "Current Account",
                "Current Account Facility", "facilities", "FULFILL",
                Arrays.asList("account", "compte", "balance", "solde", "deposit", "withdrawal")));

        BIAN_CATALOG.add(new ServiceDomainInfo(
                "savings-account", "Savings Account",
                "Savings Account Facility", "facilities", "FULFILL",
                Arrays.asList("savings", "epargne", "saving")));

        BIAN_CATALOG.add(new ServiceDomainInfo(
                "party-reference-data-directory", "Party Reference Data Directory",
                "Directory Entry", "entries", "CATALOG",
                Arrays.asList("client", "customer", "party", "person", "tiers")));

        BIAN_CATALOG.add(new ServiceDomainInfo(
                "payment-execution", "Payment Execution",
                "Payment Execution Procedure", "procedures", "PROCESS",
                Arrays.asList("payment", "paiement", "transfer", "virement", "transaction")));

        BIAN_CATALOG.add(new ServiceDomainInfo(
                "payment-order", "Payment Order",
                "Payment Order Procedure", "procedures", "PROCESS",
                Arrays.asList("paymentorder", "ordrepaiement")));

        BIAN_CATALOG.add(new ServiceDomainInfo(
                "customer-event-history", "Customer Event History",
                "Customer Event Log", "entries", "TRACK",
                Arrays.asList("notification", "alert", "event", "message", "sms", "email")));

        BIAN_CATALOG.add(new ServiceDomainInfo(
                "loan", "Loan",
                "Loan Facility", "facilities", "FULFILL",
                Arrays.asList("loan", "pret", "credit", "emprunt", "lending", "simulation")));

        BIAN_CATALOG.add(new ServiceDomainInfo(
                "customer-behavioral-insights", "Customer Behavioral Insights",
                "Customer Behavioral Analysis", "analyses", "ANALYSE",
                Arrays.asList("report", "rapport", "dashboard", "tableau", "statement", "releve", "export", "csv")));

        BIAN_CATALOG.add(new ServiceDomainInfo(
                "card-authorization", "Card Authorization",
                "Credit/Charge Card Financial Capture Transaction", "transactions", "PROCESS",
                Arrays.asList("card", "carte", "authorization", "autorisation")));

        BIAN_CATALOG.add(new ServiceDomainInfo(
                "fraud-detection", "Fraud Detection",
                "Fraud Detection Analysis", "analyses", "ANALYSE",
                Arrays.asList("fraud", "fraude", "suspicious", "detection")));

        BIAN_CATALOG.add(new ServiceDomainInfo(
                "compliance", "Compliance",
                "Compliance Assessment", "assessments", "ASSESS",
                Arrays.asList("compliance", "conformite", "kyc", "aml", "regulation")));

        BIAN_CATALOG.add(new ServiceDomainInfo(
                "product-directory", "Product Directory",
                "Product/Service", "entries", "CATALOG",
                Arrays.asList("product", "produit", "catalog", "catalogue", "offer", "offre")));
    }

    // ===================== ACTION TERM MAPPING =====================

    /**
     * Mapping des verbes Java vers les Action Terms BIAN.
     */
    public static class BianActionTerm {
        public final String actionTerm;    // ex: "Retrieve", "Initiate", "Update"
        public final String httpMethod;    // ex: "GET", "POST", "PUT"
        public final String urlSuffix;     // ex: "", "/initiation", "/execution"

        public BianActionTerm(String actionTerm, String httpMethod, String urlSuffix) {
            this.actionTerm = actionTerm;
            this.httpMethod = httpMethod;
            this.urlSuffix = urlSuffix;
        }
    }

    private static final Map<String, BianActionTerm> VERB_TO_ACTION_TERM = new LinkedHashMap<>();
    static {
        // Retrieve (GET)
        VERB_TO_ACTION_TERM.put("find", new BianActionTerm("Retrieve", "GET", ""));
        VERB_TO_ACTION_TERM.put("get", new BianActionTerm("Retrieve", "GET", ""));
        VERB_TO_ACTION_TERM.put("retrieve", new BianActionTerm("Retrieve", "GET", ""));
        VERB_TO_ACTION_TERM.put("list", new BianActionTerm("Retrieve", "GET", ""));
        VERB_TO_ACTION_TERM.put("search", new BianActionTerm("Retrieve", "GET", ""));
        VERB_TO_ACTION_TERM.put("count", new BianActionTerm("Retrieve", "GET", ""));
        VERB_TO_ACTION_TERM.put("is", new BianActionTerm("Retrieve", "GET", ""));
        VERB_TO_ACTION_TERM.put("has", new BianActionTerm("Retrieve", "GET", ""));
        VERB_TO_ACTION_TERM.put("check", new BianActionTerm("Retrieve", "GET", ""));
        VERB_TO_ACTION_TERM.put("exists", new BianActionTerm("Retrieve", "GET", ""));
        VERB_TO_ACTION_TERM.put("export", new BianActionTerm("Retrieve", "GET", ""));
        VERB_TO_ACTION_TERM.put("generate", new BianActionTerm("Retrieve", "GET", ""));
        VERB_TO_ACTION_TERM.put("download", new BianActionTerm("Retrieve", "GET", ""));

        // Initiate (POST)
        VERB_TO_ACTION_TERM.put("create", new BianActionTerm("Initiate", "POST", "/initiation"));
        VERB_TO_ACTION_TERM.put("initiate", new BianActionTerm("Initiate", "POST", "/initiation"));
        VERB_TO_ACTION_TERM.put("open", new BianActionTerm("Initiate", "POST", "/initiation"));
        VERB_TO_ACTION_TERM.put("register", new BianActionTerm("Initiate", "POST", "/initiation"));
        VERB_TO_ACTION_TERM.put("add", new BianActionTerm("Initiate", "POST", "/initiation"));
        VERB_TO_ACTION_TERM.put("save", new BianActionTerm("Initiate", "POST", "/initiation"));

        // Update (PUT)
        VERB_TO_ACTION_TERM.put("update", new BianActionTerm("Update", "PUT", ""));
        VERB_TO_ACTION_TERM.put("modify", new BianActionTerm("Update", "PUT", ""));
        VERB_TO_ACTION_TERM.put("change", new BianActionTerm("Update", "PUT", ""));
        VERB_TO_ACTION_TERM.put("set", new BianActionTerm("Update", "PUT", ""));
        VERB_TO_ACTION_TERM.put("edit", new BianActionTerm("Update", "PUT", ""));

        // Control (PUT + /control)
        VERB_TO_ACTION_TERM.put("close", new BianActionTerm("Control", "PUT", "/control"));
        VERB_TO_ACTION_TERM.put("suspend", new BianActionTerm("Control", "PUT", "/control"));
        VERB_TO_ACTION_TERM.put("activate", new BianActionTerm("Control", "PUT", "/control"));
        VERB_TO_ACTION_TERM.put("deactivate", new BianActionTerm("Control", "PUT", "/control"));
        VERB_TO_ACTION_TERM.put("block", new BianActionTerm("Control", "PUT", "/control"));
        VERB_TO_ACTION_TERM.put("cancel", new BianActionTerm("Control", "PUT", "/control"));
        VERB_TO_ACTION_TERM.put("terminate", new BianActionTerm("Control", "PUT", "/control"));
        VERB_TO_ACTION_TERM.put("reject", new BianActionTerm("Control", "PUT", "/control"));
        VERB_TO_ACTION_TERM.put("approve", new BianActionTerm("Control", "PUT", "/control"));

        // Execute (PUT + /execution)
        VERB_TO_ACTION_TERM.put("execute", new BianActionTerm("Execute", "PUT", "/execution"));
        VERB_TO_ACTION_TERM.put("process", new BianActionTerm("Execute", "PUT", "/execution"));
        VERB_TO_ACTION_TERM.put("run", new BianActionTerm("Execute", "PUT", "/execution"));
        VERB_TO_ACTION_TERM.put("transfer", new BianActionTerm("Execute", "PUT", "/execution"));
        VERB_TO_ACTION_TERM.put("send", new BianActionTerm("Execute", "PUT", "/execution"));
        VERB_TO_ACTION_TERM.put("submit", new BianActionTerm("Execute", "PUT", "/execution"));
        VERB_TO_ACTION_TERM.put("pay", new BianActionTerm("Execute", "PUT", "/execution"));
        VERB_TO_ACTION_TERM.put("validate", new BianActionTerm("Execute", "PUT", "/execution"));

        // Capture (PUT + /capture)
        VERB_TO_ACTION_TERM.put("record", new BianActionTerm("Capture", "PUT", "/capture"));
        VERB_TO_ACTION_TERM.put("log", new BianActionTerm("Capture", "PUT", "/capture"));
        VERB_TO_ACTION_TERM.put("capture", new BianActionTerm("Capture", "PUT", "/capture"));

        // Delete (DELETE)
        VERB_TO_ACTION_TERM.put("delete", new BianActionTerm("Terminate", "DELETE", ""));
        VERB_TO_ACTION_TERM.put("remove", new BianActionTerm("Terminate", "DELETE", ""));
    }

    // ===================== BEHAVIOR QUALIFIER DETECTION =====================

    private static final Map<String, String> BEHAVIOR_QUALIFIERS = new LinkedHashMap<>();
    static {
        // Account-related BQs
        BEHAVIOR_QUALIFIERS.put("balance", "balances");
        BEHAVIOR_QUALIFIERS.put("payment", "payments");
        BEHAVIOR_QUALIFIERS.put("transaction", "payments");
        BEHAVIOR_QUALIFIERS.put("transfer", "payments");
        BEHAVIOR_QUALIFIERS.put("statement", "statements");
        BEHAVIOR_QUALIFIERS.put("fee", "fees");
        BEHAVIOR_QUALIFIERS.put("interest", "interest");
        BEHAVIOR_QUALIFIERS.put("standing", "standing-orders");
        BEHAVIOR_QUALIFIERS.put("direct", "direct-debits");
        BEHAVIOR_QUALIFIERS.put("overdraft", "overdraft");

        // Client-related BQs
        BEHAVIOR_QUALIFIERS.put("address", "addresses");
        BEHAVIOR_QUALIFIERS.put("contact", "contacts");
        BEHAVIOR_QUALIFIERS.put("preference", "preferences");
        BEHAVIOR_QUALIFIERS.put("notification", "notifications");
        BEHAVIOR_QUALIFIERS.put("document", "documents");

        // Loan-related BQs
        BEHAVIOR_QUALIFIERS.put("repayment", "repayments");
        BEHAVIOR_QUALIFIERS.put("collateral", "collateral");
        BEHAVIOR_QUALIFIERS.put("installment", "installments");
        BEHAVIOR_QUALIFIERS.put("disbursement", "disbursements");
        BEHAVIOR_QUALIFIERS.put("simulation", "simulations");

        // Report-related BQs
        BEHAVIOR_QUALIFIERS.put("portfolio", "portfolio");
        BEHAVIOR_QUALIFIERS.put("dashboard", "dashboard");
        BEHAVIOR_QUALIFIERS.put("csv", "exports");
        BEHAVIOR_QUALIFIERS.put("export", "exports");
    }

    // ===================== PUBLIC API =====================

    /**
     * Resultat du mapping BIAN pour un EJB complet.
     */
    public static class BianMapping {
        public ServiceDomainInfo serviceDomain;
        public String baseUrl;                    // ex: "/current-account/facilities"
        public Map<String, BianMethodMapping> methodMappings = new LinkedHashMap<>();
        public boolean isBianCompliant = false;
    }

    /**
     * Resultat du mapping BIAN pour une methode individuelle.
     */
    public static class BianMethodMapping {
        public String methodName;
        public BianActionTerm actionTerm;
        public String behaviorQualifier;          // null si CR-level
        public String fullUrl;                    // ex: "/{cr-id}/payments/execution"
        public String httpMethod;
        public String springAnnotation;
    }

    /**
     * Analyse un UseCase (EJB) et produit le mapping BIAN complet.
     */
    public BianMapping mapToBian(UseCaseInfo useCase) {
        BianMapping result = new BianMapping();

        // 1. Identifier le Service Domain
        result.serviceDomain = identifyServiceDomain(useCase);
        if (result.serviceDomain == null) {
            log.warn("[BIAN] Aucun Service Domain identifie pour : {}", useCase.getClassName());
            return result;
        }

        result.isBianCompliant = true;
        result.baseUrl = "/" + result.serviceDomain.domainName + "/" + result.serviceDomain.crPlural;
        log.info("[BIAN] {} → Service Domain: {} ({})",
                useCase.getClassName(), result.serviceDomain.displayName, result.baseUrl);

        // 2. Mapper chaque methode
        for (UseCaseInfo.MethodInfo method : useCase.getPublicMethods()) {
            BianMethodMapping mm = mapMethod(method, result.serviceDomain);
            result.methodMappings.put(method.getName(), mm);
            log.debug("[BIAN]   {} → {} {} {}",
                    method.getName(), mm.httpMethod, mm.fullUrl, mm.actionTerm.actionTerm);
        }

        return result;
    }

    // ===================== PRIVATE METHODS =====================

    /**
     * Identifie le Service Domain BIAN a partir du nom de l'EJB et de ses methodes.
     */
    private ServiceDomainInfo identifyServiceDomain(UseCaseInfo useCase) {
        String className = useCase.getClassName().toLowerCase();
        String allMethods = useCase.getPublicMethods().stream()
                .map(m -> m.getName().toLowerCase())
                .collect(java.util.stream.Collectors.joining(" "));
        String combined = className + " " + allMethods;

        ServiceDomainInfo bestMatch = null;
        int bestScore = 0;

        for (ServiceDomainInfo sd : BIAN_CATALOG) {
            int score = 0;
            for (String keyword : sd.keywords) {
                if (className.contains(keyword)) score += 10;  // Forte correspondance sur le nom de classe
                if (allMethods.contains(keyword)) score += 3;  // Correspondance sur les methodes
            }
            if (score > bestScore) {
                bestScore = score;
                bestMatch = sd;
            }
        }

        return bestScore >= 3 ? bestMatch : null;
    }

    /**
     * Mappe une methode individuelle vers un Action Term BIAN et detecte le Behavior Qualifier.
     */
    private BianMethodMapping mapMethod(UseCaseInfo.MethodInfo method, ServiceDomainInfo sd) {
        BianMethodMapping mm = new BianMethodMapping();
        mm.methodName = method.getName();

        // 1. Identifier l'Action Term via le verbe de la methode
        mm.actionTerm = identifyActionTerm(method.getName());

        // 2. Detecter le Behavior Qualifier
        mm.behaviorQualifier = detectBehaviorQualifier(method.getName());

        // 3. Construire l'URL BIAN
        boolean hasIdParam = method.getParameters().stream()
                .anyMatch(p -> p.getName().toLowerCase().equals("id")
                        || p.getName().toLowerCase().endsWith("id")
                        || p.getName().toLowerCase().endsWith("number")
                        || p.getName().toLowerCase().endsWith("code"));

        StringBuilder url = new StringBuilder();

        if (hasIdParam) {
            String idParam = getIdParamName(method);
            url.append("/{").append(idParam).append("}");
        }

        if (mm.behaviorQualifier != null) {
            url.append("/").append(mm.behaviorQualifier);
        }

        // Ajouter le suffixe d'action BIAN si applicable
        if (!mm.actionTerm.urlSuffix.isEmpty()) {
            url.append(mm.actionTerm.urlSuffix);
        }

        mm.fullUrl = url.toString();
        mm.httpMethod = mm.actionTerm.httpMethod;
        mm.springAnnotation = httpToSpringAnnotation(mm.httpMethod);

        return mm;
    }

    /**
     * Identifie l'Action Term BIAN a partir du nom de la methode Java.
     */
    private BianActionTerm identifyActionTerm(String methodName) {
        String lower = methodName.toLowerCase();

        for (Map.Entry<String, BianActionTerm> entry : VERB_TO_ACTION_TERM.entrySet()) {
            if (lower.startsWith(entry.getKey())) {
                return entry.getValue();
            }
        }

        // Par defaut : Retrieve (GET)
        return new BianActionTerm("Retrieve", "GET", "");
    }

    /**
     * Detecte si la methode cible un Behavior Qualifier specifique.
     */
    private String detectBehaviorQualifier(String methodName) {
        String lower = methodName.toLowerCase();

        for (Map.Entry<String, String> entry : BEHAVIOR_QUALIFIERS.entrySet()) {
            if (lower.contains(entry.getKey())) {
                return entry.getValue();
            }
        }

        return null;
    }

    private String getIdParamName(UseCaseInfo.MethodInfo method) {
        return method.getParameters().stream()
                .filter(p -> {
                    String n = p.getName().toLowerCase();
                    return n.equals("id") || n.endsWith("id") || n.endsWith("number") || n.endsWith("code");
                })
                .map(UseCaseInfo.ParameterInfo::getName)
                .findFirst()
                .orElse("cr-reference-id");
    }

    private String httpToSpringAnnotation(String httpMethod) {
        return switch (httpMethod) {
            case "GET" -> "GetMapping";
            case "POST" -> "PostMapping";
            case "PUT" -> "PutMapping";
            case "DELETE" -> "DeleteMapping";
            case "PATCH" -> "PatchMapping";
            default -> "GetMapping";
        };
    }
}
