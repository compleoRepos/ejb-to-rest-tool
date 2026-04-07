package com.bank.tools.generator.bian;

import com.bank.tools.generator.engine.util.CodeGenUtils;

/**
 * Represente le mapping BIAN d'un UseCase vers un Service Domain.
 *
 * Contient toutes les informations necessaires pour generer
 * les URLs, controllers et documentation Swagger conformes BIAN.
 */
public class BianMapping {

    private String useCaseName;
    private String serviceDomain;       // ex: "current-account"
    private String serviceDomainTitle;   // ex: "Current Account"
    private String bianId;              // ex: "SD0152"
    private String behaviorQualifier;   // ex: "balance", "transaction", "activation"
    private String action;              // ex: "retrieval", "initiation", "execution"
    private String url;                 // ex: "/current-account/{cr-reference-id}/balance/retrieval"
    private String httpMethod;          // ex: "GET", "POST", "PUT"
    private int httpStatus;             // ex: 200, 201
    private String summary;             // ex: "Consultation du solde d'un compte"
    private String operationId;         // ex: "retrieveCurrentAccountBalance"
    private boolean explicit;           // true si mapping explicite (YAML), false si auto-mapping
    private String controllerName;      // ex: "CurrentAccountController"
    private String tagName;             // ex: "Current Account"
    private String tagDescription;      // ex: "BIAN SD0152 — Gestion des comptes courants"

    public BianMapping() {}

    public BianMapping(String serviceDomain, String action, String behaviorQualifier) {
        this.serviceDomain = serviceDomain;
        this.action = action;
        this.behaviorQualifier = behaviorQualifier;
        this.serviceDomainTitle = toTitleCase(serviceDomain);
    }

            // ===================== BUILDERS =====================

            /**
             * Construit l'URL BIAN a partir du mapping.
             */
          public String buildUrl(String basePath) {
            
            StringBuilder url = new StringBuilder(basePath);
            url.append("/").append(serviceDomain);
            
            String action = getAction();
            // Actions sans {cr-reference-id}
            if ("initiation".equals(action) || "evaluation".equals(action) || "notification".equals(action)) {
                url.append("/").append(action);
            } else {
                url.append("/{cr-reference-id}");
                if (behaviorQualifier != null && !behaviorQualifier.isEmpty()) {
                    url.append("/").append(behaviorQualifier);
                }
                url.append("/").append(action);
            }
            return url.toString();
        }
    /**
     * Construit l'operationId BIAN : {action}{ServiceDomain}{BQ}
     */
    public String buildOperationId() {
        if (this.operationId != null && !this.operationId.isEmpty()) {
            return this.operationId;
        }

        StringBuilder sb = new StringBuilder();
        sb.append(actionToVerb(action));
        sb.append(CodeGenUtils.toPascalCase(serviceDomain));
        if (behaviorQualifier != null && !behaviorQualifier.isEmpty()) {
            sb.append(CodeGenUtils.toPascalCase(behaviorQualifier));
        }

        this.operationId = sb.toString();
        return this.operationId;
    }

    /**
     * Construit le nom du controller BIAN.
     */
    public String buildControllerName() {
        if (this.controllerName != null && !this.controllerName.isEmpty()) {
            return this.controllerName;
        }

        StringBuilder sb = new StringBuilder();
        sb.append(CodeGenUtils.toPascalCase(serviceDomain));
        if (behaviorQualifier != null && !behaviorQualifier.isEmpty()) {
            sb.append(CodeGenUtils.toPascalCase(behaviorQualifier));
        }
        sb.append("Controller");

        this.controllerName = sb.toString();
        return this.controllerName;
    }

    /**
     * Construit le @Tag Swagger BIAN.
     */
    public String buildTagName() {
        if (this.tagName != null && !this.tagName.isEmpty()) {
            return this.tagName;
        }

        this.tagName = toTitleCase(serviceDomain);
        if (behaviorQualifier != null && !behaviorQualifier.isEmpty()) {
            this.tagName += " - " + toTitleCase(behaviorQualifier);
        }
        return this.tagName;
    }

    /**
     * Construit la description du @Tag Swagger BIAN.
     */
    public String buildTagDescription() {
        if (this.tagDescription != null && !this.tagDescription.isEmpty()) {
            return this.tagDescription;
        }

        StringBuilder sb = new StringBuilder("BIAN ");
        if (bianId != null && !bianId.isEmpty()) {
            sb.append(bianId).append(" — ");
        }
        sb.append(toTitleCase(serviceDomain));
        if (summary != null && !summary.isEmpty()) {
            sb.append(" : ").append(summary);
        }

        this.tagDescription = sb.toString();
        return this.tagDescription;
    }

    // ===================== UTILITAIRES =====================

    private String actionToVerb(String action) {
        if (action == null) return "execute";
        return switch (action) {
            case "initiation" -> "initiate";
            case "retrieval" -> "retrieve";
            case "update" -> "update";
            case "execution" -> "execute";
            case "termination" -> "terminate";
            case "evaluation" -> "evaluate";
            case "notification" -> "notify";
            case "control" -> "control";
            case "request" -> "request";
            case "exchange" -> "exchange";
            case "grant" -> "grant";
            default -> action;
        };
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

    // ===================== GETTERS / SETTERS =====================

    public String getUseCaseName() { return useCaseName; }
    public void setUseCaseName(String useCaseName) { this.useCaseName = useCaseName; }

    public String getServiceDomain() { return serviceDomain; }
    public void setServiceDomain(String serviceDomain) {
        this.serviceDomain = serviceDomain;
        this.serviceDomainTitle = toTitleCase(serviceDomain);
    }

    public String getServiceDomainTitle() { return serviceDomainTitle; }

    public String getBianId() { return bianId; }
    public void setBianId(String bianId) { this.bianId = bianId; }

    public String getBehaviorQualifier() { return behaviorQualifier; }
    public void setBehaviorQualifier(String behaviorQualifier) { this.behaviorQualifier = behaviorQualifier; }

    public String getAction() { return action; }
    public void setAction(String action) { this.action = action; }

    public String getUrl() { return url; }
    public void setUrl(String url) { this.url = url; }

    public String getHttpMethod() { return httpMethod; }
    public void setHttpMethod(String httpMethod) { this.httpMethod = httpMethod; }

    public int getHttpStatus() { return httpStatus; }
    public void setHttpStatus(int httpStatus) { this.httpStatus = httpStatus; }

    public String getSummary() { return summary; }
    public void setSummary(String summary) { this.summary = summary; }

    public String getOperationId() { return operationId; }
    public void setOperationId(String operationId) { this.operationId = operationId; }

    public boolean isExplicit() { return explicit; }
    public void setExplicit(boolean explicit) { this.explicit = explicit; }

    public String getControllerName() { return controllerName; }
    public void setControllerName(String controllerName) { this.controllerName = controllerName; }

    public String getTagName() { return tagName; }
    public void setTagName(String tagName) { this.tagName = tagName; }

    public String getTagDescription() { return tagDescription; }
    public void setTagDescription(String tagDescription) { this.tagDescription = tagDescription; }

    @Override
    public String toString() {
        return String.format("BianMapping{useCase='%s', domain='%s' (%s), bq='%s', action='%s', url='%s', http=%s %d}",
                useCaseName, serviceDomain, bianId, behaviorQualifier, action, url, httpMethod, httpStatus);
    }
}
